'use strict';
/* ================= БАЗА ================= */
const KEY = 'stroysmeta:v2';
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = n => isFinite(n) ? n.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
const fmtQ = n => isFinite(n) ? n.toLocaleString('ru-RU',{maximumFractionDigits:3}) : '—';
const n2 = x => Math.round((+x || 0) * 100) / 100;
const byId = (a, id) => a.find(x => x.id === id);
const $ = id => document.getElementById(id), val = id => ($(id) ? $(id).value.trim() : '');
const num = v => { const x = parseFloat(String(v).replace(',','.')); return isFinite(x) ? x : 0; };

const NOTE_STYLE = `## 1. Инструмент
- Правило штукатурное 1.5–2.5 м, уровень, лазерный нивелир, миксер
- **СИЗ:** сапоги, наколенники, перчатки, респиратор

## 2. Материалы и нормы расхода
- Пескобетон М300: ~18–20 кг/м² на слой 10 мм (запас +10%)
- Фибра: ~0.6–0.9 кг на 1 м³ раствора
- Плёнка для укрытия, демпферная лента по периметру (8–10 мм)

## 3. Условия
- Температура воздуха и основания от +5 до +25 °C
- Первые 3–7 дней без сквозняков, накрыть плёнкой

## 4. Частые ошибки
- Толщина плавающей стяжки меньше 50 мм — растрескается
- Нет демпферной ленты — стяжка встанет «домиком»
- Слишком много воды — усадка и трещины
- Нет деформационных швов — хаотичные трещины

## 5. Приёмка
- Просвет под 2-метровым правилом **≤ 2 мм**
- Не пылит и не крошится при трении

## 6. Варианты
Полусухая, [[Мокрая традиционная стяжка]], сухая (Кнауф) — см. вложенные этапы.`;

function seed() {
  const m = (name, category, unit, price, packQty) => ({id:uid(), name, category, unit, price, packQty});
  const sand = m('Пескобетон М300','material','кг',280,40), fib = m('Фиброволокно','material','кг',250,0.6),
        film = m('Плёнка полиэтиленовая','material','м2',450,60), keram = m('Керамзит 0–5 мм','material','л',220,50),
        gvl = m('Элемент пола ГВЛВ 20 мм','material','м2',700,0.72), pva = m('Клей ПВА строительный','material','кг',900,5),
        screws = m('Саморезы MN 3.9×19','consumable','шт',500,1000);
  const st = (parentId, name, unit, notes, components) => ({id:uid(), parentId, name, unit:unit||'', price:0, notes:notes||'', components:components||[]});
  const c = (m, rate) => ({refType:'material', refId:m.id, rate});
  const r2 = st('', '2. Черновые и инженерные работы');
  const r25 = st(r2.id, '2.5. Черновая отделка поверхностей');
  const r256 = st(r25.id, '2.5.6. Устройство стяжки пола (мокрая, полусухая, сухая)', '', NOTE_STYLE);
  const stages = [r2, r25, r256,
    st(r256.id, 'Полусухая стяжка 60 мм', 'м2', 'Расход посчитан на толщину **60 мм**: пескобетон 19 кг/м² на каждые 10 мм (19*6) плюс запас 10%.\n\nЦену работы введите выше. Для другой толщины поменяйте множитель в расходе.',
       [c(sand,'19*6*1.1'), c(fib,'0.75*0.06'), c(film,'1.1')]),
    st(r256.id, 'Мокрая традиционная стяжка', 'м2', 'Жидкий раствор, маяки, выдержка 7–14 дней под плёнкой. Добавьте материалы и цену сами.'),
    st(r256.id, 'Сухая стяжка (Кнауф)', 'м2', 'Засыпка керамзита слоем 20 мм + элементы пола ГВЛВ с запасом.',
       [c(gvl,'1.12'), c(keram,'20'), c(pva,'0.05'), c(screws,'13')]),
    st(r256.id, '2.5.6.1. Выравнивание наливным полом', 'м2', 'Нужен **только** как тонкий финишный слой под кварцвинил и линолеум.\n\nНе нужен под плитку и ламинат, и не годится для выравнивания перепадов высоты.')];
  const P = (label, key, value) => ({id:uid(), label, key, value});
  const obj = {id:uid(), name:'Пример: квартира 50 м²', note:'Можно удалить', params:[P('Площадь пола, м²','floor',50),P('Площадь стен, м²','walls',120),P('Периметр, м','perimeter',30)],
    items:[{id:uid(), type:'stage', refId:stages[3].id, qty:'floor'}]};
  return {materials:[sand,fib,film,keram,gvl,pva,screws], composites:[], stages, objects:[obj]};
}
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return Object.assign({materials:[],composites:[],stages:[],objects:[]}, JSON.parse(raw)); } catch (e) { console.error(e); }
  return seed();
}
let S = load();
const ui = {tab:'stages', stageId:null, objId:null, collapsed:new Set(), rows:new Set(), edit:new Set(), custom:false, q:''};
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { alert('Не удалось сохранить: ' + e.message); } }
let saveT; const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(save, 300); };
window.addEventListener('beforeunload', save);
function commit() { save(); render(); }

/* ================= РАСЧЁТЫ ================= */
const unitPrice = m => (+m.packQty > 0 ? (+m.price || 0) / +m.packQty : 0);
const getObj = (type, id) => type === 'stage' ? byId(S.stages,id) : type === 'composite' ? byId(S.composites,id) : byId(S.materials,id);
const kids = pid => S.stages.filter(s => (s.parentId || '') === (pid || ''));
function anc(id) { const a = []; let n = byId(S.stages,id); while (n) { a.unshift(n); n = n.parentId ? byId(S.stages,n.parentId) : null; } return a; }
const path = id => anc(id).map(s => s.name);
const topName = id => path(id)[0] || '';
function descIds(id, acc = new Set()) { kids(id).forEach(k => { acc.add(k.id); descIds(k.id, acc); }); return acc; }

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
const NOVARS = Object.create(null);
const rateVal = c => { const v = evalExpr(c.rate, NOVARS); return isNaN(v) ? 0 : v; };
function vars(o) { const v = Object.create(null); for (const p of o.params || []) v[p.key] = num(p.value); return v; }

