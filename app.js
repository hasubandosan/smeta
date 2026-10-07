'use strict';
/* ================= ДАННЫЕ ================= */
const KEY = 'stroysmeta:v2';
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = n => isFinite(n) ? n.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
const fmtQ = n => isFinite(n) ? n.toLocaleString('ru-RU',{maximumFractionDigits:3}) : '—';
const n2 = x => Math.round((+x || 0) * 100) / 100;
const byId = (a, id) => a.find(x => x.id === id);

function seed() {
  const m = (name, category, unit, price, packQty) => ({id:uid(), name, category, unit, price, packQty});
  const cement = m('Цемент М500','material','кг',420,50), sand = m('Песок','material','кг',150,25),
        primer = m('Грунтовка','material','л',900,10), paint = m('Краска водоэмульсионная','material','л',2400,9),
        gloves = m('Перчатки','consumable','пар',60,1);
  const screed = {id:uid(), name:'Стяжка ЦПС 5 см', unit:'м2', components:[
    {refType:'material',refId:cement.id,rate:15},{refType:'material',refId:sand.id,rate:45}]};
  const rough = {id:uid(), parentId:'', name:'Черновые работы', unit:'', price:0, components:[]};
  const fin = {id:uid(), parentId:'', name:'Чистовые работы', unit:'', price:0, components:[]};
  const stages = [rough,
    {id:uid(), parentId:rough.id, name:'Стяжка пола', unit:'м2', price:450, components:[
      {refType:'composite',refId:screed.id,rate:1},{refType:'material',refId:gloves.id,rate:0.02}]},
    fin,
    {id:uid(), parentId:fin.id, name:'Покраска стен', unit:'м2', price:250, components:[
      {refType:'material',refId:primer.id,rate:0.1},{refType:'material',refId:paint.id,rate:0.25}]}];
  return {materials:[cement,sand,primer,paint,gloves], composites:[screed], stages, objects:[]};
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw); return Object.assign({materials:[],composites:[],stages:[],objects:[]}, d); }
  } catch (e) { console.error(e); }
  return seed();
}
let S = load();
const ui = {tab:'objects', objId:null, collapsed:new Set(), comp:new Set(), rows:new Set(), custom:false};
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { alert('Не удалось сохранить: ' + e.message); } }
function commit() { save(); render(); }

/* ================= РАСЧЁТЫ ================= */
const unitPrice = m => (+m.packQty > 0 ? (+m.price || 0) / +m.packQty : 0);
const getObj = (type, id) => type === 'stage' ? byId(S.stages,id) : type === 'composite' ? byId(S.composites,id) : byId(S.materials,id);
const kids = pid => S.stages.filter(s => (s.parentId || '') === (pid || ''));
function path(id) { const a = []; let n = byId(S.stages,id); while (n) { a.unshift(n.name); n = n.parentId ? byId(S.stages,n.parentId) : null; } return a; }
function topName(id) { const p = path(id); return p[0] || ''; }

// стоимость 1 единицы: {mat, cons, labor, cyc}
function cost(type, id, vis = new Set()) {
  const z = {mat:0, cons:0, labor:0, cyc:false};
  if (type === 'material') {
    const m = byId(S.materials,id); if (!m) return z;
    z[m.category === 'consumable' ? 'cons' : 'mat'] = unitPrice(m); return z;
  }
  const o = getObj(type,id); if (!o) return z;
  const k = type[0] + id; if (vis.has(k)) { z.cyc = true; return z; }
  const v = new Set(vis).add(k);
  if (type === 'stage') z.labor = +o.price || 0;
  for (const c of o.components || []) {
    const s = cost(c.refType, c.refId, v), r = +c.rate || 0;
    z.mat += r*s.mat; z.cons += r*s.cons; z.labor += r*s.labor; if (s.cyc) z.cyc = true;
  }
  return z;
}
// сколько каких материалов нужно на qty единиц: Map(materialId -> qty)
function mats(type, id, qty, acc = new Map(), vis = new Set()) {
  if (type === 'material') { if (byId(S.materials,id)) acc.set(id, (acc.get(id) || 0) + qty); return acc; }
  const o = getObj(type,id); if (!o) return acc;
  const k = type[0] + id; if (vis.has(k)) return acc;
  const v = new Set(vis).add(k);
  for (const c of o.components || []) mats(c.refType, c.refId, qty * (+c.rate || 0), acc, v);
  return acc;
}

