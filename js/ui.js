/* Интерфейс новой модели (index.html). Только показ и вызов SM.*; расчёты — в js/estimate.js и js/geometry.js */
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
  /* Нормы из справочника рядом с операциями: только показ; расход и цену вводит человек, пока пусто — неизвестно. */
  const normOpen = new Set();
  function normBlock(t, ti) { const r = SM.norms.report(S, KB, t); if (!r.total) return '';
    const head = btn('norm-tog', t.id, `📏 Нормы из справочника: подтверждено ${r.done} из ${r.total}${r.unknown ? ' · <span class=warn>не задано: ' + r.unknown + '</span>' : ''}`);
    if (!normOpen.has(t.id)) return `<div>${head}</div>`;
    const lines = r.lines.map(l => `<div><label><input type=checkbox data-a=norm-ok data-p="${t.id}|${esc(l.key)}" ${l.ok ? 'checked' : ''}> ${l.group ? `<span class=hint>${esc(l.group)}:</span> ` : ''}${esc(l.text)}</label></div>`).join('');
    const ops = r.ops.map((o, oi) => `<div class=op><div>${esc(o.name || 'Операция')}: цена ₽ ${inp(`techs.${ti}.ops.${oi}.price`, t.ops[oi].price, {n: 1, w: 70})} ${o.priceUnknown ? '<span class=warn>неизвестно</span>' : ''}</div>`
      + o.mats.map((m, mi) => { const xi = S.materials.findIndex(x => x.id === m.matId);
        return `<div class=mat>${esc(m.name)}: расход на ед. ${inp(`techs.${ti}.ops.${oi}.mats.${mi}.rate`, t.ops[oi].mats[mi].rate, {w: 110, ph: 'формула'})} ${m.rateUnknown ? '<span class=warn>неизвестно</span>' : ''}${xi < 0 ? '' : ` · в упак. ${inp(`materials.${xi}.packQty`, S.materials[xi].packQty, {n: 1, w: 50})} · цена за упак. ₽ ${inp(`materials.${xi}.price`, S.materials[xi].price, {n: 1, w: 70})}`}</div>`; }).join('') + '</div>').join('');
    return `<div>${head}</div><div class=card><p class=hint>Это текст справочника, в расчёт он сам не попадает. Прочитайте норму, введите расход и цену ниже и отметьте строку «подтверждено».</p>${lines}<div>${btn('norm-all', t.id + '|1', 'Подтвердить все')} ${btn('norm-all', t.id + '|0', 'Снять все')}</div><h4>Что задано в технологии</h4>${ops || '<i class=hint>операций нет</i>'}</div>`; }
  function viewTechs() {
    return '<h2>Технологии</h2><button data-a=legacy>⬇ Взять технологии и материалы из старого приложения</button><p class=hint>Технология = набор операций. У операции: единица, цена работы за единицу, формула объёма и материалы с расходом на единицу. В формулах: floor, ceiling, walls, perimeter, height, box и свои параметры технологии.</p>' +
      S.techs.map((t, ti) => `<div class=card><h3>${inp('techs.' + ti + '.name', t.name, {w: 260})} ${btn('del', 'techs.' + ti, 'Удалить технологию')}</h3>
      ${verLine(t)}${kbLine(t.id)}${normBlock(t, ti)}<div>Реализует процесс: ${sel('techs.' + ti + '.processId', t.processId || '', [['', '— не выбран —']].concat((S.library.processes || []).map(p => [p.id, p.name])))}</div>
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
  function verBadge(p) { const s = SM.ver.state(S, p); return (s.pinned ? ` <span class=hint>v${s.pinned}</span>` : '') + (s.canUpdate ? ` <span class=warn>технология изменена</span> ${btn('ver-update', p.id, 'Обновить до текущей')}<div class=hint>${s.changes.map(esc).join('; ') || 'содержимое изменено'}</div>` : '') + (s.frozen ? ' <span class=hint>(технология изменена; начатая работа остаётся на v' + s.pinned + ')</span>' : ''); }
  function verNote(p) { const s = SM.ver.state(S, p); return s.canUpdate ? ' <span class=warn>есть правки технологии — см. «Смета»</span>' : ''; }
  function verLine(t) { const L = (S.techVersions || {})[t.id] || [], ch = SM.ver.isChanged(S, t.id);
    return `<div class=hint>Версии: ${L.length ? L.map(x => 'v' + x.v).join(', ') : 'пока нет (создаётся, когда технология ставится в план)'}${ch && L.length ? ' · есть правки после v' + L[L.length - 1].v + ': запланированные работы остаются на своей версии' : ''} ${ch ? btn('ver-release', t.id, 'Зафиксировать версию') : ''}</div>`; }
  function viewEstimate() {
    const o = S.object, R = SM.est.compute(S);
    const rooms = o.geometry.rooms.map(r => [r.id, r.name]), techs = S.techs.map(t => [t.id, t.name]);
    return `<h2>Работы и смета</h2><div class=card><b>Что делаем:</b> ${techs.length ? `<select id=pt>${techs.map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select> в <select id=pr>${rooms.map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select> <button data-a=plan-add>Добавить в план</button>` : '<i class=hint>Сначала создайте технологию.</i>'}
      ${S.plan.map((p, i) => { const t = SM.ver.resolve(S, p); return `<div>• ${esc(t ? t.name : '(удалена)')}${verBadge(p)} — ${esc((rooms.find(r => r[0] === p.roomId) || [0, '?'])[1])} ${R.skipped.includes(p.id) ? '<i class=hint>(процесс уже выполнен или не нужен — в смету не входит; чтобы учесть работу — переведите её в «В работе»)</i>' : ''} ${btn('del', 'plan.' + i, '✕')}</div>`; }).join('')}</div>
      <table><tr><th>Операция<th>Объём<th>Работа, ₽</tr>${R.rows.map(r => `<tr><td>${esc(r.tech.name)} › ${esc(r.op.name)}<td>${r.q === null ? `<span class=warn>? ${r.missing.length ? 'нет: ' + esc(r.missing.join(', ')) : esc(r.error || '')}</span>` : f2(r.q) + ' ' + esc(r.op.unit)}<td class=n>${f2(r.work)}</tr>`).join('')}</table>
      <div class=card>Потери на подрезку, % ${inp('fin.waste', S.fin.waste, {n: 1, w: 50})} Запас, % ${inp('fin.reserve', S.fin.reserve, {n: 1, w: 50})}</div>
      <div class=card>Накладные, % ${inp('fin.overhead', S.fin.overhead, {n: 1, w: 50})} Скидка, % ${inp('fin.discount', S.fin.discount, {n: 1, w: 50})} НДС, % ${inp('fin.vat', S.fin.vat, {n: 1, w: 50})}</div>
      <div class=kpi><span>Работы <b>${f2(R.work)} ₽</b></span><span>Материалы (к закупке) <b>${f2(R.mat)} ₽</b></span><span>Подытог <b>${f2(R.sub)} ₽</b></span><span>Накладные <b>${f2(R.overhead)} ₽</b></span><span>Скидка <b>−${f2(R.discount)} ₽</b></span><span>НДС <b>${f2(R.vat)} ₽</b></span><span>К оплате <b>${f2(R.grand)} ₽</b></span></div>${R.incomplete ? '<div class=warn>⚠ Часть данных неизвестна — итог неполный (отмечено «?»).</div>' : ''}
      <div class=card><h3>Утверждённые сметы</h3><p class=hint>Снимок сметы на момент утверждения; потом не меняется. Сравнивается с текущей сметой. Факт выполнения хранится отдельно (вкладка «Работы»).</p>
        <input id=an placeholder="название (необязательно)" style="width:220px"> <button data-a=approve>Утвердить текущую смету</button>${(S.approved || []).slice().reverse().map(sn => approvedView(sn)).join('')}</div>`;
  }
  function approvedView(sn) {
    const c = SM.fact.compare(S, sn), same = !c.changes.length && c.dGrand === 0;
    return `<div class=op><b>${esc(sn.name)}</b> <span class=hint>${new Date(sn.t).toLocaleString('ru-RU')}</span> — к оплате ${f2(sn.grand)} ₽ (работы ${f2(sn.work)}, материалы ${f2(sn.mat)}) ${sn.incomplete ? '<span class=warn>⚠ была неполной</span>' : ''}
      <div class=hint>${same ? 'Совпадает с текущей сметой.' : (c.comparable ? 'Текущая смета отличается на ' + sg(c.dGrand) + ' ₽ к оплате.' : 'Итог сравнить нельзя: в одной из смет есть неизвестные данные.')}</div>
      ${c.changes.map(x => `<div class=mat>${x.kind === 'added' ? '＋ добавлено: ' + esc(x.name) + ' ' + f2(x.to) + ' ₽' : x.kind === 'removed' ? '− убрано: ' + esc(x.name) + ' (было ' + f2(x.from) + ' ₽)' : '≠ ' + esc(x.name) + ': ' + f2(x.fromQ) + ' → ' + f2(x.toQ) + ' ед., ' + f2(x.from) + ' → ' + f2(x.to) + ' ₽'}</div>`).join('')}</div>`;
  }
  function viewBuy() {
    const R = SM.est.compute(S), o = S.object, STK = new Map(SM.fact.stock(S).map(k => [k.id, k]));
    return `<h2>Закупка</h2><table><tr><th>Материал<th>Нужно<th>+потери<th>+запас<th>Всего<th>Куплено<th>Израсходовано<th>Остаток<th>Докупить<th>Упак.<th>₽</tr>${R.buy.map(b => { const k = STK.get(b.id) || {}; const q = v => (b.incomplete ? (v > 0 ? '≥ ' + f2(v) : '?') : f2(v)); return `<tr><td>${esc(b.m.name)}<td class=n>${q(b.base)}<td class=n>${q(b.waste)}<td class=n>${q(b.reserve)}<td class=n>${q(b.total)} ${esc(b.m.unit)}<td>${inp('bought.' + b.id, (S.bought || {})[b.id], {n: 1, w: 60})}<td class=n>${f2(k.used)}<td class=n>${f2(k.left)}${k.over ? ' <span class=warn>⚠ больше, чем куплено</span>' : ''}<td class=n>${q(b.rest)}<td class=n>${b.incomplete ? '<span class=warn>? расход неизвестен</span>' : b.packs === null ? '<span class=warn>? нет данных об упаковке</span>' : b.packs}<td class=n>${f2(b.cost)}${b.incomplete ? ' ⚠' : ''}</tr>`; }).join('')}</table>${STK.size > R.buy.length ? '<div class=card><b>Расход материалов вне сметы</b>' + [...STK.values()].filter(k => !R.buy.some(b => b.id === k.id)).map(k => `<div>• ${esc(k.m.name)}: израсходовано ${f2(k.used)} ${esc(k.m.unit)}, куплено ${f2(k.have)}, остаток ${f2(k.left)}</div>`).join('') + '</div>' : ''}
      <div class=card><b>Уже куплено (из описания объекта)</b>${o.purchased.map(p => `<div>• ${esc(p.name)}: ${p.qty === null ? '?' : p.qty} ${esc(p.unit)} <i class=hint>${esc(p.note || '')}</i></div>`).join('')}<p class=hint>Чтобы учесть купленное — впишите количество в колонку «Куплено» нужного материала выше.</p></div>`;
  }
  const ST = {READY: ['Можно выполнить', '▶'], NEEDS_INFO: ['Требует уточнения', '?'], BLOCKED: ['Заблокировано', '⛔'], DONE: ['Готово', '✓']};
  const TRI_OPTS = [['UNKNOWN', 'неизвестно'], ['YES', 'да'], ['NO', 'нет'], ['NOT_APPLICABLE', 'не применимо']];
  function techPick(rid, pid) {
    const inPlan = S.plan.map((p, ix) => [p, ix]).filter(([p]) => p.roomId === rid && p.processId === pid), opts = S.techs.filter(t => t.processId === pid);
    return `<div class=mat>${inPlan.map(([p, ix]) => `В плане: ${esc((SM.ver.resolve(S, p) || {name: '(удалена)'}).name)} ${btn('del', 'plan.' + ix, '✕')}`).join('<br>')}
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
  /* Паузы между процессами: ввод вручную; текст справочника («что до», «защита») — только подсказка (D27, D32). */
  const timeCell = t => { if (!t || t.minDays === null && !t.steps.length) return '—'; const lo = t.minDays === null ? '?' : f2(t.minDays), hi = t.maxDays === null ? '' : ' … ' + f2(t.maxDays);
    return (t.steps.length < 2 ? '—' : 'от ' + lo + hi) + (t.unknown.length ? ' <span class=warn title="' + esc(t.unknown.join('; ')) + '">⚠</span>' : ''); };
  const pauseHint = p => { const ids = new Set([p.beforeId, p.afterId]), ts = S.techs.filter(t => ids.has(t.processId)), seen = new Set(), out = [];
    for (const t of ts) for (const w of SM.kb.forTech(KB, t.id)) { if (seen.has(w.id)) continue; seen.add(w.id); const a = (w.sections.pre || '').trim(), b = (w.sections.protect || '').trim();
      if (a || b) out.push(`<details><summary>📖 ${esc(SM.kb.label(w))}: что до / защита</summary>${a ? '<h4>Что должно быть до</h4><div class=kbtext>' + SM.kb.html(a) + '</div>' : ''}${b ? '<h4>Защита результата</h4><div class=kbtext>' + SM.kb.html(b) + '</div>' : ''}</details>`); }
    return out.join(''); };
  function pauseCard() { const procs = [['', '— процесс —']].concat(S.library.processes.map(p => [p.id, p.name]));
    return `<div class=card><h3>Паузы между процессами</h3><p class=hint>Например: плитка — не раньше чем через 7 дней после стяжки. Числа вводите сами (из справочника они не берутся); пусто = неизвестно. Паузы учитываются в сравнении маршрутов.</p>`
      + S.pauses.map((p, i) => `<div class=op><div>${sel(`pauses.${i}.beforeId`, p.beforeId, procs)} через ${inp(`pauses.${i}.minDays`, p.minDays, {n: 1, w: 45, ph: 'от'})} … ${inp(`pauses.${i}.maxDays`, p.maxDays, {n: 1, w: 45, ph: 'до'})} дн. после ${sel(`pauses.${i}.afterId`, p.afterId, procs)} ${btn('del', 'pauses.' + i, '✕')}</div>
        <div>${inp(`pauses.${i}.note`, p.note, {w: 340, ph: 'пояснение'})}</div>${pauseHint(p)}</div>`).join('') + btn('add', 'pauses', '＋ Пауза', 'data-k=pause') + '</div>'; }
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
        <tr><td>Дальше можно<td>${C.results.map(x => esc(x.ready.join(', ') || '—')).join('<td>')}</tr><tr><td>Заблокировано процессов<td class=n>${C.results.map(x => x.blocked).join('<td class=n>')}</tr>
        <tr><td>Паузы между шагами, дней<td class=n>${C.results.map(x => timeCell(x.time)).join('<td class=n>')}</tr></table>${C.results.map(x => x.time && x.time.warnings.length ? `<p class=warn>${esc(x.route.name)}: ${x.time.warnings.map(esc).join('; ')}</p>` : '').join('')}
        <p class=hint>Итог = шаги маршрута + остальные работы плана, которые после него ещё нужны. ⚠ — часть данных неизвестна, сравнивать цену нельзя. Время считается только по паузам (время самих работ не хранится); закупленное заранее не учитываем.</p></div>`; }).join('');
    return '<h2>Маршруты</h2><p class=hint>Маршрут — вариант решения одной задачи (например: оставить стяжку / отремонтировать / снести и залить новую). Сравнивается весь путь с последствиями, а не одна цена.</p>' + cmp + editor + btn('add', 'routes', '＋ Маршрут', 'data-k=route') + pauseCard();
  }
  const sg = n => (n > 0 ? '+' : '') + f2(n);
  function factBlock(it, rep, st) {
    const x = rep.items.find(i => i.item === it); if (!x) return '';
    const dis = st === 'ACCEPTED' ? 'disabled' : '', fi = (p, v) => `<input data-a=fact data-n=1 inputmode=decimal data-p="${p}" value="${esc(v)}" style="width:70px" ${dis}>`;
    return `<div><b>Факт</b> <span class=hint>(пусто = неизвестно; после приёмки закрыт)</span></div><table><tr><th>Операция<th>План, объём<th>Факт, объём<th>План, ₽<th>Факт, ₽</tr>${x.ops.map(o => `<tr><td>${esc(o.op.name)}<td class=n>${f2(o.planQty)} ${esc(o.op.unit)}<td>${fi(it.id + '|op|' + o.op.id + '|qty', o.factQty)}<td class=n>${f2(o.planWork)}<td>${fi(it.id + '|op|' + o.op.id + '|cost', o.factCost)}${o.dCost !== null ? ` <span class=hint>${sg(o.dCost)}</span>` : ''}</tr>`).join('')}</table>
      ${x.mats.length ? `<table><tr><th>Материал<th>По плану<th>Израсходовано</tr>${x.mats.map(m => `<tr><td>${esc(m.mat ? m.mat.name : '(удалён)')}<td class=n>${f2(m.planNeed)} ${esc(m.mat ? m.mat.unit : '')}<td>${fi(it.id + '|mat|' + m.matId, m.used)}</tr>`).join('')}</table>` : ''}`;
  }
  /* Справочник в карточке работы: условия и частые ошибки по связанным темам (текст для человека) и пункты приёмки. */
  function kbWork(it) { const ws = SM.kb.workInfo(KB, it.techId).filter(w => w.cond || w.errors); if (!ws.length) return '';
    return ws.map(w => `<details><summary>📖 ${esc(SM.kb.label(w.topic))}: условия${w.errors ? ' · <span class=warn>⚠ частые ошибки (' + SM.kb.items(w.errors).length + ')</span>' : ''}</summary>${w.cond ? '<h4>Условия проведения работ</h4><div class=kbtext>' + SM.kb.html(w.cond) + '</div>' : ''}${w.errors ? '<h4>Частые ошибки</h4><div class=kbtext>' + SM.kb.html(w.errors) + '</div>' : ''}</details>`).join(''); }
  const kbAcceptNew = it => { const have = new Set((it.accept || []).map(a => a.text.trim().toLowerCase())), seen = new Set(); return SM.kb.workInfo(KB, it.techId).flatMap(w => w.accept).filter(x => { const k = x.text.trim().toLowerCase(); if (have.has(k) || seen.has(k)) return false; seen.add(k); return true; }); };
  function acceptBlock(it, v) { const closed = v.status === 'ACCEPTED', dis = v.status === 'PLANNED' || closed ? 'disabled' : '', avail = closed ? [] : kbAcceptNew(it);
    const rows = v.checklist.map(c => `<div><label><input type=checkbox data-a=check data-p="${it.id}|${c.id}" ${c.done ? 'checked' : ''} ${dis}> ${c.group ? `<span class=hint>${esc(c.group)}:</span> ` : ''}${esc(c.text)}</label>${c.meas ? ` <input data-a=measure data-p="${it.id}|${c.id}" value="${esc(c.measure)}" placeholder="замер" style="width:90px" ${dis}>` : ''}${c.extra && !closed ? ' ' + btn('acc-del', it.id + '|' + c.id, '✕') : ''}</div>`).join('');
    const add = closed ? '' : `<div>${avail.length ? btn('acc-kb', it.id, '＋ Пункты приёмки из справочника (' + avail.length + ')') : ''} <input id="acc-${it.id}" placeholder="свой пункт приёмки" style="width:220px"> ${btn('acc-add', it.id, '＋')}</div>`;
    return rows || add ? '<div><b>Приёмка</b></div>' + rows + add : ''; }
  function viewWorks() {
    const REP = SM.fact.report(S);
    const o = S.object;
    return '<h2>Работы</h2><p class=hint>Статусы: запланировано → в работе → выполнено → принято. «Выполнено» меняет состояние объекта. «Принято» — только после чек-листа приёмки (его пункты — заметки «Приёмка» у операций технологии, а также пункты из справочника и свои; у пунктов «числовых допусков» есть поле «замер», сравнение с допуском делаете вы). Факт (объём, стоимость, расход материалов) вносится после начала работы и не меняет смету.</p>' + (REP.items.length ? `<div class=card><b>Итого по начатым работам:</b> план ${f2(REP.planWork)} ₽, факт ${f2(REP.factWork)} ₽ (стоимость указана по ${REP.costKnown} операциям)${REP.incomplete ? `<div class=warn>⚠ У выполненных работ не указана стоимость по ${REP.costMissing} операциям — факт неполный.</div>` : ''}</div>` : '') + o.geometry.rooms.map(r => {
      const items = S.plan.filter(p => p.roomId === r.id); if (!items.length) return '';
      return `<div class=card><h3>${esc(r.name)}</h3>` + items.map(it => { const v = SM.exec.view(S, it), t = SM.ver.resolve(S, it);
        return `<div class=op><b>${esc(t ? t.name : '(удалена)')}</b> <span class=hint>${it.techVer ? 'v' + it.techVer : ''}</span> — ${SM.exec.LABEL[v.status]}${verNote(it)}${kbLine(it.techId)}
          ${v.status === 'PLANNED' ? (v.canStart ? btn('w-start', it.id, 'Начать') : v.waits.map(x => `<div class=warn>⛔ ${esc(x)}</div>`).join('')) : ''}
          ${v.status === 'IN_PROGRESS' ? btn('w-complete', it.id, 'Выполнено') : ''}${v.status === 'COMPLETED' ? btn('w-accept', it.id, 'Принять') : ''}
          ${v.conditions.map(x => `<div class=hint>Условие: ${esc(x)}</div>`).join('')}${v.errors.map(x => `<div class=warn>Частая ошибка: ${esc(x)}</div>`).join('')}${kbWork(it)}
          ${v.status !== 'PLANNED' ? factBlock(it, REP, v.status) : ''}
          ${acceptBlock(it, v)}</div>`; }).join('') + '</div>'; }).join('') || '<i class=hint>План пуст — добавьте технологии в план во вкладке «Состояние».</i>';
  }
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: type || 'application/json'})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
  // ---------- Справочник (отдельное хранилище stroysmeta:kb, правится только здесь) ----------
  let KB = SM.kb.empty(), kbLocked = false, kbSelId = null, kbEdit = false, kbQ = '', kbOpen = new Set();
  try { KB = SM.kb.load(localStorage); } catch (e) { kbLocked = true; alert('Справочник не прочитан: ' + e.message + '. Его данные не тронуты и не будут перезаписаны; загрузите копию из файла во вкладке «Данные».'); }
  function saveKb(o) { if (kbLocked) return alert('Справочник не прочитан — правки не сохраняются. Загрузите копию из файла (вкладка «Данные»).'); const r = SM.kb.save(localStorage, KB, o); if (!r.ok) alert('Справочник не сохранён: ' + r.error + '. Скачайте копию во вкладке «Данные».'); }
  const kbLine = techId => { const ts = SM.kb.forTech(KB, techId); return ts.length ? `<div class=hint>📖 Справка: ${ts.map(x => btn('kb-open', x.id, esc(SM.kb.label(x)), 'class=kbl')).join(' ')}</div>` : ''; };
  function kbTree(pid, d) { return SM.kb.children(KB, pid).map(t => { const ch = SM.kb.children(KB, t.id), open = kbOpen.has(t.id);
    return `<div class="kbrow ${t.id === kbSelId ? 'on' : ''}" style="padding-left:${d * 14}px">${ch.length ? btn('kb-tog', t.id, open ? '▾' : '▸', 'class=kbc') : '<span class=kbc></span>'}<button class=kbl data-a=kb-sel data-p="${t.id}" title="${esc(SM.kb.label(t))}">${esc(SM.kb.label(t))}</button></div>` + (ch.length && open ? kbTree(t.id, d + 1) : ''); }).join(''); }
  function kbTopic() {
    const K = SM.kb, t = kbSelId && K.byId(KB, kbSelId); if (!t) return '<div class="card hint">Выберите тему слева.</div>';
    const crumbs = K.path(KB, t.id).slice(0, -1).map(x => btn('kb-open', x.id, esc(K.label(x)), 'class=kbl')).join(' › '), kids = K.children(KB, t.id), techs = t.techIds.map(id => S.techs.find(x => x.id === id)).filter(Boolean);
    const sub = new Set([t.id]); (function g(i) { K.children(KB, i).forEach(c => { sub.add(c.id); g(c.id); }); })(t.id);
    const head = kbEdit ? `<h3><input data-a=kb-set data-p="${t.id}|code" value="${esc(t.code)}" placeholder="№" style="width:80px"> <input data-a=kb-set data-p="${t.id}|title" value="${esc(t.title)}" style="width:70%"></h3>` : `<h3>${esc(K.label(t))}</h3>`;
    const secs = K.SECTIONS.map(([k, lb]) => { const v = t.sections[k] || '';
      return kbEdit ? `<div><b>${esc(lb)}</b><br><textarea data-a=kb-set data-p="${t.id}|s:${k}" rows="${Math.min(18, Math.max(3, v.split('\n').length + 1))}" style="width:100%">${esc(v)}</textarea></div>` : (v ? `<h4>${esc(lb)}</h4><div class=kbtext>${K.html(v)}</div>` : ''); }).join('');
    const move = kbEdit ? `<div>Перенести в: <select data-a=kb-set data-p="${t.id}|parent">${[['', '— корень —']].concat(KB.topics.filter(x => !sub.has(x.id)).map(x => [x.id, K.label(x)])).map(([k, l]) => `<option value="${esc(k)}" ${k === (t.parentId || '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>` : '';
    return `<div class=card><div class=hint>${crumbs}</div>${head}<div>${btn('kb-edit', '', kbEdit ? '✓ Готово' : '✎ Править')} ${btn('kb-add', t.id, '＋ Подтема')} ${btn('kb-del', t.id, 'Удалить тему')}</div>${move}
      ${secs || '<div class=hint>Тема пуста — нажмите «Править», чтобы добавить текст.</div>'}</div>
      <div class=card><b>Соответствует технологиям проекта:</b> ${techs.map(x => esc(x.name) + ' ' + btn('kb-unlink', t.id + '|' + x.id, '✕')).join('; ') || '<span class=hint>пока никаких — справка появится в карточках технологий и работ только после связи</span>'}<br>
        <select id=kbtech>${S.techs.filter(x => !t.techIds.includes(x.id)).map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select> ${btn('kb-link', t.id, 'Связать')}</div>
      ${kids.length ? `<div class=card><b>Подтемы:</b> ${kids.map(c => btn('kb-open', c.id, esc(K.label(c)), 'class=kbl')).join(' · ')}</div>` : ''}`;
  }
  function viewKb() {
    const K = SM.kb;
    if (!KB.topics.length) return `<h2>Справочник</h2><div class=card><p>Знания по этапам: инструменты и нормы, условия, ошибки, приёмка. Хранится отдельно от проекта и правится только здесь.</p>
      <p>Загрузить готовый файл справочника: <input type=file accept=".json,application/json" data-a=kb-file></p><p class=hint>или начать с пустого:</p>${btn('kb-add', '', '＋ Создать первую тему')}</div>`;
    const res = kbQ ? K.search(KB, kbQ, 60) : null;
    const left = res ? (res.map(r => `<div>${btn('kb-open', r.topic.id, esc(K.label(r.topic)), 'class=kbl')}<div class=hint style="margin-left:6px">${esc(r.where.map(w => K.SECTIONS.find(s => s[0] === w)[1]).join(', '))}${r.snippet ? ' — …' + esc(r.snippet) + '…' : ''}</div></div>`).join('') || '<div class=hint>Ничего не найдено.</div>') : kbTree(null, 0);
    return `<h2>Справочник <span class=hint>(${KB.topics.length} тем)</span></h2>
      <div><input data-a=kb-q value="${esc(kbQ)}" placeholder="поиск по всем темам (Enter)" style="width:260px"> ${kbQ ? btn('kb-q-clear', '', '✕') : ''} ${btn('kb-add', '', '＋ Тема в корне')} ${btn('kb-auto', '', 'Связать с технологиями по номеру этапа')}</div>
      <div class=kbgrid><div class="card kbtree">${left}</div><div>${kbTopic()}</div></div>`;
  }
  function kbDataBlock() { const c = cfg(), snaps = SM.kb.snaps(localStorage);
    return `<div class=card><h3>Справочник знаний</h3><p class=hint>Хранится отдельно от проекта: в этом браузере и (по кнопке) отдельным файлом в вашем приватном Gist. Тем: ${KB.topics.length}, текста ≈ ${Math.round(SM.kb.size(KB) / 1024)} КБ.</p>
      <button data-a=kb-export>⬇ Скачать копию справочника</button> <label>⬆ Загрузить из файла: <input type=file accept=".json,application/json" data-a=kb-file></label>
      ${c.token && c.gistId ? `<div>${btn('kb-cloud-push', '', '☁ Отправить справочник в облако')} ${btn('kb-cloud-pull', '', '☁ Загрузить справочник из облака')}</div>` : '<p class=hint>Подключите облако выше — тогда справочник можно отправлять в облако и забирать оттуда.</p>'}
      ${snaps.length ? `<div>${btn('kb-restore', '', 'Вернуть предыдущую версию справочника от ' + new Date(snaps[snaps.length - 1].t).toLocaleString('ru-RU'))}</div>` : ''}</div>`; }
  async function kbCloudPush() { try { const cl = cloudApi(), txt = await cl.getFile(SM.kb.GFILE); let r = null; if (txt) { try { r = SM.kb.parse(txt); } catch (e) { r = null; } }
      if (r && r.updated > KB.updated && !confirm('В облаке справочник новее вашего. Перезаписать его текущим? Облачная версия будет потеряна.')) return render();
      if (r && r.topics.length && !KB.topics.length && !confirm('Локальный справочник пуст, а в облаке он есть. Перезаписать облако пустым?')) return render();
      await cl.putFile(SM.kb.GFILE, SM.kb.toJson(KB)); alert('Справочник отправлен в облако'); } catch (e) { alert('Облако: ' + e.message); } render(); }
  async function kbCloudPull() { try { const txt = await cloudApi().getFile(SM.kb.GFILE); if (!txt) return alert('В облаке нет справочника'); const d = SM.kb.parse(txt);
      if (confirm('Заменить локальный справочник облачным (тем: ' + d.topics.length + ')? Текущий сохранится в копию.')) { SM.kb.snap(localStorage, KB); KB = d; kbLocked = false; kbSelId = null; saveKb({keepStamp: true}); } } catch (e) { alert('Облако: ' + e.message); } render(); }
  let LG = null;   // прочитанные данные старого приложения {data, objs, src, report}
  function lgBlock() {
    const r = LG && LG.report, list = LG ? LG.objs.map(o => `<div>• <b>${esc(o.name)}</b> — помещений ${o.rooms}, выбрано этапов ${o.stages}, доп. позиций ${o.extras} ${btn('lg-import', o.id, 'Перенести в проект')}</div>`).join('') || '<div class=hint>В старых данных нет объектов.</div>' : '';
    return `<div class=card><h3>Перенос объектов из старого приложения</h3><p class=hint>Старое приложение осталось доступным: <a href="old.html" style="color:var(--ac)">old.html</a> (данные те же, в этом браузере). Помещения становятся геометрией, выбранные этапы — планом работ по помещениям. Ничего не удаляется, перед переносом делается точка отката; повторный перенос того же объекта ничего не дублирует. Технологии и материалы переносятся кнопкой на вкладке «Технологии» или автоматически вместе с объектом.</p>
      <button data-a=lg-load>Прочитать из этого браузера</button> <label>или файл копии старого приложения: <input type=file accept=".json,application/json" data-a=lg-file></label>
      ${LG ? `<p class=hint>Источник: ${esc(LG.src)}</p>${list}` : ''}
      ${r ? `<div class=card><b>Перенесено:</b> помещений ${r.rooms}, пунктов плана ${r.items}, технологий ${r.techs}, материалов ${r.materials}.${r.skipped.length ? '<div class=warn>Не перенесено:</div>' + r.skipped.map(x => `<div>• ${esc(x.name)} — ${esc(x.reason)}</div>`).join('') : ''}${r.notes.length ? '<div class=hint>Замечания:</div>' + r.notes.map(x => `<div class=hint>• ${esc(x)}</div>`).join('') : ''}</div>` : ''}</div>`;
  }
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
      ${lgBlock()}
      ${kbDataBlock()}
      <div class=card><h3>Точки отката</h3><p class=hint>Делаются сами (не чаще раза в 5 минут, последние ${SM.store.MAX_SNAPS}) и перед любой заменой данных.</p>
        ${sn.length ? '<table>' + sn.map((x, i) => [x, i]).reverse().map(([x, i]) => `<tr><td>${new Date(x.t).toLocaleString('ru-RU')}<td>${btn('restore-snap', i, 'Вернуть')}</tr>`).join('') + '</table>' : '<div class=hint>Появятся после первых изменений.</div>'}
        ${btn('snap-now', '', 'Сделать точку отката сейчас')}</div>`;
  }
  const VIEWS = {object: viewObject, state: viewState, routes: viewRoutes, works: viewWorks, techs: viewTechs, materials: viewMaterials, estimate: viewEstimate, buy: viewBuy, kb: viewKb, data: viewData};
  const TABS = [['object', 'Объект'], ['state', 'Состояние'], ['routes', 'Маршруты'], ['works', 'Работы'], ['techs', 'Технологии'], ['materials', 'Материалы'], ['estimate', 'Смета'], ['buy', 'Закупка'], ['kb', 'Справочник'], ['data', 'Данные']];
  function render() { const y = scrollY; $('nav').innerHTML = TABS.map(([k, t]) => `<button class="${k === tab ? 'on' : ''}" data-a=tab data-p=${k}>${t}</button>`).join('') + '<span id=sync class=hint style="padding:8px;white-space:nowrap"></span>'; paintSync(); $('main').innerHTML = VIEWS[tab](); scrollTo(0, y); }
  const NEW = {tech: () => ({id: uid(), name: 'Новая технология', params: [], ops: []}), op: () => ({id: uid(), name: '', unit: 'м2', price: null, qty: '', mats: []}), mat: () => ({id: uid(), matId: '', rate: ''}),
    route: () => ({id: uid(), name: 'Новый маршрут', roomId: S.object.geometry.rooms[0] ? S.object.geometry.rooms[0].id : '', steps: [], assume: []}), rstep: () => ({processId: '', techId: ''}), rassume: () => ({kind: 'floor', layer: '', value: 'YES'}),
    note: () => ({id: uid(), cat: 'accept', text: ''}), pause: () => ({id: uid(), beforeId: '', afterId: '', minDays: null, maxDays: null, note: ''}),
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
      if (!S.plan.some(x => x.roomId === rid && x.processId === pid && x.techId === el.value)) { const it = {id: uid(), techId: el.value, roomId: rid, processId: pid, values: {}}; S.plan.push(it); SM.ver.pin(S, it); } },
    'w-start'(id) { try { SM.exec.start(S, S.plan.find(x => x.id === id)); } catch (e) { alert(e.message); } },
    'w-complete'(id) { try { SM.exec.complete(S, S.plan.find(x => x.id === id)); } catch (e) { alert(e.message); } },
    'w-accept'(id) { try { SM.exec.accept(S, S.plan.find(x => x.id === id)); } catch (e) { alert(e.message); } },
    'plan-add'() { const it = {id: uid(), techId: $('pt').value, roomId: $('pr').value, values: {}}; S.plan.push(it); SM.ver.pin(S, it); },
    'ver-update'(id) { try { SM.ver.update(S, S.plan.find(x => x.id === id)); } catch (e) { alert(e.message); } },
    'ver-release'(id) { try { SM.ver.release(S, id); } catch (e) { alert(e.message); } },
    'lg-load'() { let raw = null; try { raw = localStorage.getItem('stroysmeta:v3'); } catch (e) {}
      if (!raw) return alert('Старые данные в этом браузере не найдены. Откройте приложение с того же адреса, где вы работали в старом (old.html), или загрузите файл копии.'); lgSet(JSON.parse(raw), 'этот браузер'); },
    'lg-import'(id) { const o = LG.data.objects.find(x => x.id === id); if (!o || !confirm('Перенести объект «' + o.name + '» в текущий проект? Текущие данные сохранятся в точку отката.')) return;
      try { SM.store.snap(localStorage, S, true); const C = JSON.parse(JSON.stringify(S)); LG.report = SM.legacy.importObject(LG.data, o, C); S = C; } catch (e) { alert('Перенос не выполнен, данные не тронуты: ' + e.message); } },
    'kb-sel'(id) { kbSelId = id; kbEdit = false; },
    'kb-open'(id) { tab = 'kb'; kbQ = ''; kbSelId = id; kbEdit = false; SM.kb.path(KB, id).slice(0, -1).forEach(x => kbOpen.add(x.id)); },
    'kb-tog'(id) { kbOpen.has(id) ? kbOpen.delete(id) : kbOpen.add(id); },
    'kb-edit'() { kbEdit = !kbEdit; },
    'kb-q-clear'() { kbQ = ''; },
    'kb-add'(pid) { const t = SM.kb.add(KB, pid || null, 'Новая тема'); if (pid) kbOpen.add(pid); kbSelId = t.id; kbEdit = true; saveKb(); },
    'kb-del'(id) { const t = SM.kb.byId(KB, id), n = SM.kb.children(KB, id).length;
      if (!t || !confirm('Удалить тему «' + SM.kb.label(t) + '»' + (n ? ' вместе с подтемами' : '') + '? Перед удалением делается копия справочника.')) return;
      SM.kb.snap(localStorage, KB); kbSelId = t.parentId; SM.kb.remove(KB, id); saveKb(); },
    'kb-link'(id) { const v = $('kbtech') && $('kbtech').value; if (!v) return alert('Нет технологий для связи'); SM.kb.link(KB, id, v); saveKb(); },
    'kb-unlink'(p) { const [id, techId] = p.split('|'); SM.kb.unlink(KB, id, techId); saveKb(); },
    'kb-auto'() { const n = SM.kb.autoLink(KB, S.techs); saveKb(); alert(n ? 'Связано тем с технологиями: ' + n : 'Новых связей не найдено (ищется номер этапа в названии технологии, например «2.5.6.»)'); },
    'kb-export'() { download('stroysmeta-kb_' + new Date().toISOString().slice(0, 10) + '.json', SM.kb.toJson(KB)); },
    'kb-restore'() { const a = SM.kb.snaps(localStorage), i = a.length - 1; if (i < 0) return; try { const d = SM.kb.snapData(localStorage, i);
      if (confirm('Вернуть справочник на состояние от ' + new Date(a[i].t).toLocaleString('ru-RU') + '? Текущий сохранится в копию.')) { SM.kb.snap(localStorage, KB); KB = d; kbLocked = false; kbSelId = null; saveKb({keepStamp: true}); } } catch (e) { alert(e.message); } },
    'kb-cloud-push'() { kbCloudPush(); }, 'kb-cloud-pull'() { kbCloudPull(); },
    'norm-tog'(id) { normOpen.has(id) ? normOpen.delete(id) : normOpen.add(id); },
    'norm-all'(p) { const [id, on] = p.split('|'); SM.norms.setAll(S, KB, id, on === '1'); },
    'acc-kb'(id) { const it = S.plan.find(x => x.id === id); try { const n = SM.exec.addAccept(it, kbAcceptNew(it)); if (!n) alert('Новых пунктов в справочнике нет'); } catch (e) { alert(e.message); } },
    'acc-add'(id) { const it = S.plan.find(x => x.id === id), el = $('acc-' + id), text = el ? el.value.trim() : ''; if (!text) return; try { SM.exec.addAccept(it, [{text, src: 'custom'}]); } catch (e) { alert(e.message); } },
    'acc-del'(p) { const [id, nid] = p.split('|'); try { SM.exec.removeAccept(S.plan.find(x => x.id === id), nid); } catch (e) { alert(e.message); } },
    approve() { SM.fact.approve(S, $('an') ? $('an').value : ''); },
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
  const NOSAVE = new Set(['tab', 'norm-tog', 'lg-load', 'export-json', 'export-xlsx', 'snap-now', 'restore-snap', 'cloud-on', 'cloud-off', 'cloud-auto', 'cloud-check', 'cloud-push', 'cloud-pull']);
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
  function lgSet(d, src) { if (!d || !Array.isArray(d.stages) || !Array.isArray(d.objects)) return alert('Это не копия старого приложения «Смета»');
    if (d.objects.some(o => o.items || o.params)) return alert('Файл старого формата: откройте старое приложение (old.html) один раз — оно обновит данные, потом прочитайте из браузера.');
    LG = {data: d, objs: SM.legacy.objects(d), src}; }
  document.addEventListener('change', async e => { const t = e.target; if (t.dataset.a !== 'kb-file' || !t.files[0]) return;
    try { const d = SM.kb.parse(await t.files[0].text());
      if (!KB.topics.length || confirm('Заменить справочник (тем: ' + KB.topics.length + ') данными из файла (тем: ' + d.topics.length + ')? Ваши правки в текущем справочнике будут заменены; перед этим делается копия.')) { SM.kb.snap(localStorage, KB); KB = d; kbLocked = false; kbSelId = null; saveKb(); alert('Справочник загружен: тем ' + d.topics.length); } }
    catch (err) { alert('Не удалось загрузить: ' + err.message); } t.value = ''; render(); });
  document.addEventListener('change', e => { const t = e.target, a = t.dataset.a; if (a !== 'kb-set' && a !== 'kb-q') return;
    if (a === 'kb-q') { kbQ = t.value.trim(); return render(); }
    const [id, f] = t.dataset.p.split('|'); try { if (f === 'title' || f === 'code') SM.kb.update(KB, id, {[f]: t.value}); else if (f === 'parent') { SM.kb.move(KB, id, t.value || null); if (t.value) kbOpen.add(t.value); } else if (f.startsWith('s:')) SM.kb.setSection(KB, id, f.slice(2), t.value); } catch (err) { alert(err.message); }
    saveKb(); if (!f.startsWith('s:')) render(); });
  document.addEventListener('change', async e => { const t = e.target; if (t.dataset.a !== 'lg-file' || !t.files[0]) return;
    try { lgSet(JSON.parse(await t.files[0].text()), 'файл ' + t.files[0].name); } catch (err) { alert('Не удалось прочитать файл: ' + err.message); } t.value = ''; render(); });
  document.addEventListener('change', e => { const t = e.target; if (t.dataset.a !== 'fact') return; const [id, kind, x, field] = t.dataset.p.split('|'), it = S.plan.find(p => p.id === id), v = t.value.trim().replace(',', '.');
    try { if (kind === 'op') SM.fact.setOp(it, x, field, v); else SM.fact.setMat(it, x, v); } catch (err) { alert(err.message); } save(); render(); });
  document.addEventListener('change', async e => { const t = e.target; if (t.dataset.a !== 'import-json' || !t.files[0]) return;
    try { const next = SM.store.parse(await t.files[0].text());
      if (confirm('Заменить текущие данные данными из файла «' + t.files[0].name + '»? Текущие сохранятся в точку отката.')) S = SM.store.replace(localStorage, S, next); } catch (err) { alert('Не удалось загрузить: ' + err.message); }
    t.value = ''; render(); });
  document.addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (!b) return; const a = A[b.dataset.a]; if (a) { a(b.dataset.p, b); if (!NOSAVE.has(b.dataset.a) && !b.dataset.a.startsWith('kb-')) save(); render(); } });
  document.addEventListener('change', e => { const t = e.target; if (t.dataset.a !== 'set') return; const k = t.dataset.p.split('.'), key = k.pop(), o = get(k.join('.') || '');
    let v = t.value.trim(); if (t.dataset.n) { v = v === '' ? null : parseFloat(v.replace(',', '.')); if (v !== null && !isFinite(v)) v = null; }
    if (k.length === 1 && k[0] === 'bought' || k[0] === 'bought') S.bought[key] = v; else o[key] = v; save(); render(); });
  document.addEventListener('change', e => { const t = e.target; if (t.dataset.a !== 'state') return; const [id, layer] = t.dataset.p.split('|'); SM.model.setState(S.object, id, layer, t.value); save(); render(); });
  document.addEventListener('change', e => { const t = e.target; if (t.dataset.a !== 'measure') return; const [id, nid] = t.dataset.p.split('|'); try { SM.exec.setMeasure(S.plan.find(x => x.id === id), nid, t.value); } catch (err) { alert(err.message); } save(); });
  document.addEventListener('change', e => { const t = e.target; if (t.dataset.a !== 'norm-ok') return; const [id, k] = t.dataset.p.split('|'); SM.norms.set(S, id, k, t.checked); save(); render(); });
  document.addEventListener('change', e => { const t = e.target; if (t.dataset.a !== 'check') return; const [id, nid] = t.dataset.p.split('|'); SM.exec.check(S.plan.find(x => x.id === id), nid, t.checked); save(); render(); });
  S = load(); SM.store.save(localStorage, S, {keepStamp: true}); render(); if (cfg().token) cloudCheck();
})();