function cost(type, id, vis = new Set()) {
  const z = {mat:0, cons:0, labor:0, cyc:false};
  if (type === 'material') { const m = byId(S.materials,id); if (!m) return z; z[m.category === 'consumable' ? 'cons' : 'mat'] = unitPrice(m); return z; }
  const o = getObj(type,id); if (!o) return z;
  const k = type[0] + id; if (vis.has(k)) { z.cyc = true; return z; }
  const v = new Set(vis).add(k);
  if (type === 'stage') z.labor = +o.price || 0;
  for (const c of o.components || []) { const s = cost(c.refType, c.refId, v), r = rateVal(c);
    z.mat += r*s.mat; z.cons += r*s.cons; z.labor += r*s.labor; if (s.cyc) z.cyc = true; }
  return z;
}
function mats(type, id, qty, acc = new Map(), vis = new Set()) {
  if (type === 'material') { if (byId(S.materials,id)) acc.set(id, (acc.get(id) || 0) + qty); return acc; }
  const o = getObj(type,id); if (!o) return acc;
  const k = type[0] + id; if (vis.has(k)) return acc;
  const v = new Set(vis).add(k);
  for (const c of o.components || []) mats(c.refType, c.refId, qty * rateVal(c), acc, v);
  return acc;
}
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
  for (const it of o.items) { const r = info(o, it); T.mat += r.mat; T.cons += r.cons; T.labor += r.labor; T.total += r.total;
    T.groups.set(r.grp, (T.groups.get(r.grp) || 0) + r.total); }
  return T;
}
function buyList(o) {
  const acc = new Map(), extra = [];
  for (const it of o.items) { const r = info(o, it);
    if (it.type === 'custom') { if (it.category !== 'labor') extra.push({name:it.name, cat:it.category, unit:it.unit, qty:r.q, packQty:0, packs:0, exact:r.q*(+it.price||0), buy:r.q*(+it.price||0)}); continue; }
    mats(it.type, it.refId, r.q, acc); }
  const list = [];
  for (const [id, qty] of acc) { const m = byId(S.materials,id), pq = +m.packQty > 0 ? +m.packQty : 0, packs = pq ? Math.ceil(qty / pq - 1e-9) : 0;
    list.push({name:m.name, cat:m.category, unit:m.unit, qty, packQty:pq, packs, exact:qty*unitPrice(m), buy:packs*(+m.price||0)}); }
  list.sort((a,b) => (a.cat === b.cat ? a.name.localeCompare(b.name,'ru') : a.cat === 'material' ? -1 : 1));
  return list.concat(extra);
}