// формулы количества: "floor*1.1", "(walls-3)/2"
function evalExpr(src, vars) {
  if (typeof src === 'number') return src;
  const s = String(src == null ? '' : src).trim().replace(/,/g,'.');
  if (!s) return 0;
  const re = /\s*(?:(\d+\.?\d*|\.\d+)|([\p{L}_][\p{L}\d_]*)|(\S))/uy;
  const t = []; let i = 0, m;
  while (i < s.length) {
    re.lastIndex = i; m = re.exec(s); if (!m) return NaN; i = re.lastIndex;
    if (m[1] !== undefined) t.push({n:parseFloat(m[1])});
    else if (m[2] !== undefined) { if (!(m[2] in vars)) return NaN; t.push({n:vars[m[2]]}); }
    else t.push({o:m[3]});
  }
  let p = 0;
  const expr = () => { let v = term(); while (t[p] && (t[p].o === '+' || t[p].o === '-')) { const o = t[p++].o, r = term(); v = o === '+' ? v + r : v - r; } return v; };
  const term = () => { let v = unary(); while (t[p] && (t[p].o === '*' || t[p].o === '/')) { const o = t[p++].o, r = unary(); v = o === '*' ? v * r : v / r; } return v; };
  const unary = () => { if (t[p] && t[p].o === '-') { p++; return -unary(); } if (t[p] && t[p].o === '+') { p++; return unary(); } return atom(); };
  const atom = () => { const x = t[p++]; if (!x) return NaN; if (x.n !== undefined) return x.n;
    if (x.o === '(') { const v = expr(); if (!t[p] || t[p].o !== ')') return NaN; p++; return v; } return NaN; };
  const v = expr();
  return p === t.length && isFinite(v) ? v : NaN;
}
function vars(o) { const v = Object.create(null); for (const p of o.params || []) v[p.key] = +String(p.value).replace(',','.') || 0; return v; }

// разбор позиции объекта
function info(o, it) {
  const q = evalExpr(it.qty, vars(o)), bad = isNaN(q), qty = bad ? 0 : q;
  let name, unit, grp = 'Прочее', parent = '', uc = {mat:0,cons:0,labor:0,cyc:false}, pill = it.type, pillLabel;
  if (it.type === 'custom') {
    name = it.name; unit = it.unit; pill = it.category; pillLabel = 'своя: ' + ({material:'материал',consumable:'расходник',labor:'работа'}[it.category]);
    uc[it.category === 'consumable' ? 'cons' : it.category === 'labor' ? 'labor' : 'mat'] = +it.price || 0;
  } else {
    const obj = getObj(it.type, it.refId);
    name = obj ? obj.name : '(удалено)'; unit = obj ? obj.unit : '';
    if (obj) uc = cost(it.type, it.refId);
    if (it.type === 'stage' && obj) { parent = path(obj.parentId).join(' › '); grp = topName(obj.id); }
    if (it.type === 'material' && obj && obj.category === 'consumable') pill = 'consumable';
    pillLabel = {stage:'этап', composite:'композит', material:'материал', consumable:'расходник'}[pill];
  }
  const mat = qty*uc.mat, cons = qty*uc.cons, labor = qty*uc.labor;
  return {name, unit, parent, grp, uc, pill, pillLabel, q:qty, bad, mat, cons, labor, total:mat+cons+labor, cyc:uc.cyc};
}
function totals(o) {
  const T = {mat:0, cons:0, labor:0, total:0, groups:new Map()};
  for (const it of o.items) {
    const r = info(o, it); T.mat += r.mat; T.cons += r.cons; T.labor += r.labor; T.total += r.total;
    const g = T.groups.get(r.grp) || {mat:0,cons:0,labor:0,total:0};
    g.mat += r.mat; g.cons += r.cons; g.labor += r.labor; g.total += r.total; T.groups.set(r.grp, g);
  }
  return T;
}
// список материалов к закупке
function buyList(o) {
  const acc = new Map(), extra = [];
  for (const it of o.items) {
    const r = info(o, it);
    if (it.type === 'custom') { if (it.category !== 'labor') extra.push({name:it.name, cat:it.category, unit:it.unit, qty:r.q, packQty:0, packs:0, exact:r.q*(+it.price||0), buy:r.q*(+it.price||0)}); continue; }
    mats(it.type, it.refId, r.q, acc);
  }
  const list = [];
  for (const [id, qty] of acc) {
    const m = byId(S.materials,id), pq = +m.packQty > 0 ? +m.packQty : 0;
    const packs = pq ? Math.ceil(qty / pq - 1e-9) : 0;
    list.push({name:m.name, cat:m.category, unit:m.unit, qty, packQty:pq, packs, exact:qty*unitPrice(m), buy:packs*(+m.price||0)});
  }
  list.sort((a,b) => (a.cat === b.cat ? a.name.localeCompare(b.name,'ru') : a.cat === 'material' ? -1 : 1));
  return list.concat(extra);
}

