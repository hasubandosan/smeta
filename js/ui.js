/* Интерфейс новой модели (new.html). Только показ и вызов SM.*; расчёты — в js/estimate.js и js/geometry.js */
(function () {
  'use strict';
  const KEY = 'stroysmeta:model', $ = id => document.getElementById(id), uid = SM.uid;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const f2 = n => (n === null || n === undefined || !isFinite(n) ? '?' : n.toLocaleString('ru-RU', {maximumFractionDigits: 2}));
  let S, tab = 'object';
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw); localStorage.setItem(KEY + ':backup', raw); d.object = SM.model.migrate(d.object); return d; } } catch (e) { alert('Не удалось прочитать данные: ' + e.message + '. Данные не тронуты.'); throw e; }
    return {object: SM.seeds.bathroom(), techs: [], materials: [], plan: [], fin: {waste: 0, reserve: 0}, bought: {}};
  }
  const save = () => localStorage.setItem(KEY, JSON.stringify(S));
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
  function viewTechs() {
    return '<h2>Технологии</h2><p class=hint>Технология = набор операций. У операции: единица, цена работы за единицу, формула объёма и материалы с расходом на единицу. В формулах: floor, ceiling, walls, perimeter, height, box и свои параметры технологии.</p>' +
      S.techs.map((t, ti) => `<div class=card><h3>${inp('techs.' + ti + '.name', t.name, {w: 260})} ${btn('del', 'techs.' + ti, 'Удалить технологию')}</h3>
      <div>Параметры: ${(t.params || []).map((p, i) => inp(`techs.${ti}.params.${i}.key`, p.key, {w: 80, ph: 'имя'}) + '=' + inp(`techs.${ti}.params.${i}.def`, p.def, {n: 1, w: 50}) + btn('del', `techs.${ti}.params.${i}`, '✕')).join(' ')} ${btn('add', 'techs.' + ti + '.params', '＋ параметр', 'data-k=param')}</div>
      ${t.ops.map((op, oi) => `<div class=op><div>${inp(`techs.${ti}.ops.${oi}.name`, op.name, {w: 240, ph: 'Операция'})} ${btn('del', `techs.${ti}.ops.${oi}`, '✕')}</div>
        <div>ед. ${inp(`techs.${ti}.ops.${oi}.unit`, op.unit, {w: 50, ph: 'м2'})} цена ₽ ${inp(`techs.${ti}.ops.${oi}.price`, op.price, {n: 1, w: 70})} объём = ${inp(`techs.${ti}.ops.${oi}.qty`, op.qty, {w: 150, ph: 'floor'})}</div>
        ${(op.mats || []).map((m, mi) => `<div class=mat>${sel(`techs.${ti}.ops.${oi}.mats.${mi}.matId`, m.matId, matOpts())} расход на ед. ${inp(`techs.${ti}.ops.${oi}.mats.${mi}.rate`, m.rate, {w: 130, ph: '1.9 или формула'})} ${btn('del', `techs.${ti}.ops.${oi}.mats.${mi}`, '✕')}</div>`).join('')}
        ${btn('add', `techs.${ti}.ops.${oi}.mats`, '＋ материал', 'data-k=mat')}</div>`).join('')}
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
      ${S.plan.map((p, i) => { const t = S.techs.find(x => x.id === p.techId); return `<div>• ${esc(t ? t.name : '(удалена)')} — ${esc((rooms.find(r => r[0] === p.roomId) || [0, '?'])[1])} ${btn('del', 'plan.' + i, '✕')}</div>`; }).join('')}</div>
      <table><tr><th>Операция<th>Объём<th>Работа, ₽</tr>${R.rows.map(r => `<tr><td>${esc(r.tech.name)} › ${esc(r.op.name)}<td>${r.q === null ? `<span class=warn>? ${r.missing.length ? 'нет: ' + esc(r.missing.join(', ')) : esc(r.error || '')}</span>` : f2(r.q) + ' ' + esc(r.op.unit)}<td class=n>${f2(r.work)}</tr>`).join('')}</table>
      <div class=card>Потери на подрезку, % ${inp('fin.waste', S.fin.waste, {n: 1, w: 50})} Запас, % ${inp('fin.reserve', S.fin.reserve, {n: 1, w: 50})}</div>
      <div class=kpi><span>Работы <b>${f2(R.work)} ₽</b></span><span>Материалы (к закупке) <b>${f2(R.mat)} ₽</b></span><span>Итого <b>${f2(R.total)} ₽</b></span></div>${R.incomplete ? '<div class=warn>⚠ Часть данных неизвестна — итог неполный (отмечено «?»).</div>' : ''}`;
  }
  function viewBuy() {
    const R = SM.est.compute(S), o = S.object;
    return `<h2>Закупка</h2><table><tr><th>Материал<th>Нужно<th>+потери<th>+запас<th>Всего<th>Куплено<th>Докупить<th>Упак.<th>₽</tr>${R.buy.map(b => `<tr><td>${esc(b.m.name)}<td class=n>${f2(b.base)}<td class=n>${f2(b.waste)}<td class=n>${f2(b.reserve)}<td class=n>${f2(b.total)} ${esc(b.m.unit)}<td>${inp('bought.' + b.id, (S.bought || {})[b.id], {n: 1, w: 60})}<td class=n>${f2(b.rest)}<td class=n>${b.packs === null ? '<span class=warn>? нет данных об упаковке</span>' : b.packs}<td class=n>${f2(b.cost)}${b.incomplete ? ' ⚠' : ''}</tr>`).join('')}</table>
      <div class=card><b>Уже куплено (из описания объекта)</b>${o.purchased.map(p => `<div>• ${esc(p.name)}: ${p.qty === null ? '?' : p.qty} ${esc(p.unit)} <i class=hint>${esc(p.note || '')}</i></div>`).join('')}<p class=hint>Чтобы учесть купленное — впишите количество в колонку «Куплено» нужного материала выше.</p></div>`;
  }
  const VIEWS = {object: viewObject, techs: viewTechs, materials: viewMaterials, estimate: viewEstimate, buy: viewBuy};
  const TABS = [['object', 'Объект'], ['techs', 'Технологии'], ['materials', 'Материалы'], ['estimate', 'Смета'], ['buy', 'Закупка']];
  function render() { const y = scrollY; $('nav').innerHTML = TABS.map(([k, t]) => `<button class="${k === tab ? 'on' : ''}" data-a=tab data-p=${k}>${t}</button>`).join(''); $('main').innerHTML = VIEWS[tab](); scrollTo(0, y); }
  const NEW = {tech: () => ({id: uid(), name: 'Новая технология', params: [], ops: []}), op: () => ({id: uid(), name: '', unit: 'м2', price: null, qty: '', mats: []}), mat: () => ({id: uid(), matId: '', rate: ''}),
    param: () => ({key: '', def: null}), material: () => ({id: uid(), name: 'Новый материал', unit: 'кг', packQty: null, price: null})};
  const A = {
    tab(p) { tab = p; }, del(p) { const k = p.split('.'), i = +k.pop(), arr = get(k.join('.')); const x = arr[i]; arr.splice(i, 1); if (k.join('.') === 'object.geometry.openings' || x === undefined) return; },
    add(p, el) { get(p).push(NEW[el.dataset.k]()); },
    'wall-add'(p) { const g = S.object.geometry, r = g.rooms[+p], w = {id: uid(), name: 'Стена ' + (r.wallIds.length + 1), len: null, turn: 90, material: ''}; g.walls.push(w); r.wallIds.push(w.id); },
    'wall-del'(p) { const [ri, i] = p.split('.').map(Number), g = S.object.geometry, r = g.rooms[ri], id = r.wallIds[i]; r.wallIds.splice(i, 1); if (!g.rooms.some(x => x.wallIds.includes(id))) g.walls = g.walls.filter(w => w.id !== id); },
    'open-add'(p) { const g = S.object.geometry; g.openings.push({id: uid(), roomId: g.rooms[+p].id, wallId: null, kind: 'дверь', w: null, h: null}); },
    'room-add'() { const g = S.object.geometry, ws = [0, 1, 2, 3].map(i => ({id: uid(), name: 'Стена ' + (i + 1), len: 3, turn: 90, material: ''})); g.walls.push(...ws); g.rooms.push({id: uid(), name: 'Помещение ' + (g.rooms.length + 1), height: 2.7, wallIds: ws.map(w => w.id)}); },
    'plan-add'() { S.plan.push({id: uid(), techId: $('pt').value, roomId: $('pr').value, values: {}}); }
  };
  document.addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (!b) return; const a = A[b.dataset.a]; if (a) { a(b.dataset.p, b); save(); render(); } });
  document.addEventListener('change', e => { const t = e.target; if (t.dataset.a !== 'set') return; const k = t.dataset.p.split('.'), key = k.pop(), o = get(k.join('.') || '');
    let v = t.value.trim(); if (t.dataset.n) { v = v === '' ? null : parseFloat(v.replace(',', '.')); if (v !== null && !isFinite(v)) v = null; }
    if (k.length === 1 && k[0] === 'bought' || k[0] === 'bought') S.bought[key] = v; else o[key] = v; save(); render(); });
  S = load(); save(); render();
})();
