/* Интерфейс новой модели (new.html). Только показ и вызов SM.*; расчёты — в js/estimate.js и js/geometry.js */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), uid = SM.uid;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const f2 = n => (n === null || n === undefined || !isFinite(n) ? '?' : n.toLocaleString('ru-RU', {maximumFractionDigits: 2}));
  let S, tab = 'object';
  function load() { try { return SM.store.load(localStorage).S; } catch (e) { alert('Не удалось прочитать данные: ' + e.message + '. Данные не тронуты.'); throw e; } }
  let saveErr = false, syncT, cloudMsg = '';
  const cfg = () => SM.store.cfg(localStorage), cloudApi = () => SM.store.cloud(localStorage, (u, o) => fetch(u, o)), stamp = () => new Date().toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
  const save = () => { const r = SM.store.save(localStorage, S); if (!r.ok) { if (!saveErr) alert('Не удалось сохранить: ' + r.error + '. Скачайте копию во вкладке «Данные».'); saveErr = true; } else { saveErr = false; schedulePush(); } };
  function schedulePush() { const c = cfg(); if (!c.token || !c.gistId || c.auto === false) return; clearTimeout(syncT); cloudMsg = '☁ …'; syncT = setTimeout(async () => {
    try { await cloudApi().push(S); cloudMsg = '☁ сохранено ' + stamp(); } catch (e) { cloudMsg = e.conflict ? '☁ в облаке более новые данные — откройте вкладку «Данные»' : '☁ ошибка: ' + e.message; } paintSync(); }, 3000); }
  function paintSync() { const el = $('sync'); if (el) el.textContent = cfg().token ? cloudMsg : ''; }
  const get = p => p.split('.').reduce((o, k) => o[k], S);
  const inp = (path, v, o = {}) => `<input ${o.n ? 'data-n=1 inputmode=decimal' : ''} data-a=set data-p="${path}" value="${esc(v)}" placeholder="${o.ph || ''}" style="width:${o.w || 90}px">`;
  const sel = (path, v, opts) => `<select data-a=set data-p="${path}">${opts.map(([k, t]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const btn = (a, p, t, extra = '') => `<button data-a="${a}" data-p="${p}" ${extra}>${t}</button>`;
  const matOpts = () => [['', '— материал —']].concat(S.materials.map(m => [m.id, m.name + ' (' + m.unit + ')']));

  function viewObject() {
    const o = S.object, g = o.geometry, D = SM.model.derive(o);
    return `<h2>${inp('object.name', o.name, {w: 260})}</h2>` + g.rooms.map((r, ri) => { const d = D[ri];
      return `<div class=card><h3>${inp('object.geometry.rooms.' + ri + '.name', r.name)} высота, м ${inp('object.geometry.rooms.' + ri + '.height', r.height, {n: 1, w: 60})}</h3>
      <div class=kpi><span>Пол <b>${f2(d.floor)} м²</b></span><span>Потолок <b>${f2(d.ceiling)} м²</b></span><span>Стены <b>${f2(d.wallArea)} м²</b></span><span>Периметр <b>${f2(d.perimeter)} м</b></span></div>
      ${d.issues.map(i => `<div class=warn>⚠ ${esc(i)}</div>`).join('')}
      <table><tr><th>Стена<th>Длина, м<th>Поворот в конце, °<th>Материал<th></tr>${r.wallIds.map((wid, i) => { const wi = g.walls.findIndex(w => w.id === wid);
        return `<tr><td>${inp('object.geometry.walls.' + wi + '.name', g.walls[wi].name, {w: 80})}<td>${inp('object.geometry.walls.' + wi + '.len', g.walls[wi].len, {n: 1, w: 60})}<td>${inp('object.geometry.walls.' + wi + '.turn', g.walls[wi].turn, {n: 1, w: 50, ph: '90'})}<td>${inp('object.geometry.walls.' + wi + '.material', g.walls[wi].material, {w: 110})}<td>${btn('wall-del', ri + '.' + i, '✕')}</tr>`; }).join('')}</table>
      ${btn('wall-add', ri, '＋ Стена')}
      <h4>Проёмы (двери, окна)</h4><table>${g.openings.map((p, i) => p.roomId === r.id ? `<tr><td>${inp('object.geometry.openings.' + i + '.kind', p.kind, {w: 80})}<td>${inp('object.geometry.openings.' + i + '.w', p.w, {n: 1, w: 55})} ×<td>${inp('object.geometry.openings.' + i + '.h', p.h, {n: 1, w: 55})} м<td>${btn('del', 'object.geometry.openings.' + i, '✕')}</tr>` : '').join('')}</table>
      ${btn('open-add', ri, '＋ Проём')}</div>`; }).join('') + btn('room-add', '', '＋ Помещение') +
      `<div class=card><h3>Короба и поверхности</h3>${o.surfaces.map((s, i) => s.kind === 'box' ? `<div>${esc(s.name)}: ${inp('object.surfaces.' + i + '.w', s.w, {n: 1, w: 50})} × ${inp('object.surfaces.' + i + '.l', s.l, {n: 1, w: 50})} × ${inp('object.surfaces.' + i + '.h', s.h, {n: 1, w: 50})} м ${s.assumed ? '<i class=hint>(размер взят условно — поправьте)</i>' : ''}</div>` : '').join('') || '<i class=hint>нет</i>'}</div>`;
  }
  const NOTE_CATS = [['cond', 'Условие'], ['error', 'Ошибка'], ['accept', 'Приёмка'], ['note', 'Заметка']];
  function viewTechs() {
    return '<h2>Технологии</h2><button data-a=legacy>⬇ Взять технологии и материалы из старого приложения</button><p class=hint>Технология = набор операций. У операции: единица, цена работы за единицу, формула объёма и материалы с расходом на единицу. В формулах: floor, ceiling, walls, perimeter, height, box и свои параметры технологии.</p>' +
      S.techs.map((t, ti) => `<div class=card><h3>${inp('techs.' + ti + '.name', t.name, {w: 260})} ${btn('del', 'techs.' + ti, 'Удалить технологию')}</h3>
      <div>Реализует процесс: ${sel('techs.' + ti + '.processId', t.processId || '', [['', '— не выбран —']].concat((S.library.processes || []).map(p => [p.id, p.name])))}</div>
      <div>Параметры: ${(t.params || []).map((p, i) => inp(`techs.${ti}.params.${i}.key`, p.key, {w: 80, ph: 'имя'}) + '=' + inp(`techs.${ti}.params.${i}.def`, p.def, {n: 1, w: 50}) + btn('del', `techs.${ti}.params.${i}`, '✕')).join(' ')} ${btn('add', 'techs.' + ti + '.params', '＋ параметр', 'data-k=param')}</div>
      ${t.ops.map((op, oi) => `<div class=op><div>${inp(`techs.${ti}.ops.${oi}.name`, op.name, {w: 240, ph: 'Операция'})} ${btn('del', `techs.${ti}.ops.${oi}`, '✕')}</div>
        <div>ед. ${inp(`techs.${ti}.ops.${oi}.unit`, op.unit, {w: 50, ph: 'м2'})} цена ₽ ${inp(`techs.${ti}.ops.${oi}.price`, op.price, {n: 1, w: 70})} объём = ${inp(`techs.${ti}.ops.${oi}.qty`, op.qty, {w: 150, ph: 'floor'})}</div>
        ${(op.mats || []).map((m, mi) => `<div class=mat>${sel(`techs.${ti}.ops.${oi}.mats.${mi}.matId`, m.matId, matOpts())} расход на ед. ${inp(`techs.${ti}.ops.${oi}.mats.${mi}.rate`, m.rate, {w: 130, ph: '1.9 или формула'})} ${btn('del', `techs.${ti}.ops.${oi}.mats.${mi}`, '✕')}</div>`).join('')}
        ${btn('add', `techs.${ti}.ops.${oi}.mats`, '＋ материал', 'data-k=mat')}
        ${(op.notes || []).map((n, ni) => `<div class=mat>${sel(`techs.${ti}.ops.${oi}.notes.${ni}.cat`, n.cat, NOTE_CATS)} ${inp(`techs.${ti}.ops.${oi}.notes.${ni}.text`, n.text, {w: 300})} ${btn('del', `techs.${ti}.ops.${oi}.notes.${ni}`, '✕')}</div>`).join('')}
        ${btn('add', `techs.${ti}.ops.${oi}.notes`, '＋ условие / ошибка / приёмка', 'data-k=note')}</div>`).join('')}
      ${btn('add', 'techs.' + ti + '.ops', '＋ Операция', 'data-k=op')}</div>`).join('') + btn('add', 'techs', '＋ Технология', 'data-k=tech');
  }
  function viewMaterials() {
    return '<h2>Материалы</h2><p class=hint>Цена — за упаковку; «в упаковке» — сколько единиц. Пусто = неизвестно.</p><table><tr><th>Название<th>Ед.<th>В упаковке<th>Цена за упак., ₽<th></tr>' +
      S.materials.map((m, i) => `<tr><td>${inp(`materials.${i}.name`, m.name, {w: 200})}<td>${inp(`materials.${i}.unit`, m.unit, {w: 50})}<td>${inp(`materials.${i}.packQty`, m.packQty, {n: 1, w: 70})}<td>${inp(`materials.${i}.price`, m.price, {n: 1, w: 80})}<td>${btn('del', 'materials.' + i, '✕')}</tr>`).join('') + '</table>' + btn('add', 'materials', '＋ Материал', 'data-k=material');
  }
  function viewEstimate() {
    const o = S.object, R = SM.est.compute(S);
    const rooms = o.geometry.rooms.map(r => [r.id, r.name]), techs = S.techs.map(t => [t.id, t.name]);
    return `<h2>Работы и смета</h2><div class=card><b>Что делаем:</b> ${techs.length ? `<select id=pt>${techs.map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select> в <select id=pr>${rooms.map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select> <button data-a=plan-add>Добавить в план</button>` : '<i class=hint>Сначала создайте технологию.</i>'}
      ${S.plan.map((p, i) => { const t = S.techs.find(x => x.id === p.techId); return `<div>• ${esc(t ? t.name : '(удалена)')} — ${esc((rooms.find(r => r[0] === p.roomId) || [0, '?'])[1])} ${R.skipped.includes(p.id) ? '<i class=hint>(процесс уже выполнен или не нужен — в смету не входит; чтобы учесть работу — переведите её в «В работе»)</i>' : ''} ${btn('del', 'plan.' + i, '✕')}</div>`; }).join('')}</div>
      <table><tr><th>Операция<th>Объём<th>Работа, ₽</tr>${R.rows.map(r => `<tr><td>${esc(r.tech.name)} › ${esc(r.op.name)}<td>${r.q === null ? `<span class=warn>? ${r.missing.length ? 'нет: ' + esc(r.missing.join(', ')) : esc(r.error || '')}</span>` : f2(r.q) + ' ' + esc(r.op.unit)}<td class=n>${f2(r.work)}</tr>`).join('')}</table>
      <div class=card>Потери на подрезку, % ${inp('fin.waste', S.fin.waste, {n: 1, w: 50})} Запас, % ${inp('fin.reserve', S.fin.reserve, {n: 1, w: 50})}</div>
      <div class=card>Накладные, % ${inp('fin.overhead', S.fin.overhead, {n: 1, w: 50})} Скидка, % ${inp('fin.discount', S.fin.discount, {n: 1, w: 50})} НДС, % ${inp('fin.vat', S.fin.vat, {n: 1, w: 50})}</div>
      <div class=kpi><span>Работы <b>${f2(R.work)} ₽</b></span><span>Материалы (к закупке) <b>${f2(R.mat)} ₽</b></span><span>Подытог <b>${f2(R.sub)} ₽</b></span><span>Накладные <b>${f2(R.overhead)} ₽</b></span><span>Скидка <b>−${f2(R.discount)} ₽</b></span><span>НДС <b>${f2(R.vat)} ₽</b></span><span>К оплате <b>${f2(R.grand)} ₽</b></span></div>${R.incomplete ? '<div class=warn>⚠ Часть данных неизвестна — итог неполный (отмечено «?»).</div>' : ''}`;
  }
  function viewBuy() {
    const R = SM.est.compute(S), o = S.object;
    return `<h2>Закупка</h2><table><tr><th>Материал<th>Нужно<th>+потери<th>+запас<th>Всего<th>Куплено<th>Докупить<th>Упак.<th>₽</tr>${R.buy.map(b => `<tr><td>${esc(b.m.name)}<td class=n>${f2(b.base)}<td class=n>${f2(b.waste)}<td class=n>${f2(b.reserve)}<td class=n>${f2(b.total)} ${esc(b.m.unit)}<td>${inp('bought.' + b.id, (S.bought || {})[b.id], {n: 1, w: 60})}<td class=n>${f2(b.rest)}<td class=n>${b.packs === null ? '<span class=warn>? нет данных об упаковке</span>' : b.packs}<td class=n>${f2(b.cost)}${b.incomplete ? ' ⚠' : ''}</tr>`).join('')}</table>
      <div class=card><b>Уже куплено (из описания объекта)</b>${o.purchased.map(p => `<div>• ${esc(p.name)}: ${p.qty === null ? '?' : p.qty} ${esc(p.unit)} <i class=hint>${esc(p.note || '')}</i></div>`).join('')}<p class=hint>Чтобы учесть купленное — впишите количество в колонку «Куплено» нужного материала выше.</p></div>`;
  }
  const ST = {READY: ['Можно выполнить', '▶'], NEEDS_INFO: ['Требует уточнения', '?'], BLOCKED: ['Заблокировано', '⛔'], DONE: ['Готово', '✓']};
  const TRI_OPTS = [['UNKNOWN', 'неизвестно'], ['YES', 'да'], ['NO', 'нет'], ['NOT_APPLICABLE', 'не применимо']];
  function techPick(rid, pid) {
    const inPlan = S.plan.map((p, ix) => [p, ix]).filter(([p]) => p.roomId === rid && p.processId === pid), opts = S.techs.filter(t => t.processId === pid);
    return `<div class=mat>${inPlan.map(([p, ix]) => `В плане: ${esc((S.techs.find(t => t.id === p.techId) || {name: '(удалена)'}).name)} ${btn('del', 'plan.' + ix, '✕')}`).join('<br>')}
      ${opts.length ? `<select data-tp="${rid}|${pid}">${opts.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select> ${btn('plan-tech', rid + '|' + pid, '＋ В план')}` : '<i class=hint>Нет технологии для этого процесса — привяжите её во вкладке «Технологии».</i>'}</div>`;
  }
  function viewState() {
    const o = S.object, lib = S.library;
    return '<h2>Состояние и что дальше</h2><p class=hint>«Неизвестно» ≠ «нет»: система не считает неизвестное отсутствующим. Отметьте то, что знаете — список «что дальше» обновится.</p>' + o.geometry.rooms.map(r => {
      const P = SM.rules.plan(o, lib, r.id), kinds = ['floor', 'wall', 'ceiling', 'box'].filter(k => o.surfaces.some(x => x.roomId === r.id && x.kind === k));
      const groups = ['READY', 'NEEDS_INFO', 'BLOCKED', 'DONE'].map(k => { const L = P.items.filter(i => i.status === k); if (!L.length) return '';
        return `<h4>${ST[k][0]} (${L.length})</h4>` + L.map(i => `<div class=op>${ST[k][1]} <b>${esc(i.name)}</b> ${k === 'READY' ? btn('complete', r.id + '|' + i.id, 'Отметить выполненным') : ''}
          ${k !== 'DONE' ? techPick(r.id, i.id) : ''}
          ${i.reasons.map(x => `<div class=warn>${esc(x)}</div>`).join('')}<div class=hint>Почему в плане: ${esc(i.why.join('; '))}</div></div>`).join(''); }).join('');
      return `<div class=card><h3>${esc(r.name)}</h3>
        <div><b>Что нужно получить:</b> ${o.goals.filter(g => g.target === r.id || o.surfaces.some(x => x.id === g.target && x.roomId === r.id)).map(g => esc((lib.goalNames || {})[g.result] || g.result)).join(', ') || '<i class=hint>не задано</i>'}</div>
        ${P.questions.length ? '<h4>Нужно уточнить</h4>' + P.questions.map(q => `<div class=warn>? ${esc(q.text)} <i class=hint>(${esc(q.why)})</i></div>`).join('') : ''}
        ${P.notes.map(n => `<div class=warn>${n.kind === 'WARN' ? '⚠' : '💡'} ${esc(n.text)} <i class=hint>— ${esc(n.because)}</i></div>`).join('')}
        ${groups}
        <h4>Текущее состояние</h4>${kinds.map(k => o.surfaces.filter(x => x.roomId === r.id && x.kind === k).map(sf => `<div class=op><b>${esc(sf.name)}</b> ${(lib.layers[k] || []).map(([ly, lb]) => `<span style="white-space:nowrap">${esc(lb)}: <select data-a=state data-p="${sf.id}|${ly}">${TRI_OPTS.map(([v, t]) => `<option value=${v} ${SM.model.getState(o, sf.id, ly) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></span>`).join(' ')}</div>`).join('')).join('')}</div>`; }).join('');
  }
  const KINDS = [['floor', 'пол'], ['wall', 'стены'], ['ceiling', 'потолок'], ['box', 'короб']];
  function viewRoutes() {
    const lib = S.library, rooms = S.object.geometry.rooms, techOpt = pid => [['', '— без технологии —']].concat(S.techs.filter(t => t.processId === pid).map(t => [t.id, t.name]));
    const editor = S.routes.map((r, i) => `<div class=card><h3>${inp('routes.' + i + '.name', r.name, {w: 240})} ${sel('routes.' + i + '.roomId', r.roomId, rooms.map(x => [x.id, x.name]))} ${btn('del', 'routes.' + i, 'Удалить')}</h3>
      <b>Шаги</b>${(r.steps || []).map((st, j) => `<div class=mat>${sel(`routes.${i}.steps.${j}.processId`, st.processId, [['', '— процесс —']].concat(lib.processes.map(p => [p.id, p.name])))} ${sel(`routes.${i}.steps.${j}.techId`, st.techId || '', techOpt(st.processId))} ${btn('del', `routes.${i}.steps.${j}`, '✕')}</div>`).join('')}
      ${btn('add', `routes.${i}.steps`, '＋ Шаг', 'data-k=rstep')}
      <div><b>Допущения о состоянии после маршрута</b> <span class=hint>(например «оставляем стяжку»)</span></div>${(r.assume || []).map((a, j) => `<div class=mat>${sel(`routes.${i}.assume.${j}.kind`, a.kind, KINDS)} ${sel(`routes.${i}.assume.${j}.layer`, a.layer, [['', '— слой —']].concat(lib.layers[a.kind] || []))} = ${sel(`routes.${i}.assume.${j}.value`, a.value, TRI_OPTS)} ${btn('del', `routes.${i}.assume.${j}`, '✕')}</div>`).join('')}
      ${btn('add', `routes.${i}.assume`, '＋ Допущение', 'data-k=rassume')}</div>`).join('');
    const cmp = rooms.map(room => { const C = SM.routes.compareAll(S, room.id); if (!C.results.length) return '';
      return `<div class=card><h3>Сравнение: ${esc(room.name)}</h3><table><tr><th><th>${C.results.map(x => esc(x.route.name) + (x.route.id === C.best ? ' ✓ дешевле' : '')).join('<th>')}</tr>
        <tr><td>Работы, ₽<td class=n>${C.results.map(x => f2(x.work)).join('<td class=n>')}</tr><tr><td>Материалы, ₽<td class=n>${C.results.map(x => f2(x.mat)).join('<td class=n>')}</tr>
        <tr><td><b>Итого, ₽</b><td class=n>${C.results.map(x => '<b>' + f2(x.grand) + '</b>' + (x.incomplete ? ' ⚠' : '')).join('<td class=n>')}</tr>
        <tr><td>Дальше можно<td>${C.results.map(x => esc(x.ready.join(', ') || '—')).join('<td>')}</tr><tr><td>Заблокировано процессов<td class=n>${C.results.map(x => x.blocked).join('<td class=n>')}</tr></table>
        <p class=hint>Итог = шаги маршрута + остальные работы плана, которые после него ещё нужны. ⚠ — часть данных неизвестна, сравнивать цену нельзя. Времени и закупленного заранее пока не учитываем.</p></div>`; }).join('');
    return '<h2>Маршруты</h2><p class=hint>Маршрут — вариант решения одной задачи (например: оставить стяжку / отремонтировать / снести и залить новую). Сравнивается весь путь с последствиями, а не одна цена.</p>' + cmp + editor + btn('add', 'routes', '＋ Маршрут', 'data-k=route');
  }
  function viewWorks() {
    const o = S.object;
    return '<h2>Работы</h2><p class=hint>Статусы: запланировано → в работе → выполнено → принято. «Выполнено» меняет состояние объекта. «Принято» — только после чек-листа приёмки (его пункты — заметки «Приёмка» у операций технологии).</p>' + o.geometry.rooms.map(r => {
      const items = S.plan.filter(p => p.roomId === r.id); if (!items.length) return '';
      return `<div class=card><h3>${esc(r.name)}</h3>` + items.map(it => { const v = SM.exec.view(S, it), t = S.techs.find(x => x.id === it.techId);
        return `<div class=op><b>${esc(t ? t.name : '(удалена)')}</b> — ${SM.exec.LABEL[v.status]}
          ${v.status === 'PLANNED' ? (v.canStart ? btn('w-start', it.id, 'Начать') : v.waits.map(x => `<div class=warn>⛔ ${esc(x)}</div>`).join('')) : ''}
          ${v.status === 'IN_PROGRESS' ? btn('w-complete', it.id, 'Выполнено') : ''}${v.status === 'COMPLETED' ? btn('w-accept', it.id, 'Принять') : ''}
          ${v.conditions.map(x => `<div class=hint>Условие: ${esc(x)}</div>`).join('')}${v.errors.map(x => `<div class=warn>Частая ошибка: ${esc(x)}</div>`).join('')}
          ${v.checklist.length ? '<div><b>Приёмка</b></div>' + v.checklist.map(c => `<label style="display:block"><input type=checkbox data-a=check data-p="${it.id}|${c.id}" ${c.done ? 'checked' : ''} ${v.status === 'PLANNED' || v.status === 'ACCEPTED' ? 'disabled' : ''}> ${esc(c.text)}</label>`).join('') : ''}</div>`; }).join('') + '</div>'; }).join('') || '<i class=hint>План пуст — добавьте технологии в план во вкладке «Состояние».</i>';
  }
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: type || 'application/json'})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
  function viewData() {
    const c = cfg(), sn = SM.store.snaps(localStorage);
    const cloud = c.token ? `<p class=hint>Подключено. ${esc(cloudMsg)}</p><div><button data-a=cloud-check>Сверить</button> <button data-a=cloud-push>Отправить сейчас</button> <button data-a=cloud-pull>Загрузить из облака</button> <button data-a=cloud-auto>Автоотправка: ${c.auto !== false ? 'вкл' : 'выкл'}</button> <button data-a=cloud-off>Отключить</button></div>
        <p class=hint>Облачные данные никогда не заменяются без вашего подтверждения; перед загрузкой из облака текущие данные сохраняются в точку отката.</p>`
      : `<p class=hint>Данные сохраняются в ваш приватный Gist на GitHub и доступны с любого устройства. Подключение: 1) откройте <a href="https://github.com/settings/tokens/new?scopes=gist&description=stroysmeta" target=_blank rel=noopener style="color:var(--ac)">создание токена</a> (галочка gist уже отмечена); 2) нажмите Generate token внизу страницы; 3) скопируйте токен и вставьте сюда. Токен хранится только в этом браузере и не попадает в копии данных.</p>
        <input id=ghToken type=password placeholder="ghp_…" style="width:300px"> <button data-a=cloud-on>Подключить</button>`;
    return `<h2>Данные</h2>
      <div class=card><h3>Копия на компьютер</h3><p class=hint>Весь проект одним файлом. Загрузка файла заменяет текущие данные, но перед этим автоматически делается точка отката.</p>
        <button data-a=export-json>⬇ Скачать копию (JSON)</button> <button data-a=export-xlsx>⬇ Смета в Excel</button> <label>⬆ Загрузить копию: <input type=file accept=".json,application/json" data-a=import-json></label></div>
      <div class=card><h3>Облако (GitHub Gist)</h3>${cloud}</div>
      <div class=card><h3>Точки отката</h3><p class=hint>Делаются сами (не чаще раза в 5 минут, последние ${SM.store.MAX_SNAPS}) и перед любой заменой данных.</p>
        ${sn.length ? '<table>' + sn.map((x, i) => [x, i]).reverse().map(([x, i]) => `<tr><td>${new Date(x.t).toLocaleString('ru-RU')}<td>${btn('restore-snap', i, 'Вернуть')}</tr>`).join('') + '</table>' : '<div class=hint>Появятся после первых изменений.</div>'}
        ${btn('snap-now', '', 'Сделать точку отката сейчас')}</div>`;
  }
  const VIEWS = {object: viewObject, state: viewState, routes: viewRoutes, works: viewWorks, techs: viewTechs, materials: viewMaterials, estimate: viewEstimate, buy: viewBuy, data: viewData};
  const TABS = [['object', 'Объект'], ['state', 'Состояние'], ['routes', 'Маршруты'], ['works', 'Работы'], ['techs', 'Технологии'], ['materials', 'Материалы'], ['estimate', 'Смета'], ['buy', 'Закупка'], ['data', 'Данные']];
  function render() { const y = scrollY; $('nav').innerHTML = TABS.map(([k, t]) => `<button class="${k === tab ? 'on' : ''}" data-a=tab data-p=${k}>${t}</button>`).join('') + '<span id=sync class=hint style="padding:8px;white-space:nowrap"></span>'; paintSync(); $('main').innerHTML = VIEWS[tab](); scrollTo(0, y); }
  const NEW = {tech: () => ({id: uid(), name: 'Новая технология', params: [], ops: []}), op: () => ({id: uid(), name: '', unit: 'м2', price: null, qty: '', mats: []}), mat: () => ({id: uid(), matId: '', rate: ''}),
    route: () => ({id: uid(), name: 'Новый маршрут', roomId: S.object.geometry.rooms[0] ? S.object.geometry.rooms[0].id : '', steps: [], assume: []}), rstep: () => ({processId: '', techId: ''}), rassume: () => ({kind: 'floor', layer: '', value: 'YES'}),
    note: () => ({id: uid(), cat: 'accept', text: ''}),
    param: () => ({key: '', def: null}), material: () => ({id: uid(), name: 'Новый материал', unit: 'кг', packQty: null, price: null})};
  const A = {
    tab(p) { tab = p; }, del(p) { const k = p.split('.'), i = +k.pop(), arr = get(k.join('.')); const x = arr[i]; arr.splice(i, 1); if (k.join('.') === 'object.geometry.openings' || x === undefined) return; },
    add(p, el) { get(p).push(NEW[el.dataset.k]()); },
    'wall-add'(p) { const g = S.object.geometry, r = g.rooms[+p], w = {id: uid(), name: 'Стена ' + (r.wallIds.length + 1), len: null, turn: 90, material: ''}; g.walls.push(w); r.wallIds.push(w.id); },
    'wall-del'(p) { const [ri, i] = p.split('.').map(Number), g = S.object.geometry, r = g.rooms[ri], id = r.wallIds[i]; r.wallIds.splice(i, 1); if (!g.rooms.some(x => x.wallIds.includes(id))) g.walls = g.walls.filter(w => w.id !== id); },
    'open-add'(p) { const g = S.object.geometry; g.openings.push({id: uid(), roomId: g.rooms[+p].id, wallId: null, kind: 'дверь', w: null, h: null}); },
    'room-add'() { const g = S.object.geometry, ws = [0, 1, 2, 3].map(i => ({id: uid(), name: 'Стена ' + (i + 1), len: 3, turn: 90, material: ''})); g.walls.push(...ws); g.rooms.push({id: uid(), name: 'Помещение ' + (g.rooms.length + 1), height: 2.7, wallIds: ws.map(w => w.id)}); },
    legacy() { let raw = null; try { raw = localStorage.getItem('stroysmeta:v3'); } catch (e) {} if (!raw) { alert('Старые данные в этом браузере не найдены (открывайте new.html с того же адреса, что и старое приложение).'); return; }
      const r = SM.legacy.convert(JSON.parse(raw), S); S.materials.push(...r.materials); S.techs.push(...r.techs); alert('Перенесено: технологий ' + r.techs.length + ', материалов ' + r.materials.length + '. Старое приложение не изменено.'); },
    complete(p) { const [rid, pid] = p.split('|'); try { SM.rules.complete(S.object, S.library, rid, pid); } catch (e) { alert(e.message); } },
    'plan-tech'(p) { const [rid, pid] = p.split('|'), el = document.querySelector(`[data-tp="${p}"]`); if (!el) return;
      if (!S.plan.some(x => x.roomId === rid && x.processId === pid && x.techId === el.value)) S.plan.push({id: uid(), techId: el.value, roomId: rid, processId: pid, values: {}}); },
    'w-start'(id) { try { SM.exec.start(S, S.plan.find(x => x.id === id)); } catch (e) { alert(e.message); } },
    'w-complete'(id) { try { SM.exec.complete(S, S.plan.find(x => x.id === id)); } catch (e) { alert(e.message); } },
    'w-accept'(id) { try { SM.exec.accept(S, S.plan.find(x => x.id === id)); } catch (e) { alert(e.message); } },
    'plan-add'() { S.plan.push({id: uid(), techId: $('pt').value, roomId: $('pr').value, values: {}}); },
    'export-json'() { download('stroysmeta_' + new Date().toISOString().slice(0, 10) + '.json', SM.store.toJson(S)); },
    'export-xlsx'() { if (!window.XLSX) return alert('Библиотека Excel не загрузилась — нужен интернет.');
      const wb = XLSX.utils.book_new(); for (const sh of SM.store.sheets(S)) { const ws = XLSX.utils.aoa_to_sheet(sh.rows); ws['!cols'] = sh.rows[0].map((_, j) => ({wch: Math.min(60, Math.max(8, ...sh.rows.map(r => String(r[j] == null ? '' : r[j]).length)))})); XLSX.utils.book_append_sheet(wb, ws, sh.name); }
      XLSX.writeFile(wb, 'smeta_' + (S.object.name || 'object').replace(/[^\p{L}\d]+/gu, '_') + '.xlsx'); },
    'snap-now'() { SM.store.snap(localStorage, S, true); },
    'restore-snap'(p) { try { const x = SM.store.snaps(localStorage)[+p], d = SM.store.snapData(localStorage, +p);
      if (confirm('Вернуть данные на состояние от ' + new Date(x.t).toLocaleString('ru-RU') + '? Текущие сохранятся в новую точку отката.')) S = SM.store.replace(localStorage, S, d); } catch (e) { alert(e.message); } },
    'cloud-on'() { const token = $('ghToken').value.trim(); if (!token) return alert('Вставьте токен'); SM.store.setCfg(localStorage, {token, auto: true}); cloudCheck(true); },
    'cloud-off'() { if (confirm('Отключить облако на этом устройстве? Данные в облаке и здесь останутся.')) { SM.store.setCfg(localStorage, {}); cloudMsg = ''; } },
    'cloud-auto'() { const c = cfg(); c.auto = c.auto === false; SM.store.setCfg(localStorage, c); },
    'cloud-check'() { cloudCheck(); }, 'cloud-push'() { cloudPush(); }, 'cloud-pull'() { cloudPull(); }
  };
  const NOSAVE = new Set(['tab', 'export-json', 'export-xlsx', 'snap-now', 'restore-snap', 'cloud-on', 'cloud-off', 'cloud-auto', 'cloud-check', 'cloud-push', 'cloud-pull']);
  /* Облако: pull и расхождения применяются только с подтверждением; перезапись облака — только если оно не менялось или по явному «ОК». */
  async function cloudCheck(first) {
    cloudMsg = '☁ проверка…'; paintSync(); const cl = cloudApi();
    try { const r = await cl.check(S);
      if (r.action === 'pushed') cloudMsg = '☁ сохранено ' + stamp();
      else if (r.action === 'same') cloudMsg = '☁ синхронизировано';
      else if (r.action === 'pull' || r.action === 'conflict') {
        if (confirm((r.action === 'pull' ? 'В облаке более новые данные (изменены на другом устройстве). ' : 'В облаке и здесь разные данные. ') + 'ОК — взять данные из облака (текущие сохранятся в точку отката). Отмена — ничего не менять, облако не трогаем.')) { S = cl.adopt(S, r.remote); cloudMsg = '☁ загружено ' + stamp(); }
        else cloudMsg = '☁ данные расходятся: выберите «Отправить сейчас» или «Загрузить из облака»'; }
    } catch (e) { cloudMsg = '☁ ошибка: ' + e.message; if (first) { SM.store.setCfg(localStorage, {}); alert('Не удалось подключить: ' + e.message); } }
    render(); }
  async function cloudPush() { const cl = cloudApi();
    try { await cl.push(S); cloudMsg = '☁ сохранено ' + stamp(); }
    catch (e) { if (!e.conflict) cloudMsg = '☁ ошибка: ' + e.message;
      else if (confirm('В облаке более новые данные. Перезаписать их текущими? Облачная копия будет потеряна.')) { try { await cl.push(S, {force: true}); cloudMsg = '☁ сохранено ' + stamp(); } catch (e2) { cloudMsg = '☁ ошибка: ' + e2.message; } }
      else cloudMsg = '☁ облако не тронуто'; }
    render(); }
  async function cloudPull() { const cl = cloudApi(), c = cfg();
    try { if (!c.gistId) throw new Error('облако не подключено'); const r = await cl.read(c.gistId);
      if (confirm('Заменить данные здесь данными из облака? Текущие сохранятся в точку отката.')) { S = cl.adopt(S, r); cloudMsg = '☁ загружено ' + stamp(); } }
    catch (e) { cloudMsg = '☁ ошибка: ' + e.message; }
    render(); }
  document.addEventListener('change', async e => { const t = e.target; if (t.dataset.a !== 'import-json' || !t.files[0]) return;
    try { const next = SM.store.parse(await t.files[0].text());
      if (confirm('Заменить текущие данные данными из файла «' + t.files[0].name + '»? Текущие сохранятся в точку отката.')) S = SM.store.replace(localStorage, S, next); } catch (err) { alert('Не удалось загрузить: ' + err.message); }
    t.value = ''; render(); });
  document.addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (!b) return; const a = A[b.dataset.a]; if (a) { a(b.dataset.p, b); if (!NOSAVE.has(b.dataset.a)) save(); render(); } });
  document.addEventListener('change', e => { const t = e.target; if (t.dataset.a !== 'set') return; const k = t.dataset.p.split('.'), key = k.pop(), o = get(k.join('.') || '');
    let v = t.value.trim(); if (t.dataset.n) { v = v === '' ? null : parseFloat(v.replace(',', '.')); if (v !== null && !isFinite(v)) v = null; }
    if (k.length === 1 && k[0] === 'bought' || k[0] === 'bought') S.bought[key] = v; else o[key] = v; save(); render(); });
  document.addEventListener('change', e => { const t = e.target; if (t.dataset.a !== 'state') return; const [id, layer] = t.dataset.p.split('|'); SM.model.setState(S.object, id, layer, t.value); save(); render(); });
  document.addEventListener('change', e => { const t = e.target; if (t.dataset.a !== 'check') return; const [id, nid] = t.dataset.p.split('|'); SM.exec.check(S.plan.find(x => x.id === id), nid, t.checked); save(); render(); });
  S = load(); SM.store.save(localStorage, S, {keepStamp: true}); render(); if (cfg().token) cloudCheck();
})();