/* ================= ОБЩИЕ ЭЛЕМЕНТЫ ================= */
function options(f) {
  let h = '<option value="">— выбрать —</option>';
  const grp = (label, arr, val, txt) => arr.length ? `<optgroup label="${label}">` + arr.map(x => `<option value="${val(x)}">${esc(txt(x))}</option>`).join('') + '</optgroup>' : '';
  if (f.stages) h += grp('Этапы работ', S.stages.filter(s => s.unit), s => 'stage:'+s.id, s => path(s.id).join(' › ') + ' (' + s.unit + ')');
  if (f.composites) h += grp('Композиты', S.composites.filter(c => c.id !== f.exclude), c => 'composite:'+c.id, c => c.name + ' (' + c.unit + ')');
  if (f.materials) {
    h += grp('Материалы', S.materials.filter(m => m.category !== 'consumable'), m => 'material:'+m.id, m => m.name + ' (' + m.unit + ')');
    h += grp('Расходники', S.materials.filter(m => m.category === 'consumable'), m => 'material:'+m.id, m => m.name + ' (' + m.unit + ')');
  }
  return h;
}
function compEditor(kind, o) {
  const rows = (o.components || []).map((c, i) => {
    const it = getObj(c.refType, c.refId), cs = it ? cost(c.refType, c.refId) : {mat:0,cons:0,labor:0};
    const pill = c.refType === 'composite' ? 'composite' : (it && it.category === 'consumable' ? 'consumable' : 'material');
    const up = cs.mat + cs.cons + cs.labor;
    return `<tr><td><span class="pill ${pill}">${{composite:'композит',consumable:'расходник',material:'материал'}[pill]}</span>${esc(it ? it.name : '(удалено)')}</td>
      <td class="num" style="width:150px"><input class="cell num" style="width:80px" data-act="set-comp" data-kind="${kind}" data-id="${o.id}" data-i="${i}" value="${esc(c.rate)}"> <span class="hint">${esc(it ? it.unit : '')}</span></td>
      <td class="num">${fmt(up)} ₽</td><td class="num">${fmt(up*(+c.rate||0))} ₽</td>
      <td><button class="btn sm ghost danger" data-act="del-comp" data-kind="${kind}" data-id="${o.id}" data-i="${i}">✕</button></td></tr>`;
  }).join('');
  return `<div class="scroll">${rows ? `<table><thead><tr><th>Что входит</th><th class="num">Расход на 1 ед.</th><th class="num">Цена/ед.</th><th class="num">Сумма</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="hint" style="padding:6px 0">Состав пуст.</div>'}</div>
    <div class="addrow" style="padding:8px 0 0;border:0">
      <div class="field"><label>Материал, расходник или композит</label><select id="cs_${o.id}" style="min-width:230px">${options({materials:true, composites:true, exclude: kind==='composite'?o.id:''})}</select></div>
      <div class="field"><label>Расход на 1 ${esc(o.unit || 'ед.')}</label><input class="narrow" id="cr_${o.id}" placeholder="1"></div>
      <button class="btn sm" data-act="add-comp" data-kind="${kind}" data-id="${o.id}">Добавить</button></div>`;
}

/* ================= ЭКРАНЫ ================= */
const TABS = [['objects','Объекты'],['stages','Этапы работ'],['materials','Материалы'],['composites','Композиты'],['data','Данные']];
function render() {
  document.getElementById('nav').innerHTML = TABS.map(([id,l]) => `<button class="tab ${ui.tab===id?'active':''}" data-act="tab" data-tab="${id}">${l}</button>`).join('');
  const v = {objects: ui.objId && byId(S.objects,ui.objId) ? viewObject : viewObjects, stages:viewStages, materials:viewMaterials, composites:viewComposites, data:viewData}[ui.tab];
  document.getElementById('main').innerHTML = v();
}

/* --- объекты --- */
function viewObjects() {
  const cards = S.objects.map(o => { const T = totals(o);
    return `<div class="card objcard" data-act="open-obj" data-id="${o.id}"><div><h3>${esc(o.name)}</h3><div class="hint">${esc(o.note||'')} · позиций: ${o.items.length}</div></div><div class="mono"><b>${fmt(T.total)} ₽</b></div></div>`; }).join('');
  return `<div class="topline"><div><h2>Объекты</h2><div class="hint">Объект — это квартира, дом, помещение. Внутри: параметры, нужные работы, смета и список материалов.</div></div></div>
  ${cards || '<div class="sheet"><div class="empty">Объектов пока нет. Создайте первый ниже.</div></div>'}
  <div class="sheet"><div class="addrow" style="border:0"><div class="field"><label>Название объекта</label><input id="newObjName" placeholder="Кв. 42, ул. Ленина"></div>
  <button class="btn primary" data-act="add-obj">Создать объект</button></div></div>`;
}
function viewObject() {
  const o = byId(S.objects, ui.objId), T = totals(o), V = vars(o);
  const prow = o.params.map(p => `<tr><td><input class="cell" data-act="set-param" data-id="${p.id}" data-f="label" value="${esc(p.label)}"></td>
    <td><input class="cell mono" style="width:110px" data-act="set-param" data-id="${p.id}" data-f="key" value="${esc(p.key)}"></td>
    <td class="num"><input class="cell num" style="width:100px" data-act="set-param" data-id="${p.id}" data-f="value" value="${esc(p.value)}"></td>
    <td><button class="btn sm ghost danger" data-act="del-param" data-id="${p.id}">✕</button></td></tr>`).join('');
  const irows = o.items.map((it, i) => { const r = info(o, it);
    const canOpen = it.type !== 'custom' && it.type !== 'material', open = ui.rows.has(it.id);
    let bd = '';
    if (canOpen && open) {
      const mm = mats(it.type, it.refId, r.q), ls = [...mm].map(([id,q]) => { const m = byId(S.materials,id);
        return `<tr><td>${esc(m.name)} <span class="pill ${m.category}">${m.category==='consumable'?'расходник':'материал'}</span></td><td>${esc(m.unit)}</td><td class="num">${fmtQ(q)}</td><td class="num">${fmt(q*unitPrice(m))} ₽</td></tr>`; }).join('');
      bd = `<tr><td></td><td colspan="9" style="padding:0"><div class="breakdown">${ls ? `<table><thead><tr><th>Материал</th><th>Ед.</th><th class="num">Нужно</th><th class="num">Стоимость</th></tr></thead><tbody>${ls}</tbody></table>` : '<span class="hint">Материалов в составе нет.</span>'}</div></td></tr>`;
    }
    return `<tr><td class="idx">${i+1}</td><td><span class="pill ${r.pill}">${esc(r.pillLabel)}</span>${esc(r.name)}${r.cyc?' <span class="warn">⚠ цикл</span>':''}
      ${r.parent ? `<div class="path">${esc(r.parent)}</div>` : ''}${canOpen ? `<div><button class="tgl" data-act="tgl-row" data-id="${it.id}">${open?'▾ скрыть материалы':'▸ материалы'}</button></div>` : ''}</td>
      <td>${esc(r.unit)}</td>
      <td style="min-width:150px"><input class="cell mono" style="width:100px" data-act="set-item" data-id="${it.id}" data-f="qty" value="${esc(it.qty)}"> <span class="eq">${r.bad ? '<span class="warn">ошибка</span>' : '= ' + fmtQ(r.q)}</span></td>
      <td class="num">${fmt(r.uc.mat+r.uc.cons+r.uc.labor)}</td><td class="num">${fmt(r.mat)}</td><td class="num">${fmt(r.cons)}</td><td class="num">${fmt(r.labor)}</td>
      <td class="num"><b>${fmt(r.total)}</b></td><td><button class="btn sm ghost danger" data-act="del-item" data-id="${it.id}">✕</button></td></tr>${bd}`; }).join('');
  const grows = [...T.groups].map(([g,x]) => `<tr><td>${esc(g)}</td><td class="num">${fmt(x.mat)}</td><td class="num">${fmt(x.cons)}</td><td class="num">${fmt(x.labor)}</td><td class="num"><b>${fmt(x.total)}</b></td></tr>`).join('');
  const bl = buyList(o), buyTotal = bl.reduce((s,x) => s + x.buy, 0);
  const brows = bl.map(x => `<tr><td>${esc(x.name)} <span class="pill ${x.cat}">${x.cat==='consumable'?'расходник':'материал'}</span></td><td>${esc(x.unit)}</td><td class="num">${fmtQ(x.qty)}</td>
    <td class="num">${x.packQty ? fmtQ(x.packQty) : '—'}</td><td class="num">${x.packQty ? '<b>'+x.packs+'</b>' : '—'}</td><td class="num">${fmt(x.exact)}</td><td class="num">${fmt(x.buy)}</td></tr>`).join('');
  const paramHint = o.params.length ? 'Доступные переменные: ' + o.params.map(p => `<b class="mono">${esc(p.key)}</b>`).join(', ') : 'Добавьте параметры выше, чтобы считать по формулам.';
  const addForm = ui.custom ? `
    <div class="field"><label>Название</label><input id="cuName" placeholder="Доставка"></div>
    <div class="field"><label>Тип</label><select id="cuCat"><option value="material">материал</option><option value="consumable">расходник</option><option value="labor">работа</option></select></div>
    <div class="field"><label>Ед.</label><input id="cuUnit" class="narrow" placeholder="усл."></div>
    <div class="field"><label>Кол-во</label><input id="cuQty" class="narrow" placeholder="1"></div>
    <div class="field"><label>Цена/ед., ₽</label><input id="cuPrice" class="narrow"></div>
    <button class="btn primary" data-act="add-custom">Добавить</button>` : `
    <div class="field"><label>Этап, композит или материал</label><select id="addSel" style="min-width:280px">${options({stages:true,composites:true,materials:true})}</select></div>
    <div class="field"><label>Объём / формула</label><input id="addQty" placeholder="floor или 12.5"></div>
    <button class="btn primary" data-act="add-item">Добавить в смету</button>`;
  return `<div class="topline"><div style="flex:1;min-width:240px"><button class="btn ghost sm" data-act="back">← Все объекты</button>
    <input class="namein" data-act="set-obj" data-f="name" value="${esc(o.name)}"><input class="namein hint" style="font-size:13px;font-weight:500" data-act="set-obj" data-f="note" placeholder="Адрес / заметка" value="${esc(o.note||'')}"></div>
    <div><button class="btn primary" data-act="export-xlsx">Экспорт в Excel</button> <button class="btn danger" data-act="del-obj">Удалить объект</button></div></div>

  <div class="sheet"><div class="sheet-head"><h3>Параметры объекта</h3><span class="hint">Используйте ключ в формулах количества</span></div>
    ${o.params.length ? `<div class="scroll"><table><thead><tr><th>Название</th><th>Ключ</th><th class="num">Значение</th><th></th></tr></thead><tbody>${prow}</tbody></table></div>` : ''}
    <div class="addrow"><div class="field"><label>Название</label><input id="pLabel" placeholder="Площадь потолка, м²"></div><div class="field"><label>Ключ (лат. буквы)</label><input id="pKey" class="narrow" placeholder="ceiling"></div>
    <div class="field"><label>Значение</label><input id="pVal" class="narrow"></div><button class="btn sm" data-act="add-param">Добавить параметр</button></div></div>

  <div class="sheet"><div class="sheet-head"><h3>Смета: работы и позиции</h3>
    <button class="btn sm" data-act="tgl-custom">${ui.custom ? '← из справочника' : 'своя позиция'}</button></div>
    ${o.items.length ? `<div class="scroll"><table><thead><tr><th></th><th>Позиция</th><th>Ед.</th><th>Кол-во</th><th class="num">Цена/ед.</th><th class="num">Материалы</th><th class="num">Расходники</th><th class="num">Работа</th><th class="num">Сумма</th><th></th></tr></thead><tbody>${irows}</tbody></table></div>
    <div class="totals"><div class="t"><span>Материалы</span><b>${fmt(T.mat)} ₽</b></div><div class="t"><span>Расходники</span><b>${fmt(T.cons)}</b> ₽</div><div class="t"><span>Работа</span><b>${fmt(T.labor)} ₽</b></div><div class="t grand"><span>Итого</span><b>${fmt(T.total)} ₽</b></div></div>`
    : '<div class="empty">Позиций нет. Выберите этап работ ниже и укажите объём — материалы посчитаются сами.</div>'}
    <div class="addrow">${addForm}</div><div class="hint" style="padding:0 16px 12px">Количество: число или формула, например <span class="mono">floor*1.1</span> или <span class="mono">(walls-5)/2</span>. ${paramHint}</div></div>

  ${o.items.length ? `<div class="sheet"><div class="sheet-head"><h3>По этапам</h3></div><div class="scroll"><table><thead><tr><th>Этап</th><th class="num">Материалы</th><th class="num">Расходники</th><th class="num">Работа</th><th class="num">Итого</th></tr></thead><tbody>${grows}</tbody></table></div></div>

  <div class="sheet"><div class="sheet-head"><h3>Материалы к закупке</h3><span class="hint">Упаковок — с округлением вверх</span></div><div class="scroll"><table><thead><tr><th>Материал</th><th>Ед.</th><th class="num">Нужно</th><th class="num">В упак.</th><th class="num">Упаковок</th><th class="num">По факту, ₽</th><th class="num">К закупке, ₽</th></tr></thead><tbody>${brows || '<tr><td colspan="7" class="hint">Материалов нет</td></tr>'}</tbody></table></div>
    <div class="totals"><div class="t"><span>Закупка (целые упаковки)</span><b>${fmt(buyTotal)} ₽</b></div></div></div>` : ''}`;
}

/* --- этапы --- */
function stageRows(pid, d) {
  return kids(pid).map(s => {
    const hasKids = kids(s.id).length > 0, closed = ui.collapsed.has(s.id), c = cost('stage', s.id);
    const tot = s.unit ? fmt(c.mat + c.cons + c.labor) + ' ₽' : '';
    return `<div class="srow ${hasKids?'folder':''}" style="padding-left:${10 + d*22}px">
      <button class="tg" data-act="tgl-stage" data-id="${s.id}">${hasKids ? (closed ? '▸' : '▾') : '•'}</button>
      <input class="cell nm" data-act="set-stage" data-id="${s.id}" data-f="name" value="${esc(s.name)}">
      <input class="cell un" data-act="set-stage" data-id="${s.id}" data-f="unit" placeholder="ед." value="${esc(s.unit)}" title="Единица работы (м2, м, шт). Пусто — этап-папка">
      <input class="cell num pr" data-act="set-stage" data-id="${s.id}" data-f="price" placeholder="₽ работа" value="${s.price || ''}" title="Стоимость работы за 1 ед., ₽">
      <span class="tot" title="Работа + материалы за 1 ед.">${tot}</span>
      <button class="btn sm ghost" data-act="tgl-comp" data-id="${s.id}">материалы${s.components.length ? ' ('+s.components.length+')' : ''}</button>
      <button class="btn sm ghost" data-act="add-stage" data-pid="${s.id}" title="Добавить вложенный этап">＋</button>
      <button class="btn sm ghost" data-act="mv-stage" data-id="${s.id}" data-dir="-1">↑</button>
      <button class="btn sm ghost" data-act="mv-stage" data-id="${s.id}" data-dir="1">↓</button>
      <button class="btn sm ghost danger" data-act="del-stage" data-id="${s.id}">✕</button></div>
      ${ui.comp.has(s.id) ? `<div class="compbox"><div class="hint" style="margin-bottom:6px">Материалы на 1 ${esc(s.unit || 'ед.')} этапа «${esc(s.name)}»</div>${compEditor('stage', s)}</div>` : ''}
      ${hasKids && !closed ? stageRows(s.id, d + 1) : ''}`;
  }).join('');
}
function viewStages() {
  return `<div class="topline"><div><h2>Этапы работ</h2><div class="hint">Общий для всех объектов справочник с вложенностью. У этапа можно задать единицу (м2…), стоимость работы и материалы на единицу. Без единицы этап — просто папка. ＋ добавляет вложенный этап.</div></div>
    <button class="btn primary" data-act="add-stage" data-pid="">＋ Этап верхнего уровня</button></div>
  <div class="sheet">${S.stages.length ? stageRows('', 0) : '<div class="empty">Этапов нет.</div>'}</div>`;
}

/* --- материалы --- */
function viewMaterials() {
  const rows = S.materials.map((m,i) => `<tr><td class="idx">${i+1}</td>
    <td><input class="cell" data-act="set-mat" data-id="${m.id}" data-f="name" value="${esc(m.name)}"></td>
    <td><select class="cell" data-act="set-mat" data-id="${m.id}" data-f="category"><option value="material" ${m.category!=='consumable'?'selected':''}>материал</option><option value="consumable" ${m.category==='consumable'?'selected':''}>расходник</option></select></td>
    <td><input class="cell" style="width:70px" data-act="set-mat" data-id="${m.id}" data-f="unit" value="${esc(m.unit)}"></td>
    <td class="num"><input class="cell num" style="width:100px" data-act="set-mat" data-id="${m.id}" data-f="price" value="${m.price}"></td>
    <td class="num"><input class="cell num" style="width:80px" data-act="set-mat" data-id="${m.id}" data-f="packQty" value="${m.packQty}"></td>
    <td class="num">${fmt(unitPrice(m))} ₽</td><td><button class="btn sm ghost danger" data-act="del-mat" data-id="${m.id}">✕</button></td></tr>`).join('');
  return `<div class="topline"><div><h2>Материалы и расходники</h2><div class="hint">Цена за упаковку ÷ количество в упаковке = цена за единицу. «Расходник» (перчатки, диски, скотч) считается в смете отдельной колонкой.</div></div></div>
  <div class="sheet">${rows ? `<div class="scroll"><table><thead><tr><th></th><th>Название</th><th>Тип</th><th>Ед.</th><th class="num">Цена за упак., ₽</th><th class="num">В упак.</th><th class="num">Цена/ед.</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Пусто.</div>'}
  <div class="addrow"><div class="field"><label>Название</label><input id="mName" placeholder="Цемент М500"></div>
  <div class="field"><label>Тип</label><select id="mCat"><option value="material">материал</option><option value="consumable">расходник</option></select></div>
  <div class="field"><label>Ед.</label><input id="mUnit" class="narrow" placeholder="кг"></div>
  <div class="field"><label>Цена за упак., ₽</label><input id="mPrice" class="narrow"></div>
  <div class="field"><label>В упаковке</label><input id="mQty" class="narrow" placeholder="50"></div>
  <button class="btn primary" data-act="add-mat">Добавить</button></div></div>`;
}

/* --- композиты --- */
function viewComposites() {
  const cards = S.composites.map(c => { const k = cost('composite', c.id);
    return `<div class="sheet"><div class="sheet-head"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <input class="cell" style="font-weight:700;width:260px" data-act="set-composite" data-id="${c.id}" data-f="name" value="${esc(c.name)}"> <span class="hint">на 1</span>
      <input class="cell" style="width:60px" data-act="set-composite" data-id="${c.id}" data-f="unit" value="${esc(c.unit)}"></div>
      <div><b class="mono">${fmt(k.mat+k.cons)} ₽</b> / ед. ${k.cyc?'<span class="warn">⚠ цикл</span>':''} <button class="btn sm ghost danger" data-act="del-composite" data-id="${c.id}">Удалить</button></div></div>
      <div style="padding:8px 16px 12px">${compEditor('composite', c)}</div></div>`; }).join('');
  return `<div class="topline"><div><h2>Композиты</h2><div class="hint">Смеси и сборки из материалов и других композитов (раствор, штукатурный слой). Потом их можно подключать к этапам.</div></div></div>
  ${cards || '<div class="sheet"><div class="empty">Композитов нет.</div></div>'}
  <div class="sheet"><div class="addrow" style="border:0"><div class="field"><label>Название</label><input id="kName" placeholder="Штукатурный раствор"></div>
  <div class="field"><label>Ед. результата</label><input id="kUnit" class="narrow" placeholder="м2"></div><button class="btn primary" data-act="add-composite">Создать</button></div></div>`;
}

/* --- данные --- */
function viewData() {
  return `<div class="topline"><div><h2>Данные</h2><div class="hint">Всё хранится в браузере (localStorage). Делайте резервные копии: очистка данных браузера всё сотрёт.</div></div></div>
  <div class="sheet"><div class="addrow" style="border:0"><button class="btn primary" data-act="export-json">Скачать резервную копию (JSON)</button>
  <button class="btn" data-act="import-json">Загрузить из файла</button><button class="btn danger" data-act="reset">Сбросить к примеру</button></div></div>`;
}

/* ================= ЭКСПОРТ ================= */
function exportXlsx(o) {
  if (!window.XLSX) return alert('Библиотека Excel не загрузилась — нужен интернет.');
  const T = totals(o), head = ['№','Этап','Позиция','Ед.','Кол-во','Цена/ед., ₽','Материалы, ₽','Расходники, ₽','Работа, ₽','Сумма, ₽'];
  const a = [[o.name],[o.note||''],[],head];
  o.items.forEach((it,i) => { const r = info(o,it); a.push([i+1, r.parent || r.grp, r.name, r.unit, n2(r.q), n2(r.uc.mat+r.uc.cons+r.uc.labor), n2(r.mat), n2(r.cons), n2(r.labor), n2(r.total)]); });
  a.push([], ['','','ИТОГО','','','',n2(T.mat),n2(T.cons),n2(T.labor),n2(T.total)]);
  const s1 = XLSX.utils.aoa_to_sheet(a); s1['!cols'] = [4,28,36,7,10,12,14,14,12,14].map(w => ({wch:w}));
  const b = [['Материал','Тип','Ед.','Нужно','В упак.','Упаковок','По факту, ₽','К закупке, ₽']];
  const bl = buyList(o); bl.forEach(x => b.push([x.name, x.cat==='consumable'?'расходник':'материал', x.unit, n2(x.qty), x.packQty||'', x.packs||'', n2(x.exact), n2(x.buy)]));
  b.push([], ['ИТОГО','','','','','',n2(bl.reduce((s,x)=>s+x.exact,0)),n2(bl.reduce((s,x)=>s+x.buy,0))]);
  const s2 = XLSX.utils.aoa_to_sheet(b); s2['!cols'] = [32,12,7,10,9,10,14,14].map(w => ({wch:w}));
  const p = [['Параметр','Ключ','Значение']].concat(o.params.map(x => [x.label, x.key, +x.value || 0]));
  const s3 = XLSX.utils.aoa_to_sheet(p); s3['!cols'] = [30,14,12].map(w => ({wch:w}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, s1, 'Смета'); XLSX.utils.book_append_sheet(wb, s2, 'Материалы'); XLSX.utils.book_append_sheet(wb, s3, 'Параметры');
  XLSX.writeFile(wb, 'smeta_' + (o.name || 'object').replace(/[^\p{L}\d]+/gu,'_') + '.xlsx');
}
function download(name, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type:'application/json'})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ================= ДЕЙСТВИЯ ================= */
const $ = id => document.getElementById(id), val = id => ($(id) ? $(id).value.trim() : '');
const num = v => { const x = parseFloat(String(v).replace(',','.')); return isFinite(x) ? x : 0; };
const curObj = () => byId(S.objects, ui.objId);
const cleanKey = k => k.replace(/[^\p{L}\d_]/gu,'_').replace(/^(\d)/,'_$1');
const compOwner = el => el.dataset.kind === 'stage' ? byId(S.stages, el.dataset.id) : byId(S.composites, el.dataset.id);
function removeStage(id) { kids(id).forEach(k => removeStage(k.id)); S.stages = S.stages.filter(s => s.id !== id); }

const H = {
  tab: el => { ui.tab = el.dataset.tab; if (ui.tab === 'objects') ui.objId = null; render(); },
  'open-obj': el => { ui.objId = el.dataset.id; render(); },
  back: () => { ui.objId = null; render(); },
  'add-obj': () => { const n = val('newObjName'); if (!n) return;
    const P = (label,key) => ({id:uid(), label, key, value:0});
    const o = {id:uid(), name:n, note:'', params:[P('Площадь пола, м²','floor'),P('Площадь стен, м²','walls'),P('Периметр, м','perimeter')], items:[]};
    S.objects.push(o); ui.objId = o.id; commit(); },
  'del-obj': () => { if (confirm('Удалить объект целиком?')) { S.objects = S.objects.filter(o => o.id !== ui.objId); ui.objId = null; commit(); } },
  'set-obj': el => { curObj()[el.dataset.f] = el.value; commit(); },
  'add-param': () => { const l = val('pLabel'), k = cleanKey(val('pKey')); if (!l || !k) return alert('Нужны название и ключ (латинскими буквами, например ceiling).');
    const o = curObj(); if (o.params.some(p => p.key === k)) return alert('Такой ключ уже есть.');
    o.params.push({id:uid(), label:l, key:k, value:num(val('pVal'))}); commit(); },
  'set-param': el => { const p = byId(curObj().params, el.dataset.id), f = el.dataset.f; p[f] = f === 'key' ? cleanKey(el.value) : el.value; commit(); },
  'del-param': el => { const o = curObj(); o.params = o.params.filter(p => p.id !== el.dataset.id); commit(); },
  'tgl-custom': () => { ui.custom = !ui.custom; render(); },
  'add-item': () => { const v = val('addSel'); if (!v) return; const [type, refId] = v.split(':');
    curObj().items.push({id:uid(), type, refId, qty: val('addQty') || '1'}); commit(); },
  'add-custom': () => { const n = val('cuName'); if (!n) return;
    curObj().items.push({id:uid(), type:'custom', name:n, category:val('cuCat'), unit:val('cuUnit'), qty:val('cuQty') || '1', price:num(val('cuPrice'))}); commit(); },
  'set-item': el => { byId(curObj().items, el.dataset.id)[el.dataset.f] = el.value.trim(); commit(); },
  'del-item': el => { const o = curObj(); o.items = o.items.filter(i => i.id !== el.dataset.id); commit(); },
  'tgl-row': el => { const id = el.dataset.id; ui.rows.has(id) ? ui.rows.delete(id) : ui.rows.add(id); render(); },
  'export-xlsx': () => exportXlsx(curObj()),

  'add-stage': el => { const pid = el.dataset.pid; const n = prompt('Название этапа:'); if (!n) return;
    S.stages.push({id:uid(), parentId:pid, name:n, unit:'', price:0, components:[]}); ui.collapsed.delete(pid); commit(); },
  'set-stage': el => { const s = byId(S.stages, el.dataset.id), f = el.dataset.f; s[f] = f === 'price' ? num(el.value) : el.value.trim(); commit(); },
  'del-stage': el => { const s = byId(S.stages, el.dataset.id); if (confirm(`Удалить «${s.name}» вместе с вложенными этапами?`)) { removeStage(s.id); commit(); } },
  'mv-stage': el => { const s = byId(S.stages, el.dataset.id), sib = kids(s.parentId), i = sib.indexOf(s), j = i + +el.dataset.dir;
    if (j < 0 || j >= sib.length) return; const a = S.stages.indexOf(s), b = S.stages.indexOf(sib[j]); [S.stages[a], S.stages[b]] = [S.stages[b], S.stages[a]]; commit(); },
  'tgl-stage': el => { const id = el.dataset.id; ui.collapsed.has(id) ? ui.collapsed.delete(id) : ui.collapsed.add(id); render(); },
  'tgl-comp': el => { const id = el.dataset.id; ui.comp.has(id) ? ui.comp.delete(id) : ui.comp.add(id); render(); },

  'add-comp': el => { const o = compOwner(el), v = val('cs_' + o.id); if (!v) return; const [refType, refId] = v.split(':');
    o.components.push({refType, refId, rate:num(val('cr_' + o.id)) || 1}); commit(); },
  'set-comp': el => { compOwner(el).components[+el.dataset.i].rate = num(el.value); commit(); },
  'del-comp': el => { compOwner(el).components.splice(+el.dataset.i, 1); commit(); },

  'add-mat': () => { const n = val('mName'); if (!n) return;
    S.materials.push({id:uid(), name:n, category:val('mCat'), unit:val('mUnit'), price:num(val('mPrice')), packQty:num(val('mQty')) || 1}); commit(); },
  'set-mat': el => { const m = byId(S.materials, el.dataset.id), f = el.dataset.f; m[f] = (f === 'price' || f === 'packQty') ? num(el.value) : el.value.trim(); commit(); },
  'del-mat': el => { if (confirm('Удалить материал?')) { S.materials = S.materials.filter(m => m.id !== el.dataset.id); commit(); } },
  'add-composite': () => { const n = val('kName'); if (!n) return; S.composites.push({id:uid(), name:n, unit:val('kUnit') || 'м2', components:[]}); commit(); },
  'set-composite': el => { byId(S.composites, el.dataset.id)[el.dataset.f] = el.value.trim(); commit(); },
  'del-composite': el => { if (confirm('Удалить композит?')) { S.composites = S.composites.filter(c => c.id !== el.dataset.id); commit(); } },

  'export-json': () => download('stroysmeta-backup-' + new Date().toISOString().slice(0,10) + '.json', JSON.stringify(S, null, 1)),
  'import-json': () => $('fileImport').click(),
  reset: () => { if (confirm('Все данные будут заменены примером. Продолжить?')) { S = seed(); ui.objId = null; commit(); } }
};
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || /^(INPUT|SELECT)$/.test(el.tagName)) return; if (H[el.dataset.act]) H[el.dataset.act](el, e); });
document.addEventListener('change', e => { const el = e.target; if (el.dataset && el.dataset.act && H[el.dataset.act] && /^(INPUT|SELECT)$/.test(el.tagName)) H[el.dataset.act](el, e); });
$('fileImport').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result); if (!d.materials || !d.stages || !d.objects) throw new Error('не тот файл');
    S = Object.assign({materials:[],composites:[],stages:[],objects:[]}, d); ui.objId = null; commit(); } catch (err) { alert('Не удалось загрузить: ' + err.message); } e.target.value = ''; };
  r.readAsText(f); });
render();
