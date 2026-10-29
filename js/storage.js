/* Сохранность данных нового приложения. Без DOM: хранилище (ls) и fetch передаются снаружи, поэтому всё тестируется в Node.
   ls = {getItem, setItem, removeItem}. Данные пользователя молча не заменяются: перед любой подменой — точка отката,
   облако перезаписывается только если оно не менялось с последней синхронизации (или явно force). */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, St = SM.store = {};
  St.KEY = 'stroysmeta:model'; St.SNAPKEY = 'stroysmeta:model:snaps'; St.SYNCKEY = 'stroysmeta:model:sync';
  St.GFILE = 'stroysmeta-model.json'; St.MAX_SNAPS = 10; St.SNAP_EVERY = 5 * 60e3;

  St.memStorage = () => { const m = {}; return {getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, _m: m}; };

  St.fresh = () => St.withTypes({object: SM.seeds.bathroom(), library: SM.seeds.library(), routes: [], pauses: [], techs: [], materials: [], plan: [], approved: [], techVersions: {}, wallTypes: [],
    fin: {waste: 0, reserve: 0, overhead: 0, discount: 0, vat: 0}, bought: {}});
  St.withTypes = S => { if (SM.walls) SM.walls.ensureTypes(S); if (SM.layers) SM.layers.ensureTypes(S); return S; };

  /* Приводит проект к текущей схеме. Неизвестные поля сохраняются. Схема из будущего — ошибка (из model.migrate). */
  St.normalize = d => {
    if (!d || typeof d !== 'object' || Array.isArray(d) || !d.object || typeof d.object !== 'object') throw new Error('это не файл проекта «Помощника строителя»');
    d.object = SM.model.migrate(d.object); d.library = SM.seeds.upgradeLibrary(d.library);
    for (const k of ['routes', 'pauses', 'techs', 'materials', 'plan', 'approved']) if (!Array.isArray(d[k])) d[k] = [];
    d.techVersions = d.techVersions && typeof d.techVersions === 'object' ? d.techVersions : {}; if (SM.ver) SM.ver.pinAll(d);
    d.fin = d.fin || {waste: 0, reserve: 0, overhead: 0, discount: 0, vat: 0}; d.bought = d.bought || {};
    d.wallTypes = Array.isArray(d.wallTypes) ? d.wallTypes : []; St.withTypes(d);
    return d;
  };
  St.parse = text => { let d; try { d = JSON.parse(text); } catch (e) { throw new Error('файл повреждён или это не JSON'); } return St.normalize(d); };
  St.toJson = S => JSON.stringify(S, null, 1);

  /* load: данные не тронуты при любой ошибке. Копия сырого текста — в KEY:backup (до миграции). */
  St.load = ls => {
    const raw = ls.getItem(St.KEY);
    if (!raw) return {S: St.fresh(), isNew: true};
    const S = St.parse(raw); ls.setItem(St.KEY + ':backup', raw);
    return {S, isNew: false};
  };
  /* save: ставит штамп времени и пишет. Не бросает: при нехватке места главные данные важнее откатов. */
  St.save = (ls, S, o = {}) => {
    if (!o.keepStamp) S.updated = Date.now();
    try { ls.setItem(St.KEY, JSON.stringify(S)); } catch (e) { return {ok: false, error: e.message}; }
    St.snap(ls, S, false); return {ok: true};
  };

  /* Точки отката: не чаще раза в 5 минут (или force), последние MAX_SNAPS. При нехватке места выбрасываем старые, а не все. */
  St.snaps = ls => { try { const a = JSON.parse(ls.getItem(St.SNAPKEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  St.snap = (ls, S, force, now = Date.now()) => {
    const arr = St.snaps(ls), last = arr[arr.length - 1];
    if (!force && last && now - last.t < St.SNAP_EVERY) return false;
    arr.push({t: now, d: JSON.stringify(S)}); while (arr.length > St.MAX_SNAPS) arr.shift();
    while (arr.length) { try { ls.setItem(St.SNAPKEY, JSON.stringify(arr)); return true; } catch (e) { arr.shift(); } }
    return false;
  };
  St.snapData = (ls, i) => { const x = St.snaps(ls)[i]; if (!x) throw new Error('точка отката не найдена'); return St.parse(x.d); };

  /* Замена текущих данных чужими (откат, файл, облако): сначала точка отката текущих, потом запись. */
  St.replace = (ls, cur, next, o = {}) => { if (cur) St.snap(ls, cur, true); return St.save(ls, next, o).ok ? next : (() => { throw new Error('не удалось сохранить: нет места в браузере'); })(); };

  /* ---------- Облако: приватный GitHub Gist ---------- */
  St.cfg = ls => { try { return JSON.parse(ls.getItem(St.SYNCKEY)) || {}; } catch (e) { return {}; } };   // токен только здесь, в проект и экспорт не попадает
  St.setCfg = (ls, c) => ls.setItem(St.SYNCKEY, JSON.stringify(c));
  /* Решение по состоянию (чистая функция): same / push / pull / conflict. pull и conflict без подтверждения человека не применяются. */
  St.decide = (S, remote, cfg) => {
    if (!remote) return 'push';
    const ls = cfg.lastSync || 0, ru = remote.updated || 0, lu = S.updated || 0;
    if (ru === lu) return 'same';
    if (!ls) return 'conflict';              // первое подключение: оба варианта могут быть ценными
    const rNew = ru > ls, lNew = lu > ls;
    return rNew && lNew ? 'conflict' : rNew ? 'pull' : lNew ? 'push' : 'same';
  };
  St.cloud = (ls, fetchFn) => {
    const api = {};
    const gh = async (method, url, body) => {
      const r = await fetchFn('https://api.github.com' + url, {method, headers: Object.assign({Authorization: 'Bearer ' + St.cfg(ls).token, Accept: 'application/vnd.github+json'}, body ? {'Content-Type': 'application/json'} : {}), body: body ? JSON.stringify(body) : undefined});
      if (!r.ok) throw new Error(r.status === 401 ? 'токен не подошёл (401)' : r.status === 404 ? 'не найдено (404)' : 'ошибка GitHub ' + r.status);
      return r.json();
    };
    api.find = async () => (await gh('GET', '/gists?per_page=100')).find(g => g.files && g.files[St.GFILE]);
    api.read = async id => { const g = await gh('GET', '/gists/' + id), f = g.files && g.files[St.GFILE]; if (!f) throw new Error('в облаке нет файла данных');
      return St.parse(f.truncated ? await (await fetchFn(f.raw_url)).text() : f.content); };
    /* Проверка «облако не менялось» — внутри push; force только по явному решению человека. */
    api.push = async (S, o = {}) => {
      const c = St.cfg(ls); if (!c.token) throw new Error('облако не подключено');
      if (c.gistId && !o.force) { const r = await api.read(c.gistId); if (St.decide(S, r, c) !== 'push' && St.decide(S, r, c) !== 'same') { const e = new Error('в облаке более новые данные — перезапись не выполнена'); e.conflict = true; throw e; } }
      const files = {[St.GFILE]: {content: JSON.stringify(S)}};
      if (c.gistId) await gh('PATCH', '/gists/' + c.gistId, {files});
      else c.gistId = (await gh('POST', '/gists', {description: 'Помощник строителя — данные (не удалять)', public: false, files})).id;
      c.lastSync = S.updated || 0; St.setCfg(ls, c); return c.gistId;
    };
    /* Дополнительные файлы в том же приватном Gist (например, справочник). PATCH другие файлы Gist не затрагивает. */
    api.putFile = async (name, text) => { const c = St.cfg(ls); if (!c.token || !c.gistId) throw new Error('облако не подключено'); await gh('PATCH', '/gists/' + c.gistId, {files: {[name]: {content: String(text)}}}); };
    api.getFile = async name => { const c = St.cfg(ls); if (!c.token || !c.gistId) throw new Error('облако не подключено'); const g = await gh('GET', '/gists/' + c.gistId), f = g.files && g.files[name];
      return f ? (f.truncated ? await (await fetchFn(f.raw_url)).text() : f.content) : null; };
    /* Сверка: ничего не меняет у человека. Возвращает {action, remote}. push выполняется здесь (облако старше и не менялось). */
    api.check = async S => {
      const c = St.cfg(ls); if (!c.token) return {action: 'off'};
      if (!c.gistId) { const g = await api.find(); if (!g) { await api.push(S); return {action: 'pushed'}; } c.gistId = g.id; St.setCfg(ls, c); }
      const remote = await api.read(c.gistId), a = St.decide(S, remote, c);
      if (a === 'push') { await api.push(S, {force: true}); return {action: 'pushed'}; }
      if (a === 'same') { c.lastSync = S.updated || 0; St.setCfg(ls, c); }
      return {action: a, remote};
    };
    /* Человек выбрал «взять облако»: точка отката текущих, затем запись; lastSync = штамп облачных данных. */
    api.adopt = (cur, remote) => { const S = St.replace(ls, cur, remote, {keepStamp: true}), c = St.cfg(ls); c.lastSync = S.updated || 0; St.setCfg(ls, c); return S; };
    return api;
  };

  /* ---------- Листы Excel (чистые данные; файл пишет UI через XLSX) ---------- */
  const c = v => (v === null || v === undefined || (typeof v === 'number' && !isFinite(v)) ? '' : typeof v === 'number' ? Math.round(v * 100) / 100 : v);   // неизвестное = пустая ячейка, не 0
  St.sheets = S => {
    const R = SM.est.compute(S), o = S.object, rooms = o.geometry.rooms, rn = id => (rooms.find(r => r.id === id) || {name: '?'}).name;
    const est = [['Помещение', 'Технология › операция', 'Ед.', 'Объём', 'Цена работы, ₽', 'Работа, ₽', 'Чего не хватает']];
    for (const r of R.rows) est.push([rn(r.item.roomId), r.tech.name + ' › ' + r.op.name, r.op.unit, c(r.q), c(r.op.price), c(r.work), r.q === null ? (r.error || ('нет: ' + (r.missing || []).join(', '))) : '']);
    est.push([], ['', 'Работы', '', '', '', c(R.work)], ['', 'Материалы (к закупке)', '', '', '', c(R.mat)], ['', 'Подытог', '', '', '', c(R.sub)], ['', 'Накладные', '', '', '', c(R.overhead)], ['', 'Скидка', '', '', '', c(R.discount)], ['', 'НДС', '', '', '', c(R.vat)], ['', 'ИТОГО', '', '', '', c(R.grand)]);
    if (R.incomplete) est.push(['', 'Итог неполный: часть данных неизвестна (см. столбец «Чего не хватает» и лист «Закупка»)']);
    const buy = [['Материал', 'Ед.', 'Нужно', '+Потери', '+Запас', 'Всего', 'Куплено', 'Докупить', 'Упаковок', 'Стоимость, ₽', 'Примечание']];
    for (const b of R.buy) buy.push([b.m.name, b.m.unit, c(b.base), c(b.waste), c(b.reserve), c(b.total), c(b.have), c(b.rest), c(b.packs), c(b.cost), b.incomplete ? 'часть расхода неизвестна' : b.cost === null ? 'нет упаковки или цены' : '']);
    const D = SM.model.derive(o), geo = [['Помещение', 'Высота, м', 'Пол, м²', 'Потолок, м²', 'Стены, м²', 'Периметр, м', 'Замечания']];
    rooms.forEach((r, i) => geo.push([r.name, c(r.height), c(D[i].floor), c(D[i].ceiling), c(D[i].wallArea), c(D[i].perimeter), (D[i].issues || []).join('; ')]));
    const works = [['Помещение', 'Технология', 'Статус']];
    for (const it of S.plan) { const t = SM.ver ? SM.ver.resolve(S, it) : S.techs.find(x => x.id === it.techId); works.push([rn(it.roomId), t ? t.name : '(удалена)', SM.exec ? SM.exec.LABEL[SM.exec.view(S, it).status] : (it.status || 'PLANNED')]); }
    const acc = [['Помещение', 'Технология', 'Группа', 'Пункт приёмки', 'Отмечено', 'Замер']];
    if (SM.exec) for (const it of S.plan) { const t = SM.ver ? SM.ver.resolve(S, it) : S.techs.find(x => x.id === it.techId); for (const c of SM.exec.view(S, it).checklist) acc.push([rn(it.roomId), t ? t.name : '(удалена)', c.group || '', c.text, c.done ? 'да' : 'нет', c.measure || '']); }
    return [{name: 'Смета', rows: est}, {name: 'Закупка', rows: buy}, {name: 'Помещения', rows: geo}, {name: 'Работы', rows: works}, {name: 'Приёмка', rows: acc}];
  };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