/* ================= MARKDOWN ================= */
function inline(t) {
  t = esc(t).replace(/!\[\[[^\]]*\]\]/g, '');
  t = t.replace(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g, '<img alt="$1" src="$2">');
  t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  t = t.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, n, a) => { const s = S.stages.find(x => x.name.trim().toLowerCase() === n.trim().toLowerCase());
    return s ? `<a href="#" class="wl" data-act="go-stage" data-id="${s.id}">${a || n}</a>` : `<span class="wl dead">${a || n}</span>`; });
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  t = t.replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>').replace(/(^|[\s(])_(?!\s)(.+?)_(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>');
  return t;
}
function md(src) {
  let out = '', stack = [], para = [];
  const flushP = () => { if (para.length) { out += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } };
  const closeAll = () => { while (stack.length) out += '</li></' + stack.pop().tag + '>'; };
  for (const raw of String(src || '').replace(/\r/g,'').split('\n')) {
    const line = raw.replace(/\t/g,'    '); let m;
    if (!line.trim()) { flushP(); continue; }
    if ((m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line))) {
      flushP(); const w = m[1].length, tag = /\d/.test(m[2]) ? 'ol' : 'ul';
      const txt = m[3].replace(/^\[( |x)\]\s+/i, (a, c) => c === ' ' ? '☐ ' : '☑ ');
      while (stack.length && w < stack[stack.length-1].w) out += '</li></' + stack.pop().tag + '>';
      const top = stack[stack.length-1];
      if (!top || w > top.w) { out += '<' + tag + '><li>'; stack.push({w, tag}); } else out += '</li><li>';
      out += inline(txt); continue;
    }
    if ((m = /^\s*(#{1,6})\s+(.*)$/.exec(line))) { flushP(); closeAll(); out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flushP(); closeAll(); out += '<hr>'; continue; }
    if (stack.length && /^\s+/.test(line)) { out += ' ' + inline(line.trim()); continue; }
    flushP(); closeAll(); para.push(line.trim());
  }
  flushP(); closeAll(); return out;
}

/* ================= ОБЩИЕ БЛОКИ ================= */
function options(f) {
  let h = '<option value="">— выбрать —</option>';
  const grp = (label, arr, v, txt) => arr.length ? `<optgroup label="${label}">` + arr.map(x => `<option value="${v(x)}">${esc(txt(x))}</option>`).join('') + '</optgroup>' : '';
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
    const it = getObj(c.refType, c.refId), cs = it ? cost(c.refType, c.refId) : {mat:0,cons:0,labor:0}, up = cs.mat + cs.cons + cs.labor, rv = rateVal(c);
    const pill = c.refType === 'composite' ? 'composite' : (it && it.category === 'consumable' ? 'consumable' : 'material');
    const plain = String(c.rate).trim() === String(rv);
    return `<tr><td><span class="pill ${pill}">${{composite:'композит',consumable:'расходник',material:'материал'}[pill]}</span>${esc(it ? it.name : '(удалено)')}</td>
      <td style="white-space:nowrap"><input class="cell num" style="width:110px" data-act="set-comp" data-kind="${kind}" data-id="${o.id}" data-i="${i}" value="${esc(c.rate)}"> <span class="hint">${esc(it ? it.unit : '')}${plain ? '' : ' = ' + fmtQ(rv)}</span></td>
      <td class="num">${fmt(up)} ₽</td><td class="num">${fmt(up*rv)} ₽</td>
      <td><button class="btn sm ghost bad" data-act="del-comp" data-kind="${kind}" data-id="${o.id}" data-i="${i}">✕</button></td></tr>`;
  }).join('');
  return `<div class="scroll">${rows ? `<table><thead><tr><th>Что входит</th><th>Расход на 1 ${esc(o.unit || 'ед.')}</th><th class="num">Цена/ед.</th><th class="num">Сумма</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">Состав пуст — добавьте материалы ниже.</div>'}</div>
    <div class="addrow"><div class="field"><label>Материал, расходник или композит</label><select class="sel" id="cs_${o.id}" style="min-width:240px">${options({materials:true, composites:true, exclude: kind==='composite'?o.id:''})}</select></div>
      <div class="field"><label>Расход (число или формула)</label><input id="cr_${o.id}" class="w" placeholder="19*6*1.1"></div>
      <button class="btn" data-act="add-comp" data-kind="${kind}" data-id="${o.id}">Добавить</button></div>`;
}

/* ================= ЭКРАНЫ ================= */
const TABS = [['stages','Этапы работ'],['objects','Объекты'],['materials','Материалы'],['composites','Композиты'],['data','Данные']];
function render(fresh) {
  const l = document.querySelector('.list'), d = document.querySelector('.detail') || document.querySelector('.page');
  const sl = l ? l.scrollTop : 0, sd = d ? d.scrollTop : 0;
  $('nav').innerHTML = TABS.map(([id,t]) => `<button class="tab ${ui.tab===id?'on':''}" data-act="tab" data-tab="${id}">${t}</button>`).join('');
  $('main').innerHTML = {stages:viewStages, objects:viewObjects, materials:viewMaterials, composites:viewComposites, data:viewData}[ui.tab]();
  const l2 = document.querySelector('.list'), d2 = document.querySelector('.detail') || document.querySelector('.page');
  if (l2) l2.scrollTop = sl; if (d2 && !fresh) d2.scrollTop = sd;
  document.querySelectorAll('textarea.notes').forEach(grow);
}
const grow = t => { t.style.height = 'auto'; t.style.height = Math.max(200, t.scrollHeight + 4) + 'px'; };

/* --- этапы --- */
function matchTree(s, q) { return s.name.toLowerCase().includes(q) || kids(s.id).some(k => matchTree(k, q)); }
function treeHtml(pid, d, q) {
  return kids(pid).filter(s => !q || matchTree(s, q)).map(s => {
    const has = kids(s.id).length > 0, closed = !q && ui.collapsed.has(s.id);
    return `<div class="trow ${ui.stageId===s.id?'on':''}" style="padding-left:${8 + d*16}px" data-act="sel-stage" data-id="${s.id}">
      <span class="car" data-act="tgl-stage" data-id="${s.id}">${has ? (closed ? '▸' : '▾') : ''}</span><span class="tt">${esc(s.name)}</span>${s.unit ? `<span class="tu">${esc(s.unit)}</span>` : ''}</div>`
      + (has && !closed ? treeHtml(s.id, d + 1, q) : '');
  }).join('');
}
function viewStages() {
  const s = byId(S.stages, ui.stageId);
  return `<div class="split ${s ? 'sel' : ''}"><aside class="list">
    <div class="lh"><b>Все этапы</b><span><button class="ib" data-act="add-stage" data-pid="" title="Новый этап верхнего уровня">＋</button><button class="ib" data-act="collapse-all" title="Свернуть всё">⊟</button><button class="ib" data-act="expand-all" title="Развернуть всё">⊞</button></span></div>
    <input class="search" data-live="tree-q" placeholder="Поиск по этапам…" value="${esc(ui.q)}">
    <div id="treebox">${S.stages.length ? treeHtml('', 0, ui.q.toLowerCase()) : '<div class="empty">Этапов нет. Нажмите ＋ или загрузите заметки из Obsidian на вкладке «Данные».</div>'}</div></aside>
    <section class="detail">${s ? stageDetail(s) : '<div class="ph">← Выберите этап. Здесь появятся его расчёт (работа и материалы на единицу) и заметки.</div>'}</section></div>`;
}
function stageDetail(s) {
  const c = cost('stage', s.id), a = anc(s.id), ch = kids(s.id), dset = descIds(s.id);
  const bc = a.slice(0, -1).map(x => `<a href="#" data-act="go-stage" data-id="${x.id}">${esc(x.name)}</a>`).join(' / ');
  const pOpts = '<option value="">— верхний уровень —</option>' + S.stages.filter(x => x.id !== s.id && !dset.has(x.id)).map(x => `<option value="${x.id}" ${x.id === s.parentId ? 'selected' : ''}>${esc(path(x.id).join(' › '))}</option>`).join('');
  const editing = ui.edit.has(s.id) || !s.notes;
  return `<button class="btn ghost sm only-m" data-act="back-list">← К списку этапов</button>
  <div class="crumbs">${bc || 'верхний уровень'}</div>
  <input class="namein" data-act="set-stage" data-id="${s.id}" data-f="name" value="${esc(s.name)}">
  <div class="bar"><button class="btn" data-act="add-stage" data-pid="${s.id}">＋ Подэтап</button>
    <button class="btn" data-act="mv-stage" data-id="${s.id}" data-dir="-1" title="Выше">↑</button><button class="btn" data-act="mv-stage" data-id="${s.id}" data-dir="1" title="Ниже">↓</button>
    <select class="sel" data-act="set-parent" data-id="${s.id}" title="Перенести в другой раздел" style="max-width:260px">${pOpts}</select>
    <button class="btn bad" data-act="del-stage" data-id="${s.id}">Удалить</button></div>

  <div class="card"><div class="ch"><h3>Расчёт на 1 единицу работы</h3><span class="hint">используется в сметах объектов</span></div>
    <div class="cb"><div class="fields">
      <div class="field"><label>Единица (м2, м, шт…)</label><input class="w" data-act="set-stage" data-id="${s.id}" data-f="unit" value="${esc(s.unit)}" placeholder="м2"></div>
      <div class="field"><label>Стоимость работы, ₽ за ед.</label><input class="w num" data-act="set-stage" data-id="${s.id}" data-f="price" value="${s.price || ''}" placeholder="0"></div>
      ${s.unit ? '' : '<span class="hint">Без единицы этап — просто раздел, в смету его добавить нельзя.</span>'}</div>
      ${s.unit ? `<div class="kpi"><div><span>Работа</span><b>${fmt(c.labor)} ₽</b></div><div><span>Материалы</span><b>${fmt(c.mat)} ₽</b></div><div><span>Расходники</span><b>${fmt(c.cons)} ₽</b></div><div class="g"><span>Итого за 1 ${esc(s.unit)}</span><b>${fmt(c.mat + c.cons + c.labor)} ₽</b></div></div>` : ''}
    </div>
    ${s.unit ? compEditor('stage', s) : ''}</div>

  <div class="card"><div class="ch"><h3>Заметки</h3>${s.notes ? `<button class="btn sm" data-act="tgl-edit" data-id="${s.id}">${ui.edit.has(s.id) ? 'Готово' : 'Править'}</button>` : ''}</div>
    <div class="cb">${editing ? `<textarea class="notes" data-live="set-notes" data-id="${s.id}" placeholder="Инструмент, нормы расхода, технология, ошибки, приёмка… Поддерживается Markdown: ## заголовок, - список, **жирный**, [[ссылка на этап]]">${esc(s.notes)}</textarea>` : `<div class="md">${md(s.notes)}</div>`}</div></div>

  ${ch.length ? `<div class="card"><div class="ch"><h3>Подэтапы</h3></div><div class="kids">${ch.map(k => { const kc = cost('stage', k.id); return `<a href="#" data-act="go-stage" data-id="${k.id}"><span>${esc(k.name)}</span><span class="mono hint">${k.unit ? fmt(kc.mat + kc.cons + kc.labor) + ' ₽/' + esc(k.unit) : ''}</span></a>`; }).join('')}</div></div>` : ''}`;
}

/* --- объекты --- */
function viewObjects() {
  const o = byId(S.objects, ui.objId);
  const list = S.objects.map(x => `<div class="orow ${x.id === ui.objId ? 'on' : ''}" data-act="sel-obj" data-id="${x.id}"><b>${esc(x.name)}</b><span>${fmt(totals(x).total)} ₽ · позиций: ${x.items.length}</span></div>`).join('');
  return `<div class="split ${o ? 'sel' : ''}"><aside class="list"><div class="lh"><b>Объекты</b><button class="ib" data-act="add-obj" title="Новый объект">＋</button></div>
    <div class="olist">${list || '<div class="empty">Объектов нет. Нажмите ＋</div>'}</div></aside>
    <section class="detail">${o ? objectDetail(o) : '<div class="ph">← Выберите объект или создайте новый (＋). Объект — это квартира, дом, помещение: параметры, нужные работы, смета и список материалов.</div>'}</section></div>`;
}
function objectDetail(o) {
  const T = totals(o);
  const prow = o.params.map(p => `<tr><td><input class="cell" style="width:100%" data-act="set-param" data-id="${p.id}" data-f="label" value="${esc(p.label)}"></td>
    <td><input class="cell mono" style="width:120px" data-act="set-param" data-id="${p.id}" data-f="key" value="${esc(p.key)}"></td>
    <td class="num"><input class="cell num" style="width:100px" data-act="set-param" data-id="${p.id}" data-f="value" value="${esc(p.value)}"></td>
    <td><button class="btn sm ghost bad" data-act="del-param" data-id="${p.id}">✕</button></td></tr>`).join('');
  const groups = new Map();
  o.items.forEach(it => { const r = info(o, it); if (!groups.has(r.grp)) groups.set(r.grp, []); groups.get(r.grp).push({it, r}); });
  let n = 0, irows = '';
  for (const [g, arr] of groups) {
    irows += `<tr class="grp"><td colspan="10">${esc(g)}<span class="gs">${fmt(T.groups.get(g))} ₽</span></td></tr>`;
    for (const {it, r} of arr) {
      n++; const canOpen = it.type === 'stage' || it.type === 'composite', open = ui.rows.has(it.id); let bd = '';
      if (canOpen && open) {
        const ls = [...mats(it.type, it.refId, r.q)].map(([id, q]) => { const m = byId(S.materials, id);
          return `<tr><td>${esc(m.name)} <span class="pill ${m.category}">${m.category === 'consumable' ? 'расходник' : 'материал'}</span></td><td>${esc(m.unit)}</td><td class="num">${fmtQ(q)}</td><td class="num">${fmt(q * unitPrice(m))} ₽</td></tr>`; }).join('');
        bd = `<tr><td></td><td colspan="9" style="padding:0"><div class="bd">${ls ? `<table><thead><tr><th>Материал</th><th>Ед.</th><th class="num">Нужно</th><th class="num">Стоимость</th></tr></thead><tbody>${ls}</tbody></table>` : '<span class="hint">Материалов в составе нет.</span>'}</div></td></tr>`;
      }
      irows += `<tr><td class="idx">${n}</td><td><span class="pill ${r.pill}">${esc(r.pillLabel)}</span>${esc(r.name)}${r.cyc ? ' <span class="warn">⚠ цикл</span>' : ''}
        ${r.parent ? `<div class="path">${esc(r.parent)}</div>` : ''}${canOpen ? `<div><button class="tgl" data-act="tgl-row" data-id="${it.id}">${open ? '▾ скрыть материалы' : '▸ показать материалы'}</button></div>` : ''}</td>
        <td>${esc(r.unit)}</td><td style="min-width:160px;white-space:nowrap"><input class="cell mono" style="width:100px" data-act="set-item" data-id="${it.id}" data-f="qty" value="${esc(it.qty)}"> <span class="eq">${r.bad ? '<span class="warn">ошибка</span>' : '= ' + fmtQ(r.q)}</span></td>
        <td class="num">${fmt(r.uc.mat + r.uc.cons + r.uc.labor)}</td><td class="num">${fmt(r.mat)}</td><td class="num">${fmt(r.cons)}</td><td class="num">${fmt(r.labor)}</td>
        <td class="num"><b>${fmt(r.total)}</b></td><td><button class="btn sm ghost bad" data-act="del-item" data-id="${it.id}">✕</button></td></tr>${bd}`;
    }
  }
  const bl = buyList(o), buyTotal = bl.reduce((s, x) => s + x.buy, 0);
  const brows = bl.map(x => `<tr><td>${esc(x.name)} <span class="pill ${x.cat}">${x.cat === 'consumable' ? 'расходник' : 'материал'}</span></td><td>${esc(x.unit)}</td><td class="num">${fmtQ(x.qty)}</td>
    <td class="num">${x.packQty ? fmtQ(x.packQty) : '—'}</td><td class="num">${x.packQty ? '<b>' + x.packs + '</b>' : '—'}</td><td class="num">${fmt(x.exact)}</td><td class="num">${fmt(x.buy)}</td></tr>`).join('');
  const keys = o.params.length ? 'Переменные: ' + o.params.map(p => `<b class="mono">${esc(p.key)}</b>`).join(', ') : 'Добавьте параметры выше, чтобы считать по формулам.';
  const addForm = ui.custom ? `
    <div class="field"><label>Название</label><input id="cuName" placeholder="Доставка"></div>
    <div class="field"><label>Тип</label><select id="cuCat"><option value="material">материал</option><option value="consumable">расходник</option><option value="labor">работа</option></select></div>
    <div class="field"><label>Ед.</label><input id="cuUnit" class="w" placeholder="усл."></div><div class="field"><label>Кол-во</label><input id="cuQty" class="w" placeholder="1"></div>
    <div class="field"><label>Цена/ед., ₽</label><input id="cuPrice" class="w"></div><button class="btn pri" data-act="add-custom">Добавить</button>` : `
    <div class="field"><label>Что добавить в смету</label><select class="sel" id="addSel" style="min-width:300px">${options({stages:true, composites:true, materials:true})}</select></div>
    <div class="field"><label>Объём (число или формула)</label><input id="addQty" placeholder="floor или 12.5"></div><button class="btn pri" data-act="add-item">Добавить в смету</button>`;
  return `<button class="btn ghost sm only-m" data-act="back-list">← К списку объектов</button>
  <input class="namein" data-act="set-obj" data-f="name" value="${esc(o.name)}"><input class="namein sub" data-act="set-obj" data-f="note" placeholder="Адрес / заметка" value="${esc(o.note || '')}">
  <div class="bar"><button class="btn pri" data-act="export-xlsx">Экспорт в Excel</button><button class="btn bad" data-act="del-obj">Удалить объект</button></div>

  <div class="card"><div class="ch"><h3>1. Параметры объекта</h3><span class="hint">ключ используется в формулах объёма</span></div>
    ${o.params.length ? `<div class="scroll"><table><thead><tr><th>Название</th><th>Ключ</th><th class="num">Значение</th><th></th></tr></thead><tbody>${prow}</tbody></table></div>` : ''}
    <div class="addrow"><div class="field"><label>Название</label><input id="pLabel" placeholder="Площадь потолка, м²"></div><div class="field"><label>Ключ (латиницей)</label><input id="pKey" class="w" placeholder="ceiling"></div>
    <div class="field"><label>Значение</label><input id="pVal" class="w"></div><button class="btn" data-act="add-param">Добавить параметр</button></div></div>

  <div class="card"><div class="ch"><h3>2. Работы в смете</h3><button class="btn sm" data-act="tgl-custom">${ui.custom ? '← из справочника' : 'своя позиция'}</button></div>
    ${o.items.length ? `<div class="scroll"><table><thead><tr><th></th><th>Позиция</th><th>Ед.</th><th>Объём</th><th class="num">Цена/ед.</th><th class="num">Материалы</th><th class="num">Расходники</th><th class="num">Работа</th><th class="num">Сумма</th><th></th></tr></thead><tbody>${irows}</tbody></table></div>
    <div class="totals"><div><span>Материалы</span><b>${fmt(T.mat)} ₽</b></div><div><span>Расходники</span><b>${fmt(T.cons)} ₽</b></div><div><span>Работа</span><b>${fmt(T.labor)} ₽</b></div><div class="g"><span>Итого</span><b>${fmt(T.total)} ₽</b></div></div>`
    : '<div class="empty">Позиций нет. Выберите этап работ ниже и укажите объём — материалы посчитаются сами.</div>'}
    <div class="addrow">${addForm}</div><div class="hint" style="padding:0 16px 12px">Объём: число или формула, например <span class="mono">floor*1.1</span> или <span class="mono">(walls-5)/2</span>. ${keys}</div></div>

  ${o.items.length ? `<div class="card"><div class="ch"><h3>3. Материалы к закупке</h3><span class="hint">упаковки округляются вверх</span></div><div class="scroll"><table><thead><tr><th>Материал</th><th>Ед.</th><th class="num">Нужно</th><th class="num">В упак.</th><th class="num">Упаковок</th><th class="num">По факту, ₽</th><th class="num">К закупке, ₽</th></tr></thead><tbody>${brows || '<tr><td colspan="7" class="hint">Материалов нет</td></tr>'}</tbody></table></div>
    <div class="totals"><div class="g"><span>Закупка (целые упаковки)</span><b>${fmt(buyTotal)} ₽</b></div></div></div>` : ''}`;
}

/* --- материалы / композиты / данные --- */
function viewMaterials() {
  const rows = S.materials.map((m,i) => `<tr><td class="idx">${i+1}</td>
    <td><input class="cell" style="width:100%;min-width:180px" data-act="set-mat" data-id="${m.id}" data-f="name" value="${esc(m.name)}"></td>
    <td><select class="cell" data-act="set-mat" data-id="${m.id}" data-f="category"><option value="material" ${m.category!=='consumable'?'selected':''}>материал</option><option value="consumable" ${m.category==='consumable'?'selected':''}>расходник</option></select></td>
    <td><input class="cell" style="width:64px" data-act="set-mat" data-id="${m.id}" data-f="unit" value="${esc(m.unit)}"></td>
    <td class="num"><input class="cell num" style="width:100px" data-act="set-mat" data-id="${m.id}" data-f="price" value="${m.price}"></td>
    <td class="num"><input class="cell num" style="width:80px" data-act="set-mat" data-id="${m.id}" data-f="packQty" value="${m.packQty}"></td>
    <td class="num">${fmt(unitPrice(m))} ₽</td><td><button class="btn sm ghost bad" data-act="del-mat" data-id="${m.id}">✕</button></td></tr>`).join('');
  return `<div class="page"><h2 style="margin-top:0">Материалы и расходники</h2><p class="hint">Цена за упаковку ÷ количество в упаковке = цена за единицу. Расходники (саморезы, диски, перчатки) в смете идут отдельной колонкой.</p>
  <div class="card">${rows ? `<div class="scroll"><table><thead><tr><th></th><th>Название</th><th>Тип</th><th>Ед.</th><th class="num">Цена упак., ₽</th><th class="num">В упак.</th><th class="num">Цена/ед.</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Пусто.</div>'}
  <div class="addrow"><div class="field"><label>Название</label><input id="mName" placeholder="Цемент М500"></div>
  <div class="field"><label>Тип</label><select id="mCat"><option value="material">материал</option><option value="consumable">расходник</option></select></div>
  <div class="field"><label>Ед.</label><input id="mUnit" class="w" placeholder="кг"></div><div class="field"><label>Цена упак., ₽</label><input id="mPrice" class="w"></div>
  <div class="field"><label>В упаковке</label><input id="mQty" class="w" placeholder="50"></div><button class="btn pri" data-act="add-mat">Добавить</button></div></div></div>`;
}
function viewComposites() {
  const cards = S.composites.map(c => { const k = cost('composite', c.id);
    return `<div class="card"><div class="ch"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input class="cell" style="font-weight:700;width:260px" data-act="set-composite" data-id="${c.id}" data-f="name" value="${esc(c.name)}"><span class="hint">на 1</span>
      <input class="cell" style="width:64px" data-act="set-composite" data-id="${c.id}" data-f="unit" value="${esc(c.unit)}"></div>
      <div><b class="mono">${fmt(k.mat + k.cons)} ₽</b> / ед. ${k.cyc ? '<span class="warn">⚠ цикл</span>' : ''} <button class="btn sm ghost bad" data-act="del-composite" data-id="${c.id}">Удалить</button></div></div>${compEditor('composite', c)}</div>`; }).join('');
  return `<div class="page"><h2 style="margin-top:0">Композиты</h2><p class="hint">Смеси и сборки из материалов и других композитов (раствор, штукатурный слой). Их можно подключать к этапам как один компонент.</p>
  ${cards || '<div class="card"><div class="empty">Композитов нет.</div></div>'}
  <div class="card"><div class="addrow" style="border:0"><div class="field"><label>Название</label><input id="kName" placeholder="Штукатурный раствор"></div>
  <div class="field"><label>Ед. результата</label><input id="kUnit" class="w" placeholder="м2"></div><button class="btn pri" data-act="add-composite">Создать</button></div></div></div>`;
}
function viewData() {
  return `<div class="page"><h2 style="margin-top:0">Данные</h2>
  <div class="card"><div class="ch"><h3>Импорт заметок из Obsidian</h3></div><div class="cb"><p class="hint" style="margin-top:0">Выберите .md-файлы из папки хранилища (можно много сразу, Ctrl+A в окне выбора). Каждый файл станет этапом, текст — его заметкой. Вложенность берётся из номера в названии файла: «2.5.6. Стяжка» попадёт внутрь «2.5.», а «2.5.» внутрь «2.». Файлы без номера попадут на верхний уровень, потом их можно перенести. Этап с таким же названием обновится.</p>
  <button class="btn pri" data-act="import-md">Выбрать .md файлы…</button></div></div>
  <div class="card"><div class="ch"><h3>Резервная копия</h3></div><div class="cb"><p class="hint" style="margin-top:0">Всё хранится в этом браузере. Очистка данных браузера всё сотрёт, поэтому иногда скачивайте копию.</p>
  <button class="btn pri" data-act="export-json">Скачать копию (JSON)</button> <button class="btn" data-act="import-json">Загрузить из файла</button> <button class="btn bad" data-act="reset">Сбросить к примеру</button></div></div></div>`;
}

/* ================= ЭКСПОРТ / ИМПОРТ ================= */
function exportXlsx(o) {
  if (!window.XLSX) return alert('Библиотека Excel не загрузилась — нужен интернет.');
  const T = totals(o), a = [[o.name],[o.note||''],[],['№','Этап','Позиция','Ед.','Кол-во','Цена/ед., ₽','Материалы, ₽','Расходники, ₽','Работа, ₽','Сумма, ₽']];
  o.items.forEach((it,i) => { const r = info(o,it); a.push([i+1, r.parent || r.grp, r.name, r.unit, n2(r.q), n2(r.uc.mat+r.uc.cons+r.uc.labor), n2(r.mat), n2(r.cons), n2(r.labor), n2(r.total)]); });
  a.push([], ['','','ИТОГО','','','',n2(T.mat),n2(T.cons),n2(T.labor),n2(T.total)]);
  const s1 = XLSX.utils.aoa_to_sheet(a); s1['!cols'] = [4,34,36,7,10,12,14,14,12,14].map(w => ({wch:w}));
  const bl = buyList(o), b = [['Материал','Тип','Ед.','Нужно','В упак.','Упаковок','По факту, ₽','К закупке, ₽']];
  bl.forEach(x => b.push([x.name, x.cat==='consumable'?'расходник':'материал', x.unit, n2(x.qty), x.packQty||'', x.packs||'', n2(x.exact), n2(x.buy)]));
  b.push([], ['ИТОГО','','','','','',n2(bl.reduce((s,x)=>s+x.exact,0)),n2(bl.reduce((s,x)=>s+x.buy,0))]);
  const s2 = XLSX.utils.aoa_to_sheet(b); s2['!cols'] = [32,12,7,10,9,10,14,14].map(w => ({wch:w}));
  const s3 = XLSX.utils.aoa_to_sheet([['Параметр','Ключ','Значение']].concat(o.params.map(x => [x.label, x.key, num(x.value)]))); s3['!cols'] = [30,14,12].map(w => ({wch:w}));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, s1, 'Смета'); XLSX.utils.book_append_sheet(wb, s2, 'Материалы'); XLSX.utils.book_append_sheet(wb, s3, 'Параметры');
  XLSX.writeFile(wb, 'smeta_' + (o.name || 'object').replace(/[^\p{L}\d]+/gu,'_') + '.xlsx');
}
function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type:'application/json'})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
const codeOf = n => { const m = /^(\d+(?:\.\d+)*)\.?(?:\s|$)/.exec(String(n).trim()); return m ? m[1] : ''; };
async function importMd(files) {
  const items = [];
  for (const f of files) { const t = (await f.text()).replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim(); items.push({name:f.name.replace(/\.md$/i,'').trim(), text:t}); }
  const cmp = (a, b) => { const x = codeOf(a.name), y = codeOf(b.name); if (x && !y) return -1; if (!x && y) return 1; if (!x && !y) return a.name.localeCompare(b.name,'ru');
    const p = x.split('.').map(Number), q = y.split('.').map(Number); for (let i = 0; i < Math.max(p.length, q.length); i++) { const d = (p[i] ?? -1) - (q[i] ?? -1); if (d) return d; } return 0; };
  items.sort(cmp); let added = 0, upd = 0;
  for (const it of items) {
    const ex = S.stages.find(s => s.name === it.name);
    if (ex) { ex.notes = it.text; upd++; continue; }
    let parentId = ''; const parts = codeOf(it.name).split('.').filter(Boolean);
    for (let k = parts.length - 1; k >= 1 && !parentId; k--) { const pc = parts.slice(0, k).join('.'), p = S.stages.find(s => codeOf(s.name) === pc); if (p) parentId = p.id; }
    S.stages.push({id:uid(), parentId, name:it.name, unit:'', price:0, notes:it.text, components:[]}); added++;
  }
  ui.tab = 'stages'; commit(); alert(`Готово: добавлено этапов — ${added}, обновлено — ${upd}.`);
}

/* ================= ДЕЙСТВИЯ ================= */
const curObj = () => byId(S.objects, ui.objId);
const cleanKey = k => k.replace(/[^\p{L}\d_]/gu,'_').replace(/^(\d)/,'_$1');
const compOwner = el => el.dataset.kind === 'stage' ? byId(S.stages, el.dataset.id) : byId(S.composites, el.dataset.id);
function removeStage(id) { kids(id).forEach(k => removeStage(k.id)); S.stages = S.stages.filter(s => s.id !== id); }
const selectStage = id => { ui.tab = 'stages'; ui.stageId = id; anc(id).slice(0,-1).forEach(a => ui.collapsed.delete(a.id)); render(true); };

const H = {
  tab: el => { ui.tab = el.dataset.tab; render(true); },
  'back-list': () => { ui.stageId = null; ui.objId = null; render(true); },
  'sel-stage': el => selectStage(el.dataset.id),
  'go-stage': el => selectStage(el.dataset.id),
  'tgl-stage': el => { const id = el.dataset.id; ui.collapsed.has(id) ? ui.collapsed.delete(id) : ui.collapsed.add(id); render(); },
  'collapse-all': () => { S.stages.forEach(s => kids(s.id).length && ui.collapsed.add(s.id)); render(); },
  'expand-all': () => { ui.collapsed.clear(); render(); },
  'add-stage': el => { const pid = el.dataset.pid, n = prompt('Название этапа:'); if (!n || !n.trim()) return;
    const s = {id:uid(), parentId:pid, name:n.trim(), unit:'', price:0, notes:'', components:[]}; S.stages.push(s); save(); selectStage(s.id); },
  'set-stage': el => { const s = byId(S.stages, el.dataset.id), f = el.dataset.f; s[f] = f === 'price' ? num(el.value) : el.value.trim(); commit(); },
  'set-parent': el => { const s = byId(S.stages, el.dataset.id); s.parentId = el.value; S.stages.push(S.stages.splice(S.stages.indexOf(s), 1)[0]); if (el.value) ui.collapsed.delete(el.value); commit(); },
  'del-stage': el => { const s = byId(S.stages, el.dataset.id); if (!confirm(`Удалить «${s.name}» вместе с вложенными этапами?`)) return; ui.stageId = s.parentId || null; removeStage(s.id); commit(); },
  'mv-stage': el => { const s = byId(S.stages, el.dataset.id), sib = kids(s.parentId), i = sib.indexOf(s), j = i + +el.dataset.dir;
    if (j < 0 || j >= sib.length) return; const a = S.stages.indexOf(s), b = S.stages.indexOf(sib[j]); [S.stages[a], S.stages[b]] = [S.stages[b], S.stages[a]]; commit(); },
  'tgl-edit': el => { const id = el.dataset.id; ui.edit.has(id) ? ui.edit.delete(id) : ui.edit.add(id); render(); },

  'add-comp': el => { const o = compOwner(el), v = val('cs_' + o.id); if (!v) return; const [refType, refId] = v.split(':');
    o.components.push({refType, refId, rate: val('cr_' + o.id) || '1'}); commit(); },
  'set-comp': el => { compOwner(el).components[+el.dataset.i].rate = el.value.trim() || '0'; commit(); },
  'del-comp': el => { compOwner(el).components.splice(+el.dataset.i, 1); commit(); },

  'sel-obj': el => { ui.objId = el.dataset.id; render(true); },
  'add-obj': () => { const n = prompt('Название объекта:'); if (!n || !n.trim()) return; const P = (label, key) => ({id:uid(), label, key, value:0});
    const o = {id:uid(), name:n.trim(), note:'', params:[P('Площадь пола, м²','floor'),P('Площадь стен, м²','walls'),P('Периметр, м','perimeter')], items:[]};
    S.objects.push(o); ui.objId = o.id; save(); render(true); },
  'del-obj': () => { if (confirm('Удалить объект целиком?')) { S.objects = S.objects.filter(o => o.id !== ui.objId); ui.objId = null; commit(); } },
  'set-obj': el => { curObj()[el.dataset.f] = el.value; commit(); },
  'add-param': () => { const l = val('pLabel'), k = cleanKey(val('pKey')); if (!l || !k) return alert('Нужны название и ключ (латиницей, например ceiling).');
    const o = curObj(); if (o.params.some(p => p.key === k)) return alert('Такой ключ уже есть.'); o.params.push({id:uid(), label:l, key:k, value:num(val('pVal'))}); commit(); },
  'set-param': el => { const p = byId(curObj().params, el.dataset.id), f = el.dataset.f; p[f] = f === 'key' ? cleanKey(el.value) : el.value; commit(); },
  'del-param': el => { const o = curObj(); o.params = o.params.filter(p => p.id !== el.dataset.id); commit(); },
  'tgl-custom': () => { ui.custom = !ui.custom; render(); },
  'add-item': () => { const v = val('addSel'); if (!v) return; const [type, refId] = v.split(':'); curObj().items.push({id:uid(), type, refId, qty: val('addQty') || '1'}); commit(); },
  'add-custom': () => { const n = val('cuName'); if (!n) return; curObj().items.push({id:uid(), type:'custom', name:n, category:val('cuCat'), unit:val('cuUnit'), qty:val('cuQty') || '1', price:num(val('cuPrice'))}); commit(); },
  'set-item': el => { byId(curObj().items, el.dataset.id)[el.dataset.f] = el.value.trim(); commit(); },
  'del-item': el => { const o = curObj(); o.items = o.items.filter(i => i.id !== el.dataset.id); commit(); },
  'tgl-row': el => { const id = el.dataset.id; ui.rows.has(id) ? ui.rows.delete(id) : ui.rows.add(id); render(); },
  'export-xlsx': () => exportXlsx(curObj()),

  'add-mat': () => { const n = val('mName'); if (!n) return; S.materials.push({id:uid(), name:n, category:val('mCat'), unit:val('mUnit'), price:num(val('mPrice')), packQty:num(val('mQty')) || 1}); commit(); },
  'set-mat': el => { const m = byId(S.materials, el.dataset.id), f = el.dataset.f; m[f] = (f === 'price' || f === 'packQty') ? num(el.value) : el.value.trim(); commit(); },
  'del-mat': el => { if (confirm('Удалить материал?')) { S.materials = S.materials.filter(m => m.id !== el.dataset.id); commit(); } },
  'add-composite': () => { const n = val('kName'); if (!n) return; S.composites.push({id:uid(), name:n, unit:val('kUnit') || 'м2', components:[]}); commit(); },
  'set-composite': el => { byId(S.composites, el.dataset.id)[el.dataset.f] = el.value.trim(); commit(); },
  'del-composite': el => { if (confirm('Удалить композит?')) { S.composites = S.composites.filter(c => c.id !== el.dataset.id); commit(); } },

  'import-md': () => $('fileMd').click(),
  'export-json': () => download('stroysmeta-backup-' + new Date().toISOString().slice(0,10) + '.json', JSON.stringify(S, null, 1)),
  'import-json': () => $('fileImport').click(),
  reset: () => { if (confirm('Все данные будут заменены примером. Продолжить?')) { S = seed(); ui.objId = null; ui.stageId = null; commit(); } }
};
const LIVE = {
  'tree-q': el => { ui.q = el.value; $('treebox').innerHTML = treeHtml('', 0, ui.q.toLowerCase()) || '<div class="empty">Ничего не найдено</div>'; },
  'set-notes': el => { byId(S.stages, el.dataset.id).notes = el.value; grow(el); saveSoon(); }
};
const isField = el => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || isField(el)) return; if (el.tagName === 'A') e.preventDefault(); if (H[el.dataset.act]) H[el.dataset.act](el, e); });
document.addEventListener('change', e => { const el = e.target; if (el.dataset && el.dataset.act && H[el.dataset.act] && isField(el)) H[el.dataset.act](el, e); });
document.addEventListener('input', e => { const el = e.target; if (el.dataset && el.dataset.live && LIVE[el.dataset.live]) LIVE[el.dataset.live](el); });
$('fileMd').addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) importMd(fs); });
$('fileImport').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result); if (!d.materials || !d.stages || !d.objects) throw new Error('не тот файл');
    S = Object.assign({materials:[],composites:[],stages:[],objects:[]}, d); ui.objId = null; ui.stageId = null; commit(); } catch (err) { alert('Не удалось загрузить: ' + err.message); } e.target.value = ''; };
  r.readAsText(f); });
render();
