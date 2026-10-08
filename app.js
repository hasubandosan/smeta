'use strict';
/* ================= БАЗА ================= */
const APP_VERSION = '0.8.0', KEY = 'stroysmeta:v3', SNAPKEY = 'stroysmeta:snaps', SYNCKEY = 'stroysmeta:sync';
const AUTO_KEYS = ['floor', 'ceiling', 'perimeter', 'walls'];   // считаются из помещений, если они заданы
const FIN = [['reserve','Запас материалов, %'], ['overhead','Накладные расходы, %'], ['discount','Скидка, %'], ['vat','НДС, %']];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = n => isFinite(n) ? n.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
const fmtQ = n => isFinite(n) ? n.toLocaleString('ru-RU',{maximumFractionDigits:3}) : '—';
const n2 = x => Math.round((+x || 0) * 100) / 100;
const byId = (a, id) => a.find(x => x.id === id);
const $ = id => document.getElementById(id), val = id => ($(id) ? $(id).value.trim() : '');
const num = v => { const x = parseFloat(String(v).replace(',','.')); return isFinite(x) ? x : 0; };
const CATS = {cond:'Условие', error:'Ошибка', accept:'Приёмка', note:'Заметка'};

function seed() {
  const T = (name) => ({id:uid(), name, note:''});
  const tl = {rule:T('Правило штукатурное 1.5–2.5 м'), level:T('Уровень'), laser:T('Лазерный нивелир'), mixer:T('Бетономешалка'), heli:T('Затирочная машина («вертолёт»)'),
    float:T('Пластиковая тёрка'), steps:T('Бетоноступы'), screw:T('Шуруповёрт'), jig:T('Электролобзик'), knee:T('Наколенники'), resp:T('Респиратор'), cutter:T('Штроборез / болгарка по бетону')};
  const m = (name, category, unit, price, packQty) => ({id:uid(), name, category, unit, price, packQty});
  const sand = m('Пескобетон М300','material','кг',280,40), fib = m('Фиброволокно','material','кг',250,0.6), film = m('Плёнка полиэтиленовая','material','м2',450,60),
    keram = m('Керамзит 0–5 мм','material','л',220,50), gvl = m('Элемент пола ГВЛВ 20 мм','material','м2',700,0.72), pva = m('Клей ПВА строительный','material','кг',900,5),
    tape = m('Демпферная лента 8–10 мм','material','м',400,25), plast = m('Пластификатор','material','л',300,5), screws = m('Саморезы MN 3.9×19','consumable','шт',500,1000),
    discs = m('Алмазный диск','consumable','шт',1200,1);
  const P = (key, label, unit, def) => ({id:uid(), key, label, unit, def});
  const params = [P('floor','Площадь пола','м²',0), P('ceiling','Площадь потолка','м²',0), P('walls','Площадь стен','м²',0), P('perimeter','Периметр','м',0), P('thickness','Толщина стяжки','мм',60)];
  const N = (parentId, name, o) => Object.assign({id:uid(), parentId, name, mode:'steps', unit:'', price:0, vol:'', components:[], tools:[], notes:[]}, o || {});
  const c = (mm, rate) => ({refType:'material', refId:mm.id, rate});
  const nt = (cat, text) => ({id:uid(), cat, text});
  const r2 = N('', '2. Черновые и инженерные работы'), r25 = N(r2.id, '2.5. Черновая отделка поверхностей');
  const r256 = N(r25.id, '2.5.6. Устройство стяжки пола', {mode:'choice', notes:[
    nt('note','Три технологии на выбор: полусухая, мокрая, сухая (Кнауф). При применении к объекту выбирается одна.'),
    nt('error','Толщина плавающей стяжки меньше 50 мм — растрескается'), nt('error','Нет демпферной ленты по периметру — стяжка встанет «домиком»'),
    nt('error','Слишком много воды — усадка и трещины'), nt('error','Нет деформационных швов — хаотичные трещины')]});
  const semi = N(r256.id, 'Полусухая стяжка', {notes:[nt('cond','Температура воздуха и основания от +5 до +25 °C'), nt('cond','Первые 3–7 дней без сквозняков, накрыть плёнкой'),
    nt('accept','Просвет под 2-метровым правилом ≤ 2 мм'), nt('accept','Не пылит и не крошится при трении'), nt('note','Пешеходная нагрузка через 12 часов, плитка через 7–10 дней')]});
  const semiSteps = [
    N(semi.id, '1. Подготовка основания: демпферная лента по периметру', {unit:'м', price:40, vol:'perimeter', components:[c(tape,'1.05')]}),
    N(semi.id, '2. Приготовление смеси и укладка по маякам', {unit:'м2', price:350, vol:'floor', tools:[tl.mixer.id, tl.rule.id, tl.laser.id, tl.steps.id],
      components:[c(sand,'19*thickness/10*1.1'), c(fib,'0.75*thickness/1000'), c(plast,'0.02')], notes:[nt('note','Расход пескобетона 18–20 кг/м² на каждые 10 мм слоя, запас +10%. Формула берёт толщину из параметров объекта.')]}),
    N(semi.id, '3. Затирка поверхности', {unit:'м2', price:120, vol:'floor', tools:[tl.heli.id, tl.float.id], notes:[nt('note','Через 1–2 часа «вертолётом»; без него через 20–30 минут тёркой')]}),
    N(semi.id, '4. Нарезка деформационных швов', {unit:'м', price:150, vol:'', tools:[tl.cutter.id], components:[c(discs,'0.01')], notes:[nt('note','В дверных проёмах и в помещениях больше 20 м², глубина 1/3 толщины. Длину швов укажите при применении.')]}),
    N(semi.id, '5. Уход: укрытие плёнкой на 3–7 дней', {unit:'м2', price:30, vol:'floor', components:[c(film,'1.1')]})];
  const wet = N(r256.id, 'Мокрая традиционная стяжка', {notes:[nt('cond','Максимальная прочность, но сохнет до 28 дней'), nt('note','Выдержка под плёнкой 7–14 дней')]});
  const wetSteps = [
    N(wet.id, '1. Подготовка основания: демпферная лента', {unit:'м', price:40, vol:'perimeter', components:[c(tape,'1.05')]}),
    N(wet.id, '2. Заливка раствора и выравнивание по маякам', {unit:'м2', price:400, vol:'floor', tools:[tl.mixer.id, tl.rule.id, tl.laser.id], components:[c(sand,'19*thickness/10*1.05'), c(plast,'0.03')]}),
    N(wet.id, '3. Пролив водой и укрытие плёнкой', {unit:'м2', price:30, vol:'floor', components:[c(film,'1.1')]})];
  const dry = N(r256.id, 'Сухая стяжка (Кнауф)', {notes:[nt('cond','Влажность воздуха ≤ 60%, температура от +10 °C'), nt('cond','Минимальная толщина: 20 мм засыпка + 20 мм ГВЛВ'), nt('note','Пешеходная нагрузка сразу, покрытие через 24 часа')]});
  const drySteps = [
    N(dry.id, '1. Пароизоляция с заходом на стены', {unit:'м2', price:30, vol:'floor', components:[c(film,'1.1')]}),
    N(dry.id, '2. Засыпка керамзита слоем 20 мм', {unit:'м2', price:180, vol:'floor', tools:[tl.rule.id, tl.laser.id], components:[c(keram,'20')], notes:[nt('note','10 л на 1 м² при слое 10 мм')]}),
    N(dry.id, '3. Укладка элементов пола ГВЛВ на клей и саморезы', {unit:'м2', price:350, vol:'floor', tools:[tl.screw.id, tl.jig.id, tl.knee.id],
      components:[c(gvl,'1.12'), c(pva,'0.05'), c(screws,'13')], notes:[nt('note','Шаг саморезов 15–20 см, швы с перевязкой, фальцы на клей')]})];
  const lev = N(r25.id, '2.5.7. Выравнивание наливным полом', {unit:'м2', price:250, vol:'floor', tools:[tl.resp.id, tl.mixer.id], notes:[
    nt('cond','Нужен только как тонкий финишный слой 1–3 мм под кварцвинил и линолеум'), nt('error','Не годится для выравнивания перепадов 3–5 см — дорого и трескается'),
    nt('error','Под плитку и ламинат не нужен')]});
  const stages = [r2, r25, r256, semi, ...semiSteps, wet, ...wetSteps, dry, ...drySteps, lev];
  const sel = {}; [r2, r25, r256, semi, ...semiSteps].forEach(s => sel[s.id] = {});
  const R = (name, l, w, h, open) => ({id:uid(), name, l, w, h, open});
  const obj = {id:uid(), name:'Пример: квартира 50 м²', note:'Можно удалить', values:{thickness:60}, rooms:[R('Гостиная',6,5,2.7,4.5), R('Кухня',4,3,2.7,2), R('Прихожая',4,2,2.7,1.6)],
    fin:{reserve:5, overhead:10, discount:0, vat:0}, sel, pick:{[r256.id]:semi.id}, extra:[]};
  sel[semiSteps[3].id] = {q:'12'};
  return {materials:[sand,fib,film,keram,gvl,pva,tape,plast,screws,discs], composites:[], tools:Object.values(tl), params, stages, objects:[obj], finDefaults:{reserve:0, overhead:0, discount:0, vat:0}, updated:Date.now(), version:APP_VERSION};
}

/* заметки Obsidian → пункты и инструменты */
function parseNote(text) {
  const items = [], tools = []; let cat = 'note', inTools = false;
  const topic = t => { t = t.toLowerCase(); inTools = /инструмент|сиз/.test(t) && !/материал/.test(t);
    cat = /ошибк/.test(t) ? 'error' : /приём|прием|допуск|чек/.test(t) ? 'accept' : /услови|микроклимат|предподготов|сопряжен/.test(t) ? 'cond' : 'note'; };
  for (const raw of String(text || '').replace(/\r/g,'').split('\n')) {
    const line = raw.replace(/\t/g,'    '); let m;
    if ((m = /^\s*#{1,6}\s+(.*)$/.exec(line))) { topic(m[1]); continue; }
    if ((m = /^\s*\*\*([^*]+?)\*\*:?\s*$/.exec(line))) { topic(m[1]); continue; }
    if (!(m = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(line))) continue;
    const t = m[1].replace(/!\[\[[^\]]*\]\]/g,'').replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g,'$1').replace(/\*\*|__|`/g,'').replace(/(^|\s)_([^_]+)_/g,'$1$2').trim();
    if (!t) continue;
    if (inTools) { t.replace(/^[^:]{0,40}:\s*/,'').split(/[,;/]|\.\s/).map(x => x.replace(/\.$/,'').trim()).filter(x => x && x.length < 60).forEach(x => tools.push(x[0].toUpperCase() + x.slice(1))); continue; }
    items.push({id:uid(), cat, text:t});
  }
  return {items, tools};
}
function getTool(name) { let t = S.tools.find(x => x.name.toLowerCase() === name.toLowerCase()); if (!t) { t = {id:uid(), name, note:''}; S.tools.push(t); } return t; }

function migrate(d) {
  d = Object.assign({materials:[], composites:[], tools:[], params:[], stages:[], objects:[], finDefaults:{reserve:0, overhead:0, discount:0, vat:0}}, d); S = d;
  if (!d.params.length) d.params = [{id:uid(),key:'floor',label:'Площадь пола',unit:'м²',def:0},{id:uid(),key:'walls',label:'Площадь стен',unit:'м²',def:0},{id:uid(),key:'perimeter',label:'Периметр',unit:'м',def:0}];
  if (!d.params.some(p => p.key === 'ceiling')) d.params.splice(1, 0, {id:uid(), key:'ceiling', label:'Площадь потолка', unit:'м²', def:0});
  d.updated = d.updated || Date.now(); d.version = APP_VERSION;
  for (const s of d.stages) {
    if (typeof s.notes === 'string') { const p = parseNote(s.notes); s.notes = p.items; s.tools = (s.tools || []).concat(p.tools.map(n => getTool(n).id)); }
    Object.assign(s, {mode:s.mode || 'steps', unit:s.unit || '', price:s.price || 0, vol:s.vol || '', components:s.components || [], tools:s.tools || [], notes:s.notes || []});
  }
  for (const o of d.objects) {
    o.values = o.values || {}; o.rooms = o.rooms || []; o.fin = Object.assign({reserve:0, overhead:0, discount:0, vat:0}, o.fin); o.sel = o.sel || {}; o.pick = o.pick || {}; o.extra = o.extra || [];
    for (const p of o.params || []) { o.values[p.key] = p.value; if (!d.params.some(x => x.key === p.key)) d.params.push({id:uid(), key:p.key, label:p.label, unit:'', def:0}); }
    for (const it of o.items || []) { if (it.type === 'stage' && byId(d.stages, it.refId)) { for (const a of anc(it.refId)) o.sel[a.id] = o.sel[a.id] || {}; o.sel[it.refId] = {q:String(it.qty)}; } else o.extra.push(it); }
    delete o.params; delete o.items;
  }
  return d;
}
let S = {materials:[], composites:[], tools:[], params:[], stages:[], objects:[]};
(function load() {
  try { const raw = localStorage.getItem(KEY) || localStorage.getItem('stroysmeta:v2'); if (raw) { migrate(JSON.parse(raw)); return; } } catch (e) { console.error(e); }
  S = seed();
})();
const ui = {tab:'stages', stageId:null, objId:null, collapsed:new Set(), pexp:new Set(), rows:new Set(), custom:false, q:'', pq:'', rp:''};
function save(opts) {
  if (!opts || !opts.keepStamp) S.updated = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(S)); snap(); } catch (e) { alert('Не удалось сохранить: ' + e.message); }
  scheduleSync();
}
window.addEventListener('beforeunload', () => save({keepStamp:true}));
function commit() { save(); render(); }

/* ================= РАСЧЁТЫ ================= */
const unitPrice = m => (+m.packQty > 0 ? (+m.price || 0) / +m.packQty : 0);
const getObj = (type, id) => type === 'stage' ? byId(S.stages,id) : type === 'composite' ? byId(S.composites,id) : byId(S.materials,id);
const kids = pid => S.stages.filter(s => (s.parentId || '') === (pid || ''));
function anc(id) { const a = []; let n = byId(S.stages,id); while (n) { a.unshift(n); n = n.parentId ? byId(S.stages,n.parentId) : null; } return a; }
const path = id => anc(id).map(s => s.name);
function descIds(id, acc = new Set()) { kids(id).forEach(k => { acc.add(k.id); descIds(k.id, acc); }); return acc; }
const defVars = () => { const v = Object.create(null); S.params.forEach(p => v[p.key] = num(p.def)); return v; };
function roomsCalc(rooms) {
  const r = {floor:0, ceiling:0, perimeter:0, walls:0};
  rooms.forEach(x => { const l = num(x.l), w = num(x.w), p = 2 * (l + w); r.floor += l*w; r.ceiling += l*w; r.perimeter += p; r.walls += Math.max(0, p*num(x.h) - num(x.open)); });
  return r;
}
const scopeRooms = (o, ids) => { if (!ids || !ids.length) return o.rooms; const f = o.rooms.filter(r => ids.includes(r.id)); return f.length ? f : o.rooms; };
const objVars = (o, ids) => { const v = Object.create(null); S.params.forEach(p => v[p.key] = num(o.values[p.key] !== undefined ? o.values[p.key] : p.def));
  if (o.rooms.length) Object.assign(v, roomsCalc(scopeRooms(o, ids))); return v; };

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
const rateVal = (c, V) => { const v = evalExpr(c.rate, V); return isNaN(v) ? 0 : v; };

// стоимость 1 ед. самого этапа/композита (без дочерних шагов): {mat, cons, labor, cyc}
function cost(type, id, V = defVars(), vis = new Set()) {
  const z = {mat:0, cons:0, labor:0, cyc:false};
  if (type === 'material') { const m = byId(S.materials,id); if (!m) return z; z[m.category === 'consumable' ? 'cons' : 'mat'] = unitPrice(m); return z; }
  const o = getObj(type,id); if (!o) return z;
  const k = type[0] + id; if (vis.has(k)) { z.cyc = true; return z; }
  const v = new Set(vis).add(k);
  if (type === 'stage') z.labor = +o.price || 0;
  for (const c of o.components || []) { const s = cost(c.refType, c.refId, V, v), r = rateVal(c, V);
    z.mat += r*s.mat; z.cons += r*s.cons; z.labor += r*s.labor; if (s.cyc) z.cyc = true; }
  return z;
}
function mats(type, id, qty, V, acc = new Map(), vis = new Set()) {
  if (type === 'material') { if (byId(S.materials,id)) acc.set(id, (acc.get(id) || 0) + qty); return acc; }
  const o = getObj(type,id); if (!o) return acc;
  const k = type[0] + id; if (vis.has(k)) return acc;
  const v = new Set(vis).add(k);
  for (const c of o.components || []) mats(c.refType, c.refId, qty * rateVal(c, V), V, acc, v);
  return acc;
}

/* --- применение этапов к объекту --- */
function includedNodes(o) {
  const out = [], walk = pid => {
    const parent = pid ? byId(S.stages, pid) : null; let list = kids(pid);
    if (parent && parent.mode === 'choice') list = list.filter(x => x.id === o.pick[pid]);
    for (const s of list) { if (!o.sel[s.id]) continue; out.push(s); walk(s.id); }
  };
  walk(''); return out;
}
function includeSubtree(o, id) {
  const s = byId(S.stages, id); o.sel[id] = o.sel[id] || {}; ui.pexp.add(id);
  let ch = kids(id);
  if (s.mode === 'choice') { if (!ch.length) return; const pk = ch.find(x => x.id === o.pick[id]) || ch[0]; o.pick[id] = pk.id; ch = [pk]; }
  ch.forEach(k => includeSubtree(o, k.id));
}
function includeNode(o, id) {
  const chain = anc(id);
  chain.forEach((a, i) => { o.sel[a.id] = o.sel[a.id] || {}; ui.pexp.add(a.id);
    if (i) { const par = chain[i-1]; if (par.mode === 'choice') { kids(par.id).forEach(sib => { if (sib.id !== a.id) { delete o.sel[sib.id]; descIds(sib.id).forEach(d => delete o.sel[d]); } }); o.pick[par.id] = a.id; } } });
  includeSubtree(o, id);
}
function excludeNode(o, id) { delete o.sel[id]; descIds(id).forEach(d => delete o.sel[d]); }

function rowOf(o, kind, x, V) {
  const k = 1 + num((o.fin || {}).reserve) / 100;
  if (kind === 'stage') V = objVars(o, o.sel[x.id] && o.sel[x.id].rooms);
  let name, unit, grp, parent = '', uc = {mat:0,cons:0,labor:0,cyc:false}, pill, pillLabel, src, missing = false, key = x.id, canOpen = false, refType = null, refId = null;
  if (kind === 'stage') {
    name = x.name; unit = x.unit; grp = path(x.id)[0]; parent = path(x.parentId).join(' › '); uc = cost('stage', x.id, V); pill = 'stage'; pillLabel = 'этап'; canOpen = true; refType = 'stage'; refId = x.id;
    const ov = o.sel[x.id] && o.sel[x.id].q; src = ov !== undefined && ov !== '' ? ov : x.vol; missing = !String(src || '').trim();
  } else if (x.type === 'custom') {
    name = x.name; unit = x.unit; grp = 'Дополнительно'; pill = x.category; pillLabel = 'своя: ' + ({material:'материал',consumable:'расходник',labor:'работа'}[x.category]); src = x.qty;
    uc[x.category === 'consumable' ? 'cons' : x.category === 'labor' ? 'labor' : 'mat'] = +x.price || 0;
  } else {
    const obj = getObj(x.type, x.refId); name = obj ? obj.name : '(удалено)'; unit = obj ? obj.unit : ''; grp = 'Дополнительно'; src = x.qty; refType = x.type; refId = x.refId; canOpen = true;
    if (obj) uc = cost(x.type, x.refId, V); pill = x.type === 'material' && obj && obj.category === 'consumable' ? 'consumable' : x.type; pillLabel = {composite:'композит', material:'материал', consumable:'расходник'}[pill];
  }
  const q0 = missing ? 0 : evalExpr(src, V), bad = isNaN(q0), q = bad ? 0 : q0;
  return {key, kind, x, name, unit, grp, parent, uc, pill, pillLabel, src, q, bad, missing, canOpen, refType, refId, cyc:uc.cyc,
    V, k, mat:q*uc.mat*k, cons:q*uc.cons*k, labor:q*uc.labor, total:q*(uc.mat*k + uc.cons*k + uc.labor)};
}
function objRows(o) {
  const V = objVars(o);
  return includedNodes(o).filter(s => s.unit).map(s => rowOf(o, 'stage', s, V)).concat((o.extra || []).map(e => rowOf(o, 'extra', e, V)));
}
function totals(o, rows = objRows(o)) {
  const T = {mat:0, cons:0, labor:0, total:0, groups:new Map()};
  for (const r of rows) { T.mat += r.mat; T.cons += r.cons; T.labor += r.labor; T.total += r.total; T.groups.set(r.grp, (T.groups.get(r.grp) || 0) + r.total); }
  const f = o.fin || {}; T.sub = T.total; T.overhead = T.sub * num(f.overhead) / 100;
  const a = T.sub + T.overhead; T.discount = a * num(f.discount) / 100; const b = a - T.discount; T.vat = b * num(f.vat) / 100; T.grand = b + T.vat;
  return T;
}
function buyList(o, rows = objRows(o)) {
  const acc = new Map(), extra = [];
  for (const r of rows) {
    if (r.refType) mats(r.refType, r.refId, r.q * r.k, r.V, acc);
    else if (r.x.category !== 'labor') extra.push({name:r.name, cat:r.x.category, unit:r.unit, qty:r.q * r.k, packQty:0, packs:0, exact:r.mat + r.cons, buy:r.mat + r.cons});
  }
  const list = [];
  for (const [id, qty] of acc) { const m = byId(S.materials,id), pq = +m.packQty > 0 ? +m.packQty : 0, packs = pq ? Math.ceil(qty / pq - 1e-9) : 0;
    list.push({name:m.name, cat:m.category, unit:m.unit, qty, packQty:pq, packs, exact:qty*unitPrice(m), buy:packs*(+m.price||0)}); }
  list.sort((a,b) => (a.cat === b.cat ? a.name.localeCompare(b.name,'ru') : a.cat === 'material' ? -1 : 1));
  return list.concat(extra);
}
function toolsNeeded(o) {
  const map = new Map();
  for (const s of includedNodes(o)) for (const id of s.tools || []) { const t = byId(S.tools, id); if (t) { if (!map.has(id)) map.set(id, {t, where:[]}); map.get(id).where.push(s.name); } }
  return [...map.values()].sort((a,b) => a.t.name.localeCompare(b.t.name,'ru'));
}

/* ================= ОБЩИЕ БЛОКИ ================= */
function options(f) {
  let h = '<option value="">— выбрать —</option>';
  const grp = (label, arr, v, txt) => arr.length ? `<optgroup label="${label}">` + arr.map(x => `<option value="${v(x)}">${esc(txt(x))}</option>`).join('') + '</optgroup>' : '';
  if (f.composites) h += grp('Композиты', S.composites.filter(c => c.id !== f.exclude), c => 'composite:'+c.id, c => c.name + ' (' + c.unit + ')');
  h += grp('Материалы', S.materials.filter(m => m.category !== 'consumable'), m => 'material:'+m.id, m => m.name + ' (' + m.unit + ')');
  h += grp('Расходники', S.materials.filter(m => m.category === 'consumable'), m => 'material:'+m.id, m => m.name + ' (' + m.unit + ')');
  return h;
}
function compEditor(kind, o) {
  const V = defVars();
  const rows = (o.components || []).map((c, i) => {
    const it = getObj(c.refType, c.refId), cs = it ? cost(c.refType, c.refId, V) : {mat:0,cons:0,labor:0}, up = cs.mat + cs.cons + cs.labor, rv = evalExpr(c.rate, V), bad = isNaN(rv);
    const pill = c.refType === 'composite' ? 'composite' : (it && it.category === 'consumable' ? 'consumable' : 'material');
    const plain = String(c.rate).trim() === String(rv);
    return `<tr><td><span class="pill ${pill}">${{composite:'композит',consumable:'расходник',material:'материал'}[pill]}</span>${esc(it ? it.name : '(удалено)')}</td>
      <td style="white-space:nowrap"><input class="cell num" style="width:170px" data-act="set-comp" data-kind="${kind}" data-id="${o.id}" data-i="${i}" value="${esc(c.rate)}"> <span class="hint">${esc(it ? it.unit : '')}${bad ? ' <span class="warn">ошибка формулы</span>' : plain ? '' : ' = ' + fmtQ(rv)}</span></td>
      <td class="num">${fmt(up)} ₽</td><td class="num">${fmt(up*(bad?0:rv))} ₽</td>
      <td><button class="btn sm ghost bad" data-act="del-comp" data-kind="${kind}" data-id="${o.id}" data-i="${i}">✕</button></td></tr>`;
  }).join('');
  return `<div class="scroll">${rows ? `<table><thead><tr><th>Материал</th><th>Расход на 1 ${esc(o.unit || 'ед.')}</th><th class="num">Цена/ед.</th><th class="num">Сумма</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">Материалы не указаны.</div>'}</div>
    <div class="addrow"><div class="field"><label>Материал</label><select class="sel" id="cs_${o.id}" style="min-width:240px">${options({composites:true, exclude: kind==='composite'?o.id:''})}</select></div>
      <div class="field"><label>Расход (число или формула)</label><input id="cr_${o.id}" class="w" style="width:180px" placeholder="19*thickness/10*1.1"></div>
      <button class="btn" data-act="add-comp" data-kind="${kind}" data-id="${o.id}">Добавить</button></div>`;
}

/* ================= ЭКРАНЫ ================= */
const TABS = [['stages','Технологии'],['objects','Объекты'],['materials','Материалы'],['tools','Инструменты'],['composites','Композиты'],['data','Данные']];
function render(fresh) {
  const l = document.querySelector('.list'), d = document.querySelector('.detail') || document.querySelector('.page'), pb = $('pickbox');
  const sl = l ? l.scrollTop : 0, sd = d ? d.scrollTop : 0, sp = pb ? pb.scrollTop : 0;
  $('nav').innerHTML = TABS.map(([id,t]) => `<button class="tab ${ui.tab===id?'on':''}" data-act="tab" data-tab="${id}">${t}</button>`).join('');
  $('main').innerHTML = {stages:viewStages, objects:viewObjects, materials:viewMaterials, tools:viewTools, composites:viewComposites, data:viewData}[ui.tab]();
  const l2 = document.querySelector('.list'), d2 = document.querySelector('.detail') || document.querySelector('.page'), p2 = $('pickbox');
  if (l2) l2.scrollTop = sl; if (d2 && !fresh) d2.scrollTop = sd; if (p2 && !fresh) p2.scrollTop = sp;
}

/* --- технологии: дерево + страница этапа --- */
function matchTree(s, q) { return s.name.toLowerCase().includes(q) || kids(s.id).some(k => matchTree(k, q)); }
function treeHtml(pid, d, q) {
  return kids(pid).filter(s => !q || matchTree(s, q)).map(s => {
    const has = kids(s.id).length > 0, closed = !q && ui.collapsed.has(s.id);
    return `<div class="trow ${ui.stageId===s.id?'on':''}" style="padding-left:${8 + d*16}px" data-act="sel-stage" data-id="${s.id}">
      <span class="car" data-act="tgl-stage" data-id="${s.id}">${has ? (closed ? '▸' : '▾') : ''}</span><span class="tt">${esc(s.name)}${s.mode==='choice' && has ? '<span class="fork">⑂</span>' : ''}</span>${s.unit ? `<span class="tu">${esc(s.unit)}</span>` : ''}</div>`
      + (has && !closed ? treeHtml(s.id, d + 1, q) : '');
  }).join('');
}
function viewStages() {
  const s = byId(S.stages, ui.stageId);
  return `<div class="split ${s ? 'sel' : ''}"><aside class="list">
    <div class="lh"><b>Технологии и этапы</b><span><button class="ib" data-act="add-stage" data-pid="" title="Новый раздел верхнего уровня">＋</button><button class="ib" data-act="collapse-all" title="Свернуть всё">⊟</button><button class="ib" data-act="expand-all" title="Развернуть всё">⊞</button></span></div>
    <input class="search" data-live="tree-q" placeholder="Поиск…" value="${esc(ui.q)}">
    <div id="treebox">${S.stages.length ? treeHtml('', 0, ui.q.toLowerCase()) : '<div class="empty">Пусто. Нажмите ＋ или импортируйте заметки на вкладке «Данные».</div>'}</div></aside>
    <section class="detail">${s ? stageDetail(s) : '<div class="ph">← Выберите этап.<br><br>Этап — это узел дерева: раздел, технология, вариант или шаг. У шага задаются единица, цена работы, формула объёма, материалы с расходом и инструменты. Ветвление (⑂) — когда подэтапы это варианты на выбор.</div>'}</section></div>`;
}
function stageDetail(s) {
  const V = defVars(), c = cost('stage', s.id, V), a = anc(s.id), ch = kids(s.id), dset = descIds(s.id);
  const bc = a.slice(0, -1).map(x => `<a href="#" data-act="go-stage" data-id="${x.id}">${esc(x.name)}</a>`).join(' / ');
  const pOpts = '<option value="">— верхний уровень —</option>' + S.stages.filter(x => x.id !== s.id && !dset.has(x.id)).map(x => `<option value="${x.id}" ${x.id === s.parentId ? 'selected' : ''}>${esc(path(x.id).join(' › '))}</option>`).join('');
  const free = S.tools.filter(t => !(s.tools || []).includes(t.id)).sort((x,y) => x.name.localeCompare(y.name,'ru'));
  const chips = (s.tools || []).map(id => byId(S.tools, id)).filter(Boolean).map(t => `<span class="chip">${esc(t.name)}<button data-act="del-stool" data-id="${s.id}" data-tool="${t.id}">✕</button></span>`).join('');
  const notes = (s.notes || []).map((n, i) => `<div class="nrow"><select class="cell cat-${n.cat}" data-act="set-note" data-id="${s.id}" data-i="${i}" data-f="cat">${Object.entries(CATS).map(([k,v]) => `<option value="${k}" ${n.cat===k?'selected':''}>${v}</option>`).join('')}</select>
    <input class="cell t" data-act="set-note" data-id="${s.id}" data-i="${i}" data-f="text" value="${esc(n.text)}"><button class="btn sm ghost bad" data-act="del-note" data-id="${s.id}" data-i="${i}">✕</button></div>`).join('');
  return `<button class="btn ghost sm only-m" data-act="back-list">← К списку</button>
  <div class="crumbs">${bc || 'верхний уровень'}</div>
  <input class="namein" data-act="set-stage" data-id="${s.id}" data-f="name" value="${esc(s.name)}">
  <div class="bar"><button class="btn" data-act="add-stage" data-pid="${s.id}">＋ Подэтап</button>
    <button class="btn" data-act="mv-stage" data-id="${s.id}" data-dir="-1" title="Выше">↑</button><button class="btn" data-act="mv-stage" data-id="${s.id}" data-dir="1" title="Ниже">↓</button>
    <select class="sel" data-act="set-parent" data-id="${s.id}" title="Перенести" style="max-width:260px">${pOpts}</select>
    <button class="btn bad" data-act="del-stage" data-id="${s.id}">Удалить</button></div>

  <div class="card"><div class="ch"><h3>Работа и объём</h3><span class="hint">значения по умолчанию подставляются в объекты</span></div><div class="cb"><div class="fields">
    <div class="field"><label>Единица (м2, м, шт)</label><input class="w" data-act="set-stage" data-id="${s.id}" data-f="unit" value="${esc(s.unit)}" placeholder="м2"></div>
    <div class="field"><label>Цена работы, ₽ за ед.</label><input class="w num" data-act="set-stage" data-id="${s.id}" data-f="price" value="${s.price || ''}" placeholder="0"></div>
    <div class="field"><label>Объём считать как (формула)</label><input style="width:200px" class="num" data-act="set-stage" data-id="${s.id}" data-f="vol" value="${esc(s.vol)}" placeholder="floor"></div>
    <div class="field"><label>Подэтапы — это</label><select class="sel" data-act="set-mode" data-id="${s.id}"><option value="steps" ${s.mode!=='choice'?'selected':''}>шаги по порядку (все)</option><option value="choice" ${s.mode==='choice'?'selected':''}>варианты на выбор (один)</option></select></div></div>
    <div class="hint" style="margin-top:8px">Переменные: ${S.params.map(p => `<b class="mono">${esc(p.key)}</b> — ${esc(p.label)}`).join(', ') || 'нет'}. Пример: <span class="mono">floor</span>, <span class="mono">walls*0.9</span>. Параметры настраиваются на вкладке «Данные».</div>
    ${s.unit ? `<div class="kpi"><div><span>Работа за 1 ${esc(s.unit)}</span><b>${fmt(c.labor)} ₽</b></div><div><span>Материалы</span><b>${fmt(c.mat)} ₽</b></div><div><span>Расходники</span><b>${fmt(c.cons)} ₽</b></div><div class="g"><span>Итого за 1 ${esc(s.unit)}</span><b>${fmt(c.mat + c.cons + c.labor)} ₽</b></div></div><div class="hint" style="margin-top:6px">Расчёт при значениях параметров по умолчанию. В объекте подставятся его значения.</div>` : '<div class="hint" style="margin-top:8px">Без единицы этап — просто раздел или группа. Стоимость и материалы задаются у шагов с единицей.</div>'}</div></div>

  ${s.unit ? `<div class="card"><div class="ch"><h3>Материалы на 1 ${esc(s.unit)}</h3><span class="hint">расход можно писать формулой с параметрами</span></div>${compEditor('stage', s)}</div>` : ''}

  <div class="card"><div class="ch"><h3>Инструменты</h3></div>${chips ? `<div class="chips">${chips}</div>` : '<div class="empty" style="padding:12px">Не указаны.</div>'}
    <div class="addrow" style="border:0"><select class="sel" id="addTool" style="min-width:220px"><option value="">— добавить из справочника —</option>${free.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
    <button class="btn" data-act="add-stool" data-id="${s.id}">Добавить</button><button class="btn ghost" data-act="new-stool" data-id="${s.id}">＋ новый инструмент</button></div></div>

  <div class="card"><div class="ch"><h3>Условия, ошибки, приёмка</h3></div>${notes || '<div class="empty" style="padding:12px">Нет пунктов.</div>'}
    <div class="addrow"><div class="field"><label>Тип</label><select class="sel" id="nCat">${Object.entries(CATS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="field" style="flex:1"><label>Текст</label><input id="nText" style="width:100%" placeholder="Просвет под 2-метровым правилом ≤ 2 мм"></div><button class="btn" data-act="add-note" data-id="${s.id}">Добавить</button></div></div>

  ${ch.length ? `<div class="card"><div class="ch"><h3>${s.mode === 'choice' ? 'Варианты (при применении выбирается один)' : 'Шаги по порядку'}</h3></div><div class="kids">${ch.map(k => { const kc = cost('stage', k.id, V); return `<a href="#" data-act="go-stage" data-id="${k.id}"><span>${esc(k.name)}${kids(k.id).length ? ` <span class="hint">· ${kids(k.id).length} шаг.</span>` : ''}</span><span class="mono hint">${k.unit ? fmt(kc.mat + kc.cons + kc.labor) + ' ₽/' + esc(k.unit) : ''}</span></a>`; }).join('')}</div></div>` : ''}`;
}

/* --- объекты --- */
function viewObjects() {
  const o = byId(S.objects, ui.objId);
  const list = S.objects.map(x => `<div class="orow ${x.id === ui.objId ? 'on' : ''}" data-act="sel-obj" data-id="${x.id}"><b>${esc(x.name)}</b><span>${fmt(totals(x).grand)} ₽</span></div>`).join('');
  return `<div class="split ${o ? 'sel' : ''}"><aside class="list"><div class="lh"><b>Объекты</b><button class="ib" data-act="add-obj" title="Новый объект">＋</button></div>
    <div class="olist">${list || '<div class="empty">Объектов нет. Нажмите ＋</div>'}</div></aside>
    <section class="detail">${o ? objectDetail(o) : '<div class="ph">← Выберите объект или создайте новый (＋).<br><br>Объект — квартира, дом, помещение. Вы задаёте его параметры (площади, толщины) и отмечаете, какие этапы работ применяются. Материалы, количества и деньги считаются сами.</div>'}</section></div>`;
}
function pickHtml(o, pid, d, q) {
  const parent = pid ? byId(S.stages, pid) : null, choice = parent && parent.mode === 'choice', V = objVars(o);
  return kids(pid).filter(s => !q || matchTree(s, q)).map(s => {
    const has = kids(s.id).length > 0, on = !!o.sel[s.id], open = !!q || ui.pexp.has(s.id);
    const input = choice ? `<input type="radio" name="r_${pid}" ${o.pick[pid] === s.id && on ? 'checked' : ''} data-act="pick-variant" data-id="${s.id}">`
      : `<input type="checkbox" ${on ? 'checked' : ''} data-act="pick-toggle" data-id="${s.id}">`;
    let vol = '';
    if (on && s.unit && !(parent && parent.mode === 'choice' && o.pick[pid] !== s.id)) { const r = rowOf(o, 'stage', s, V), ov = (o.sel[s.id] && o.sel[s.id].q) || '';
      vol = `<span class="vol"><input class="cell mono" data-act="set-q" data-id="${s.id}" value="${esc(ov)}" placeholder="${esc(s.vol || 'объём')}" title="Объём: число или формула. Пусто — по умолчанию (${esc(s.vol)})"> <span class="eq">${r.bad ? '<span class="warn">ошибка</span>' : r.missing ? '<span class="warn">укажите объём</span>' : '= ' + fmtQ(r.q) + ' ' + esc(s.unit)}</span> <span class="mono">${fmt(r.total)} ₽</span></span>`; }
    let scope = '', roomLine = '';
    if (on && s.unit && o.rooms.length > 1 && !(parent && parent.mode === 'choice' && o.pick[pid] !== s.id)) {
      const ids = ((o.sel[s.id] || {}).rooms || []).filter(i => o.rooms.some(r => r.id === i)), lbl = ids.length ? `${ids.length} из ${o.rooms.length}` : 'все';
      scope = `<button class="btn sm ghost" data-act="tgl-rp" data-id="${s.id}" title="В каких помещениях делаем">🏠 ${lbl}</button>`;
      if (ui.rp === s.id) roomLine = `<div class="prow" style="padding-left:${30 + d*18}px"><span class="hint">Помещения:</span>${o.rooms.map(r => `<label style="flex:none"><input type="checkbox" data-act="toggle-room" data-id="${s.id}" data-room="${r.id}" ${!ids.length || ids.includes(r.id) ? 'checked' : ''}> ${esc(r.name)}</label>`).join('')}</div>`;
    }
    return `<div class="prow ${on ? 'on' : ''}" style="padding-left:${6 + d*18}px"><span class="car" data-act="tgl-pick" data-id="${s.id}" style="cursor:pointer">${has ? (open ? '▾' : '▸') : ''}</span>
      <label>${input}<span>${esc(s.name)}${s.mode === 'choice' && has ? '<span class="fork">⑂ выбор варианта</span>' : ''}</span></label>${scope}${vol}</div>${roomLine}`
      + (has && open ? pickHtml(o, s.id, d + 1, q) : '');
  }).join('');
}
function objectDetail(o) {
  const rows = objRows(o), T = totals(o, rows), bl = buyList(o, rows), buyTotal = bl.reduce((s, x) => s + x.buy, 0), tn = toolsNeeded(o);
  const rc = roomsCalc(o.rooms), hasR = o.rooms.length > 0;
  const prm = S.params.map(p => { const auto = hasR && AUTO_KEYS.includes(p.key);
    return `<div class="field"><label>${esc(p.label)}${p.unit ? ', ' + esc(p.unit) : ''} <span class="mono">${esc(p.key)}</span>${auto ? ' · из помещений' : ''}</label><input class="num w" ${auto ? 'disabled' : ''} data-act="set-value" data-key="${esc(p.key)}" value="${auto ? esc(n2(rc[p.key])) : esc(o.values[p.key] !== undefined ? o.values[p.key] : p.def)}"></div>`; }).join('');
  const roomRows = o.rooms.map(r => { const l = num(r.l), w = num(r.w), pm = 2 * (l + w);
    return `<tr><td><input class="cell" style="width:100%;min-width:120px" data-act="set-room" data-id="${r.id}" data-f="name" value="${esc(r.name)}"></td>` +
      ['l','w','h','open'].map(f => `<td class="num"><input class="cell num" style="width:76px" data-act="set-room" data-id="${r.id}" data-f="${f}" value="${esc(r[f])}"></td>`).join('') +
      `<td class="num">${fmt(l*w)}</td><td class="num">${fmt(Math.max(0, pm*num(r.h) - num(r.open)))}</td><td><button class="btn sm ghost bad" data-act="del-room" data-id="${r.id}">✕</button></td></tr>`; }).join('');
  const roomsCard = `<div class="card"><div class="ch"><h3>1. Помещения</h3><span class="hint">необязательно</span></div>
    ${hasR ? `<div class="scroll"><table><thead><tr><th>Помещение</th><th class="num">Длина, м</th><th class="num">Ширина, м</th><th class="num">Высота, м</th><th class="num">Проёмы, м²</th><th class="num">Пол, м²</th><th class="num">Стены, м²</th><th></th></tr></thead><tbody>${roomRows}</tbody></table></div>
    <div class="totals"><div><span>Пол / потолок</span><b>${fmt(rc.floor)} м²</b></div><div><span>Стены</span><b>${fmt(rc.walls)} м²</b></div><div><span>Периметр</span><b>${fmt(rc.perimeter)} м</b></div></div>` : ''}
    <div class="addrow"><div class="field"><label>Помещение</label><input id="rName" placeholder="Спальня"></div><div class="field"><label>Длина, м</label><input id="rL" class="w"></div><div class="field"><label>Ширина, м</label><input id="rW" class="w"></div>
    <div class="field"><label>Высота, м</label><input id="rH" class="w" placeholder="2.7"></div><div class="field"><label>Проёмы, м²</label><input id="rO" class="w" placeholder="0"></div><button class="btn" data-act="add-room">Добавить помещение</button></div>
    <div class="hint" style="padding:0 16px 12px">С помещениями площади пола, потолка, стен и периметр считаются сами, а этап можно привязать к отдельным комнатам (кнопка 🏠 в списке работ). Без помещений значения вводятся вручную в параметрах. Проёмы — окна и двери, вычитаются из стен.</div></div>`;
  const finBlock = `<div class="addrow" style="border-top:1px solid var(--line)">${FIN.map(([k, l]) => `<div class="field"><label>${l}</label><input class="num w" data-act="set-fin" data-key="${k}" value="${esc(o.fin[k])}"></div>`).join('')}</div>
    <div class="totals"><div><span>Накладные</span><b>${fmt(T.overhead)} ₽</b></div><div><span>Скидка</span><b>${fmt(T.discount ? -T.discount : 0)} ₽</b></div><div><span>НДС</span><b>${fmt(T.vat)} ₽</b></div><div class="g"><span>К оплате</span><b>${fmt(T.grand)} ₽</b></div></div>
    <div class="hint" style="padding:0 16px 12px">Запас добавляется к материалам и расходникам (и в закупку). Накладные считаются от подытога, скидка — после накладных, НДС — в конце.</div>`;
  const groups = new Map(); rows.forEach(r => { if (!groups.has(r.grp)) groups.set(r.grp, []); groups.get(r.grp).push(r); });
  let n = 0, srows = '';
  for (const [g, arr] of groups) {
    srows += `<tr class="grp"><td colspan="9">${esc(g)}<span class="gs">${fmt(T.groups.get(g))} ₽</span></td></tr>`;
    for (const r of arr) { n++; const open = ui.rows.has(r.key); let bd = '';
      if (r.canOpen && open) {
        const ls = [...mats(r.refType, r.refId, r.q * r.k, r.V)].map(([id, q]) => { const m = byId(S.materials, id);
          return `<tr><td>${esc(m.name)} <span class="pill ${m.category}">${m.category === 'consumable' ? 'расходник' : 'материал'}</span></td><td>${esc(m.unit)}</td><td class="num">${fmtQ(q)}</td><td class="num">${fmt(q * unitPrice(m))} ₽</td></tr>`; }).join('');
        bd = `<tr><td></td><td colspan="8" style="padding:0"><div class="bd">${ls ? `<table><thead><tr><th>Материал</th><th>Ед.</th><th class="num">Нужно</th><th class="num">Стоимость</th></tr></thead><tbody>${ls}</tbody></table>` : '<span class="hint">Материалов нет.</span>'}</div></td></tr>`; }
      srows += `<tr><td class="idx">${n}</td><td><span class="pill ${r.pill}">${esc(r.pillLabel)}</span>${esc(r.name)}${r.cyc ? ' <span class="warn">⚠ цикл</span>' : ''}${r.missing ? ' <span class="warn">нет объёма</span>' : ''}${r.parent ? `<div class="path">${esc(r.parent)}</div>` : ''}
        ${r.canOpen ? `<div><button class="tgl" data-act="tgl-row" data-id="${r.key}">${open ? '▾ скрыть материалы' : '▸ материалы'}</button></div>` : ''}</td>
        <td class="num">${fmtQ(r.q)} ${esc(r.unit)}</td><td class="num">${fmt(r.uc.mat + r.uc.cons + r.uc.labor)}</td><td class="num">${fmt(r.mat)}</td><td class="num">${fmt(r.cons)}</td><td class="num">${fmt(r.labor)}</td><td class="num"><b>${fmt(r.total)}</b></td><td></td></tr>${bd}`; }
  }
  const erows = (o.extra || []).map((e, i) => { const r = rowOf(o, 'extra', e, objVars(o));
    return `<tr><td><span class="pill ${r.pill}">${esc(r.pillLabel)}</span>${esc(r.name)}</td><td>${esc(r.unit)}</td><td style="white-space:nowrap"><input class="cell mono" style="width:90px" data-act="set-extra" data-i="${i}" value="${esc(e.qty)}"> <span class="eq">${r.bad ? '<span class="warn">ошибка</span>' : '= ' + fmtQ(r.q)}</span></td><td class="num">${fmt(r.total)}</td>
      <td><button class="btn sm ghost bad" data-act="del-extra" data-i="${i}">✕</button></td></tr>`; }).join('');
  const addForm = ui.custom ? `<div class="field"><label>Название</label><input id="cuName" placeholder="Доставка"></div>
    <div class="field"><label>Тип</label><select id="cuCat"><option value="material">материал</option><option value="consumable">расходник</option><option value="labor">работа</option></select></div>
    <div class="field"><label>Ед.</label><input id="cuUnit" class="w" placeholder="усл."></div><div class="field"><label>Кол-во</label><input id="cuQty" class="w" placeholder="1"></div>
    <div class="field"><label>Цена/ед., ₽</label><input id="cuPrice" class="w"></div><button class="btn" data-act="add-custom">Добавить</button>`
    : `<div class="field"><label>Материал или композит</label><select class="sel" id="exSel" style="min-width:260px">${options({composites:true})}</select></div>
    <div class="field"><label>Количество (число или формула)</label><input id="exQty" class="w" style="width:150px" placeholder="walls"></div><button class="btn" data-act="add-extra">Добавить</button>`;
  return `<button class="btn ghost sm only-m" data-act="back-list">← К списку</button>
  <input class="namein" data-act="set-obj" data-f="name" value="${esc(o.name)}"><input class="namein sub" data-act="set-obj" data-f="note" placeholder="Адрес / заметка" value="${esc(o.note || '')}">
  <div class="bar"><button class="btn pri" data-act="export-xlsx">Экспорт в Excel</button><button class="btn bad" data-act="del-obj">Удалить объект</button></div>

  ${roomsCard}
  <div class="card"><div class="ch"><h3>2. Параметры объекта</h3><button class="btn sm" data-act="add-param">＋ параметр</button></div><div class="cb"><div class="fields">${prm || '<span class="hint">Параметров нет.</span>'}</div></div></div>

  <div class="card"><div class="ch"><h3>3. Какие работы выполняем</h3><input class="search" style="width:200px;margin:0" data-live="pick-q" placeholder="Поиск…" value="${esc(ui.pq)}"></div>
    <div class="legend">Отметьте этапы. Для ветвления (⑂) выберите один вариант. Объём считается по формуле этапа из параметров, его можно переопределить в поле справа.</div>
    <div class="pbox" id="pickbox">${pickHtml(o, '', 0, ui.pq.toLowerCase()) || '<div class="empty">Нет этапов. Создайте их на вкладке «Технологии».</div>'}</div></div>

  <div class="card"><div class="ch"><h3>4. Смета</h3></div>
    ${rows.length ? `<div class="scroll"><table><thead><tr><th></th><th>Этап / позиция</th><th class="num">Объём</th><th class="num">Цена/ед.</th><th class="num">Материалы</th><th class="num">Расходники</th><th class="num">Работа</th><th class="num">Сумма</th><th></th></tr></thead><tbody>${srows}</tbody></table></div>
    <div class="totals"><div><span>Материалы</span><b>${fmt(T.mat)} ₽</b></div><div><span>Расходники</span><b>${fmt(T.cons)} ₽</b></div><div><span>Работа</span><b>${fmt(T.labor)} ₽</b></div><div><span>Подытог</span><b>${fmt(T.sub)} ₽</b></div></div>${finBlock}`
    : '<div class="empty">Пока ничего не выбрано. Отметьте этапы выше.</div>'}
    ${erows ? `<div class="ch" style="border-top:1px solid var(--line)"><h3>Дополнительные позиции</h3></div><div class="scroll"><table><tbody>${erows}</tbody></table></div>` : ''}
    <div class="addrow"><b class="hint" style="align-self:center">Добавить вручную:</b>${addForm}<button class="btn ghost sm" data-act="tgl-custom">${ui.custom ? '← материал/композит' : 'своя позиция'}</button></div></div>

  ${rows.length ? `<div class="card"><div class="ch"><h3>5. Материалы к закупке</h3><span class="hint">упаковки округляются вверх</span></div><div class="scroll"><table><thead><tr><th>Материал</th><th>Ед.</th><th class="num">Нужно</th><th class="num">В упак.</th><th class="num">Упаковок</th><th class="num">По факту, ₽</th><th class="num">К закупке, ₽</th></tr></thead><tbody>${bl.map(x => `<tr><td>${esc(x.name)} <span class="pill ${x.cat}">${x.cat === 'consumable' ? 'расходник' : 'материал'}</span></td><td>${esc(x.unit)}</td><td class="num">${fmtQ(x.qty)}</td><td class="num">${x.packQty ? fmtQ(x.packQty) : '—'}</td><td class="num">${x.packQty ? '<b>' + x.packs + '</b>' : '—'}</td><td class="num">${fmt(x.exact)}</td><td class="num">${fmt(x.buy)}</td></tr>`).join('') || '<tr><td colspan="7" class="hint">Материалов нет</td></tr>'}</tbody></table></div>
    <div class="totals"><div class="g"><span>Закупка (целые упаковки)</span><b>${fmt(buyTotal)} ₽</b></div></div></div>
  <div class="card"><div class="ch"><h3>6. Нужные инструменты</h3></div>${tn.length ? `<div class="scroll"><table><tbody>${tn.map(x => `<tr><td>${esc(x.t.name)}</td><td class="hint">${esc(x.where.join('; '))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">В выбранных этапах инструменты не указаны.</div>'}</div>` : ''}`;
}

/* --- материалы / инструменты / композиты / данные --- */
function viewMaterials() {
  const rows = S.materials.map((m,i) => `<tr><td class="idx">${i+1}</td>
    <td><input class="cell" style="width:100%;min-width:180px" data-act="set-mat" data-id="${m.id}" data-f="name" value="${esc(m.name)}"></td>
    <td><select class="cell" data-act="set-mat" data-id="${m.id}" data-f="category"><option value="material" ${m.category!=='consumable'?'selected':''}>материал</option><option value="consumable" ${m.category==='consumable'?'selected':''}>расходник</option></select></td>
    <td><input class="cell" style="width:64px" data-act="set-mat" data-id="${m.id}" data-f="unit" value="${esc(m.unit)}"></td>
    <td class="num"><input class="cell num" style="width:100px" data-act="set-mat" data-id="${m.id}" data-f="price" value="${m.price}"></td>
    <td class="num"><input class="cell num" style="width:80px" data-act="set-mat" data-id="${m.id}" data-f="packQty" value="${m.packQty}"></td>
    <td class="num">${fmt(unitPrice(m))} ₽</td><td><button class="btn sm ghost bad" data-act="del-mat" data-id="${m.id}">✕</button></td></tr>`).join('');
  return `<div class="page"><h2 style="margin-top:0">Материалы и расходники</h2><p class="hint">Конкретный материал: цена за упаковку ÷ количество в упаковке = цена за единицу. Расходники (саморезы, диски) в смете идут отдельной колонкой.</p>
  <div class="card">${rows ? `<div class="scroll"><table><thead><tr><th></th><th>Название</th><th>Тип</th><th>Ед.</th><th class="num">Цена упак., ₽</th><th class="num">В упак.</th><th class="num">Цена/ед.</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Пусто.</div>'}
  <div class="addrow"><div class="field"><label>Название</label><input id="mName" placeholder="Цемент М500"></div>
  <div class="field"><label>Тип</label><select id="mCat"><option value="material">материал</option><option value="consumable">расходник</option></select></div>
  <div class="field"><label>Ед.</label><input id="mUnit" class="w" placeholder="кг"></div><div class="field"><label>Цена упак., ₽</label><input id="mPrice" class="w"></div>
  <div class="field"><label>В упаковке</label><input id="mQty" class="w" placeholder="50"></div><button class="btn pri" data-act="add-mat">Добавить</button></div></div></div>`;
}
function viewTools() {
  const used = id => S.stages.filter(s => (s.tools || []).includes(id)).length;
  const rows = S.tools.map((t,i) => `<tr><td class="idx">${i+1}</td><td><input class="cell" style="width:100%;min-width:200px" data-act="set-tool" data-id="${t.id}" data-f="name" value="${esc(t.name)}"></td>
    <td><input class="cell" style="width:100%;min-width:200px" data-act="set-tool" data-id="${t.id}" data-f="note" value="${esc(t.note)}" placeholder="Заметка, где взять, аренда…"></td><td class="num">${used(t.id)}</td>
    <td><button class="btn sm ghost bad" data-act="del-tool" data-id="${t.id}">✕</button></td></tr>`).join('');
  return `<div class="page"><h2 style="margin-top:0">Инструменты</h2><p class="hint">Справочник инструментов. Привязываются к этапам на вкладке «Технологии», в объекте собираются в список нужных.</p>
  <div class="card">${rows ? `<div class="scroll"><table><thead><tr><th></th><th>Название</th><th>Заметка</th><th class="num">В этапах</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Пусто.</div>'}
  <div class="addrow"><div class="field"><label>Название</label><input id="tName" placeholder="Лазерный нивелир"></div><button class="btn pri" data-act="add-tool">Добавить</button></div></div></div>`;
}
function viewComposites() {
  const cards = S.composites.map(c => { const k = cost('composite', c.id);
    return `<div class="card"><div class="ch"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input class="cell" style="font-weight:700;width:260px" data-act="set-composite" data-id="${c.id}" data-f="name" value="${esc(c.name)}"><span class="hint">на 1</span>
      <input class="cell" style="width:64px" data-act="set-composite" data-id="${c.id}" data-f="unit" value="${esc(c.unit)}"></div>
      <div><b class="mono">${fmt(k.mat + k.cons)} ₽</b> / ед. ${k.cyc ? '<span class="warn">⚠ цикл</span>' : ''} <button class="btn sm ghost bad" data-act="del-composite" data-id="${c.id}">Удалить</button></div></div>${compEditor('composite', c)}</div>`; }).join('');
  return `<div class="page"><h2 style="margin-top:0">Композиты</h2><p class="hint">Необязательно: сборка из материалов (раствор, штукатурный слой) как один компонент для норм этапов.</p>
  ${cards || '<div class="card"><div class="empty">Композитов нет.</div></div>'}
  <div class="card"><div class="addrow" style="border:0"><div class="field"><label>Название</label><input id="kName" placeholder="Штукатурный раствор"></div>
  <div class="field"><label>Ед. результата</label><input id="kUnit" class="w" placeholder="м2"></div><button class="btn pri" data-act="add-composite">Создать</button></div></div></div>`;
}
function viewData() {
  const extra = dataExtra();
  const prow = S.params.map(p => `<tr><td><input class="cell" style="width:100%" data-act="set-pdef" data-id="${p.id}" data-f="label" value="${esc(p.label)}"></td>
    <td><input class="cell mono" style="width:120px" data-act="set-pdef" data-id="${p.id}" data-f="key" value="${esc(p.key)}"></td><td><input class="cell" style="width:60px" data-act="set-pdef" data-id="${p.id}" data-f="unit" value="${esc(p.unit)}"></td>
    <td class="num"><input class="cell num" style="width:90px" data-act="set-pdef" data-id="${p.id}" data-f="def" value="${esc(p.def)}"></td><td><button class="btn sm ghost bad" data-act="del-pdef" data-id="${p.id}">✕</button></td></tr>`).join('');
  return `<div class="page"><h2 style="margin-top:0">Данные <small class="hint">версия ${APP_VERSION}</small></h2>
  <div class="card"><div class="ch"><h3>Параметры расчёта</h3><button class="btn sm" data-act="add-pdef">＋ параметр</button></div><div class="cb"><p class="hint" style="margin-top:0">Общий список параметров. У каждого объекта свои значения. Ключ используется в формулах объёма и расхода (floor, walls, thickness…).</p></div>
    <div class="scroll"><table><thead><tr><th>Название</th><th>Ключ</th><th>Ед.</th><th class="num">По умолчанию</th><th></th></tr></thead><tbody>${prow}</tbody></table></div></div>
  <div class="card"><div class="ch"><h3>Импорт заметок из Obsidian</h3></div><div class="cb"><p class="hint" style="margin-top:0">Выберите .md-файлы хранилища. Каждый файл станет этапом (вложенность по номеру в названии: «2.5.6. …» попадёт в «2.5.»). Содержимое разбирается в пункты «Условие / Ошибка / Приёмка / Заметка», а перечисленные инструменты — в справочник и привязку к этапу. Материалы, цены и объёмы вы задаёте сами.</p>
  <button class="btn pri" data-act="import-md">Выбрать .md файлы…</button></div></div>
  ${extra}<div class="card"><div class="ch"><h3>Резервная копия</h3></div><div class="cb"><p class="hint" style="margin-top:0">Всё хранится в этом браузере. Очистка данных браузера всё сотрёт — иногда скачивайте копию.</p>
  <button class="btn pri" data-act="export-json">Скачать копию (JSON)</button> <button class="btn" data-act="import-json">Загрузить из файла</button> <button class="btn bad" data-act="reset">Сбросить к примеру</button></div></div></div>`;
}

/* ================= ЭКСПОРТ / ИМПОРТ ================= */
function exportXlsx(o) {
  if (!window.XLSX) return alert('Библиотека Excel не загрузилась — нужен интернет.');
  const rows = objRows(o), T = totals(o, rows), bl = buyList(o, rows);
  const a = [[o.name],[o.note||''],[],['№','Раздел','Этап / позиция','Ед.','Объём','Цена/ед., ₽','Материалы, ₽','Расходники, ₽','Работа, ₽','Сумма, ₽']];
  rows.forEach((r,i) => a.push([i+1, r.grp, r.name, r.unit, n2(r.q), n2(r.uc.mat+r.uc.cons+r.uc.labor), n2(r.mat), n2(r.cons), n2(r.labor), n2(r.total)]));
  a.push([], ['','','ПОДИТОГ','','','',n2(T.mat),n2(T.cons),n2(T.labor),n2(T.sub)]);
  if (num(o.fin.reserve)) a.push(['','','Запас материалов учтён, %','','','',num(o.fin.reserve)]);
  a.push(['','','Накладные расходы','','','','','','',n2(T.overhead)], ['','','Скидка','','','','','','',-n2(T.discount)], ['','','НДС','','','','','','',n2(T.vat)], ['','','К ОПЛАТЕ','','','','','','',n2(T.grand)]);
  const s1 = XLSX.utils.aoa_to_sheet(a); s1['!cols'] = [4,30,50,7,10,12,14,14,12,14].map(w => ({wch:w}));
  const b = [['Материал','Тип','Ед.','Нужно','В упак.','Упаковок','По факту, ₽','К закупке, ₽']];
  bl.forEach(x => b.push([x.name, x.cat==='consumable'?'расходник':'материал', x.unit, n2(x.qty), x.packQty||'', x.packs||'', n2(x.exact), n2(x.buy)]));
  b.push([], ['ИТОГО','','','','','',n2(bl.reduce((s,x)=>s+x.exact,0)),n2(bl.reduce((s,x)=>s+x.buy,0))]);
  const s2 = XLSX.utils.aoa_to_sheet(b); s2['!cols'] = [34,12,7,10,9,10,14,14].map(w => ({wch:w}));
  const s3 = XLSX.utils.aoa_to_sheet([['Инструмент','Где нужен']].concat(toolsNeeded(o).map(x => [x.t.name, x.where.join('; ')]))); s3['!cols'] = [36,70].map(w => ({wch:w}));
  const s4 = XLSX.utils.aoa_to_sheet([['Параметр','Ключ','Значение','Ед.']].concat(S.params.map(p => [p.label, p.key, num(o.values[p.key] !== undefined ? o.values[p.key] : p.def), p.unit]))); s4['!cols'] = [30,14,12,8].map(w => ({wch:w}));
  const s5 = XLSX.utils.aoa_to_sheet([['Помещение','Длина, м','Ширина, м','Высота, м','Проёмы, м²','Пол, м²','Стены, м²']].concat(o.rooms.map(r => [r.name, num(r.l), num(r.w), num(r.h), num(r.open), n2(num(r.l)*num(r.w)), n2(Math.max(0, 2*(num(r.l)+num(r.w))*num(r.h) - num(r.open)))]))); s5['!cols'] = [24,10,10,10,11,10,10].map(w => ({wch:w}));
  const wb = XLSX.utils.book_new(); [['Смета',s1],['Материалы',s2],['Инструменты',s3],['Параметры',s4]].concat(o.rooms.length ? [['Помещения',s5]] : []).forEach(([n,s]) => XLSX.utils.book_append_sheet(wb, s, n));
  XLSX.writeFile(wb, 'smeta_' + (o.name || 'object').replace(/[^\p{L}\d]+/gu,'_') + '.xlsx');
}
function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type:'application/json'})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
const codeOf = n => { const m = /^(\d+(?:\.\d+)*)\.?(?:\s|$)/.exec(String(n).trim()); return m ? m[1] : ''; };
async function importMd(files) {
  const items = [];
  for (const f of files) { const t = (await f.text()).replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''); items.push({name:f.name.replace(/\.md$/i,'').trim(), text:t}); }
  const cmp = (a, b) => { const x = codeOf(a.name), y = codeOf(b.name); if (x && !y) return -1; if (!x && y) return 1; if (!x && !y) return a.name.localeCompare(b.name,'ru');
    const p = x.split('.').map(Number), q = y.split('.').map(Number); for (let i = 0; i < Math.max(p.length, q.length); i++) { const d = (p[i] ?? -1) - (q[i] ?? -1); if (d) return d; } return 0; };
  items.sort(cmp); let added = 0, upd = 0;
  for (const it of items) {
    const pn = parseNote(it.text), tids = pn.tools.map(n => getTool(n).id); let st = S.stages.find(s => s.name === it.name);
    if (st) { st.notes = pn.items; st.tools = [...new Set((st.tools || []).concat(tids))]; upd++; continue; }
    let parentId = ''; const parts = codeOf(it.name).split('.').filter(Boolean);
    for (let k = parts.length - 1; k >= 1 && !parentId; k--) { const pc = parts.slice(0, k).join('.'), p = S.stages.find(s => codeOf(s.name) === pc); if (p) parentId = p.id; }
    S.stages.push({id:uid(), parentId, name:it.name, mode:'steps', unit:'', price:0, vol:'', components:[], tools:[...new Set(tids)], notes:pn.items}); added++;
  }
  ui.tab = 'stages'; commit(); alert(`Готово: добавлено этапов — ${added}, обновлено — ${upd}. Инструментов в справочнике: ${S.tools.length}.`);
}

/* ================= СНИМКИ И ОБЛАКО (GitHub Gist) ================= */
const snaps = () => { try { return JSON.parse(localStorage.getItem(SNAPKEY) || '[]'); } catch (e) { return []; } };
function snap(force) { // локальные точки отката: не чаще раза в 5 минут, последние 5
  try { const arr = snaps(), last = arr[arr.length - 1], now = Date.now();
    if (!force && last && now - last.t < 5 * 60e3) return;
    arr.push({t:now, d:JSON.stringify(S)}); while (arr.length > 5) arr.shift(); localStorage.setItem(SNAPKEY, JSON.stringify(arr)); } catch (e) { try { localStorage.removeItem(SNAPKEY); } catch (e2) {} }
}
const syncCfg = () => { try { return JSON.parse(localStorage.getItem(SYNCKEY)) || {}; } catch (e) { return {}; } };
const setSyncCfg = c => localStorage.setItem(SYNCKEY, JSON.stringify(c));   // токен хранится только здесь и не попадает в резервные копии
let syncMsg = '', syncBusy = false, syncT;
function showSync(msg, bad) { syncMsg = msg; const el = $('sync'); if (el) { el.textContent = msg; el.className = 'sync' + (bad ? ' bad' : ''); } }
const stamp = () => new Date().toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
const GFILE = 'stroysmeta.json';
async function gh(method, url, body) {
  const r = await fetch('https://api.github.com' + url, {method, headers:Object.assign({Authorization:'Bearer ' + syncCfg().token, Accept:'application/vnd.github+json'}, body ? {'Content-Type':'application/json'} : {}), body:body ? JSON.stringify(body) : undefined});
  if (!r.ok) throw new Error(r.status === 401 ? 'токен не подошёл (401)' : r.status === 404 ? 'не найдено (404)' : 'ошибка GitHub ' + r.status);
  return r.json();
}
const gistFind = async () => (await gh('GET', '/gists?per_page=100')).find(g => g.files && g.files[GFILE]);
async function gistRead(id) { const g = await gh('GET', '/gists/' + id), f = g.files[GFILE]; if (!f) throw new Error('в облаке нет файла данных');
  return JSON.parse(f.truncated ? await (await fetch(f.raw_url)).text() : f.content); }
async function cloudPush() {
  const c = syncCfg(); if (!c.token || syncBusy) return; syncBusy = true;
  try { const files = {[GFILE]:{content:JSON.stringify(S)}};
    if (c.gistId) await gh('PATCH', '/gists/' + c.gistId, {files});
    else c.gistId = (await gh('POST', '/gists', {description:'Помощник строителя — данные (не удалять)', public:false, files})).id;
    c.lastSync = S.updated; setSyncCfg(c); showSync('☁ сохранено ' + stamp());
  } catch (e) { showSync('☁ ошибка: ' + e.message, true); } finally { syncBusy = false; }
}
function applyRemote(d) { snap(true); migrate(d); ui.objId = null; ui.stageId = null; save({keepStamp:true}); render(true); }
function scheduleSync() { const c = syncCfg(); if (!c.token || c.auto === false) return; clearTimeout(syncT); showSync('☁ …'); syncT = setTimeout(cloudPush, 3000); }
async function cloudConnect(token) {
  setSyncCfg({token, auto:true});
  try { const g = await gistFind(), c = syncCfg();
    if (g) { c.gistId = g.id; setSyncCfg(c);
      if (confirm('В облаке уже есть данные. ОК — загрузить их сюда. Отмена — перезаписать облако текущими данными.')) { applyRemote(await gistRead(g.id)); c.lastSync = S.updated; setSyncCfg(c); showSync('☁ загружено ' + stamp()); }
      else await cloudPush();
    } else await cloudPush();
  } catch (e) { setSyncCfg({}); showSync(''); alert('Не удалось подключить: ' + e.message); }
  render();
}
async function cloudReconcile() { // при запуске: сверить облако и локальные данные
  const c = syncCfg(); if (!c.token) return;
  try { showSync('☁ проверка…');
    if (!c.gistId) { const g = await gistFind(); if (!g) return cloudPush(); c.gistId = g.id; setSyncCfg(c); }
    const r = await gistRead(c.gistId), ls = c.lastSync || 0, remoteNew = (r.updated || 0) > ls, localNew = (S.updated || 0) > ls;
    if (remoteNew && localNew) {
      if (confirm('Данные изменены на другом устройстве, и здесь тоже есть изменения. ОК — взять данные из облака (текущие сохранятся в снимок). Отмена — оставить локальные и перезаписать облако.')) { applyRemote(r); c.lastSync = S.updated; setSyncCfg(c); showSync('☁ загружено ' + stamp()); }
      else await cloudPush();
    } else if (remoteNew) { applyRemote(r); c.lastSync = S.updated; setSyncCfg(c); showSync('☁ обновлено из облака ' + stamp()); }
    else if (localNew) await cloudPush();
    else showSync('☁ синхронизировано');
  } catch (e) { showSync('☁ нет связи: ' + e.message, true); }
}
function dataExtra() {
  const c = syncCfg(), sn = snaps();
  const fd = FIN.map(([k, l]) => `<div class="field"><label>${l}</label><input class="num w" data-act="set-findef" data-key="${k}" value="${esc(S.finDefaults[k])}"></div>`).join('');
  const cloud = c.token ? `<p class="hint" style="margin-top:0">Подключено. ${esc(syncMsg)}</p><label class="hint"><input type="checkbox" data-act="sync-auto" ${c.auto !== false ? 'checked' : ''}> отправлять изменения автоматически</label><br><br>
      <button class="btn pri" data-act="cloud-push">Отправить сейчас</button> <button class="btn" data-act="cloud-pull">Загрузить из облака</button> <button class="btn bad" data-act="cloud-off">Отключить</button>`
    : `<p class="hint" style="margin-top:0">Данные сохраняются в ваш приватный Gist на GitHub и доступны с любого устройства. Подключение: 1) откройте <a href="https://github.com/settings/tokens/new?scopes=gist&description=stroysmeta" target="_blank" rel="noopener">создание токена</a> (галочка gist уже отмечена); 2) нажмите Generate token внизу страницы; 3) скопируйте токен и вставьте сюда. На другом устройстве сделайте то же — данные подтянутся сами. Токен хранится только в этом браузере, никому его не показывайте.</p>
      <div class="fields"><div class="field"><label>Токен GitHub</label><input id="ghToken" type="password" style="width:300px" placeholder="ghp_…"></div><button class="btn pri" data-act="cloud-on">Подключить</button></div>`;
  return `<div class="card"><div class="ch"><h3>Облако (GitHub Gist)</h3></div><div class="cb">${cloud}</div></div>
  <div class="card"><div class="ch"><h3>Точки отката</h3><span class="hint">автоматически, последние 5</span></div>${sn.length ? `<table><tbody>${sn.map((x, i) => ({x, i})).reverse().map(({x, i}) => `<tr><td>${new Date(x.t).toLocaleString('ru-RU')}</td><td class="num"><button class="btn sm" data-act="restore-snap" data-i="${i}">Восстановить</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Появятся после первых изменений.</div>'}</div>
  <div class="card"><div class="ch"><h3>Итог сметы по умолчанию для новых объектов</h3></div><div class="cb"><div class="fields">${fd}</div></div></div>`;
}

/* ================= ДЕЙСТВИЯ ================= */
const curObj = () => byId(S.objects, ui.objId);
const cleanKey = k => k.replace(/[^\p{L}\d_]/gu,'_').replace(/^(\d)/,'_$1');
const compOwner = el => el.dataset.kind === 'stage' ? byId(S.stages, el.dataset.id) : byId(S.composites, el.dataset.id);
function removeStage(id) { const ids = new Set([id, ...descIds(id)]); S.stages = S.stages.filter(s => !ids.has(s.id)); S.objects.forEach(o => ids.forEach(i => { delete o.sel[i]; })); }
const selectStage = id => { ui.tab = 'stages'; ui.stageId = id; anc(id).slice(0,-1).forEach(a => ui.collapsed.delete(a.id)); render(true); };
function newParam() { const l = prompt('Название параметра (например, Площадь потолка):'); if (!l || !l.trim()) return; const k = cleanKey((prompt('Ключ латиницей (например, ceiling):') || '').trim()); if (!k) return;
  if (S.params.some(p => p.key === k)) return alert('Такой ключ уже есть.'); S.params.push({id:uid(), key:k, label:l.trim(), unit:(prompt('Единица (м², м, мм):') || '').trim(), def:0}); commit(); }

const H = {
  tab: el => { ui.tab = el.dataset.tab; render(true); },
  'back-list': () => { ui.stageId = null; ui.objId = null; render(true); },
  'sel-stage': el => selectStage(el.dataset.id),
  'go-stage': el => selectStage(el.dataset.id),
  'tgl-stage': el => { const id = el.dataset.id; ui.collapsed.has(id) ? ui.collapsed.delete(id) : ui.collapsed.add(id); render(); },
  'collapse-all': () => { S.stages.forEach(s => kids(s.id).length && ui.collapsed.add(s.id)); render(); },
  'expand-all': () => { ui.collapsed.clear(); render(); },
  'add-stage': el => { const pid = el.dataset.pid, n = prompt('Название этапа:'); if (!n || !n.trim()) return;
    const s = {id:uid(), parentId:pid, name:n.trim(), mode:'steps', unit:'', price:0, vol:'', components:[], tools:[], notes:[]}; S.stages.push(s); save(); selectStage(s.id); },
  'set-stage': el => { const s = byId(S.stages, el.dataset.id), f = el.dataset.f; s[f] = f === 'price' ? num(el.value) : el.value.trim(); commit(); },
  'set-mode': el => { byId(S.stages, el.dataset.id).mode = el.value; commit(); },
  'set-parent': el => { const s = byId(S.stages, el.dataset.id); s.parentId = el.value; S.stages.push(S.stages.splice(S.stages.indexOf(s), 1)[0]); if (el.value) ui.collapsed.delete(el.value); commit(); },
  'del-stage': el => { const s = byId(S.stages, el.dataset.id); if (!confirm(`Удалить «${s.name}» вместе с вложенными этапами?`)) return; ui.stageId = s.parentId || null; removeStage(s.id); commit(); },
  'mv-stage': el => { const s = byId(S.stages, el.dataset.id), sib = kids(s.parentId), i = sib.indexOf(s), j = i + +el.dataset.dir;
    if (j < 0 || j >= sib.length) return; const a = S.stages.indexOf(s), b = S.stages.indexOf(sib[j]); [S.stages[a], S.stages[b]] = [S.stages[b], S.stages[a]]; commit(); },
  'add-stool': el => { const t = val('addTool'); if (!t) return; const s = byId(S.stages, el.dataset.id); s.tools.push(t); commit(); },
  'new-stool': el => { const n = prompt('Название инструмента:'); if (!n || !n.trim()) return; const s = byId(S.stages, el.dataset.id), t = getTool(n.trim()); if (!s.tools.includes(t.id)) s.tools.push(t.id); commit(); },
  'del-stool': el => { const s = byId(S.stages, el.dataset.id); s.tools = s.tools.filter(t => t !== el.dataset.tool); commit(); },
  'add-note': el => { const t = val('nText'); if (!t) return; byId(S.stages, el.dataset.id).notes.push({id:uid(), cat:val('nCat'), text:t}); commit(); },
  'set-note': el => { byId(S.stages, el.dataset.id).notes[+el.dataset.i][el.dataset.f] = el.value.trim(); commit(); },
  'del-note': el => { byId(S.stages, el.dataset.id).notes.splice(+el.dataset.i, 1); commit(); },
  'add-comp': el => { const o = compOwner(el), v = val('cs_' + o.id); if (!v) return; const [refType, refId] = v.split(':'); o.components.push({refType, refId, rate: val('cr_' + o.id) || '1'}); commit(); },
  'set-comp': el => { compOwner(el).components[+el.dataset.i].rate = el.value.trim() || '0'; commit(); },
  'del-comp': el => { compOwner(el).components.splice(+el.dataset.i, 1); commit(); },

  'sel-obj': el => { ui.objId = el.dataset.id; Object.keys(curObj().sel).forEach(id => ui.pexp.add(id)); render(true); },
  'add-obj': () => { const n = prompt('Название объекта:'); if (!n || !n.trim()) return; const o = {id:uid(), name:n.trim(), note:'', values:{}, rooms:[], fin:Object.assign({}, S.finDefaults), sel:{}, pick:{}, extra:[]};
    S.objects.push(o); ui.objId = o.id; save(); render(true); },
  'del-obj': () => { if (confirm('Удалить объект целиком?')) { S.objects = S.objects.filter(o => o.id !== ui.objId); ui.objId = null; commit(); } },
  'set-obj': el => { curObj()[el.dataset.f] = el.value; commit(); },
  'set-value': el => { curObj().values[el.dataset.key] = el.value.trim(); commit(); },
  'add-param': newParam,
  'add-room': () => { const n = val('rName'); if (!n) return; curObj().rooms.push({id:uid(), name:n, l:num(val('rL')), w:num(val('rW')), h:num(val('rH')) || 2.7, open:num(val('rO'))}); commit(); },
  'set-room': el => { const r = byId(curObj().rooms, el.dataset.id), f = el.dataset.f; r[f] = f === 'name' ? el.value.trim() : num(el.value); commit(); },
  'del-room': el => { const o = curObj(), id = el.dataset.id; o.rooms = o.rooms.filter(r => r.id !== id);
    Object.values(o.sel).forEach(x => { if (x.rooms) { x.rooms = x.rooms.filter(i => i !== id); if (!x.rooms.length) delete x.rooms; } }); commit(); },
  'tgl-rp': el => { ui.rp = ui.rp === el.dataset.id ? '' : el.dataset.id; render(); },
  'toggle-room': el => { const o = curObj(), s = o.sel[el.dataset.id], all = o.rooms.map(r => r.id); let cur = (s.rooms && s.rooms.length ? s.rooms : all).slice();
    cur = el.checked ? [...new Set([...cur, el.dataset.room])] : cur.filter(i => i !== el.dataset.room);
    if (cur.length) { if (cur.length === all.length) delete s.rooms; else s.rooms = cur; } commit(); },
  'set-fin': el => { curObj().fin[el.dataset.key] = num(el.value); commit(); },
  'set-findef': el => { S.finDefaults[el.dataset.key] = num(el.value); commit(); },
  'cloud-on': () => { const t = val('ghToken'); if (t) cloudConnect(t); },
  'cloud-push': () => cloudPush().then(() => render()),
  'cloud-pull': async () => { if (!confirm('Заменить данные на странице данными из облака? Текущие сохранятся в снимок для отката.')) return;
    try { const c = syncCfg(); applyRemote(await gistRead(c.gistId)); c.lastSync = S.updated; setSyncCfg(c); showSync('☁ загружено ' + stamp()); } catch (e) { alert('Не удалось загрузить: ' + e.message); } },
  'cloud-off': () => { setSyncCfg({}); showSync(''); render(); },
  'sync-auto': el => { const c = syncCfg(); c.auto = el.checked; setSyncCfg(c); render(); },
  'restore-snap': el => { const arr = snaps(), x = arr[+el.dataset.i]; if (!x || !confirm('Вернуть данные на ' + new Date(x.t).toLocaleString('ru-RU') + '? Текущие сохранятся в снимок.')) return;
    snap(true); migrate(JSON.parse(x.d)); S.updated = Date.now(); ui.objId = null; ui.stageId = null; commit(); },
  'tgl-pick': el => { const id = el.dataset.id; ui.pexp.has(id) ? ui.pexp.delete(id) : ui.pexp.add(id); render(); },
  'pick-toggle': el => { const o = curObj(); el.checked ? includeNode(o, el.dataset.id) : excludeNode(o, el.dataset.id); commit(); },
  'pick-variant': el => { includeNode(curObj(), el.dataset.id); commit(); },
  'set-q': el => { const o = curObj(); o.sel[el.dataset.id] = o.sel[el.dataset.id] || {}; o.sel[el.dataset.id].q = el.value.trim(); commit(); },
  'tgl-custom': () => { ui.custom = !ui.custom; render(); },
  'add-extra': () => { const v = val('exSel'); if (!v) return; const [type, refId] = v.split(':'); curObj().extra.push({id:uid(), type, refId, qty:val('exQty') || '1'}); commit(); },
  'add-custom': () => { const n = val('cuName'); if (!n) return; curObj().extra.push({id:uid(), type:'custom', name:n, category:val('cuCat'), unit:val('cuUnit'), qty:val('cuQty') || '1', price:num(val('cuPrice'))}); commit(); },
  'set-extra': el => { curObj().extra[+el.dataset.i].qty = el.value.trim(); commit(); },
  'del-extra': el => { curObj().extra.splice(+el.dataset.i, 1); commit(); },
  'tgl-row': el => { const id = el.dataset.id; ui.rows.has(id) ? ui.rows.delete(id) : ui.rows.add(id); render(); },
  'export-xlsx': () => exportXlsx(curObj()),

  'add-mat': () => { const n = val('mName'); if (!n) return; S.materials.push({id:uid(), name:n, category:val('mCat'), unit:val('mUnit'), price:num(val('mPrice')), packQty:num(val('mQty')) || 1}); commit(); },
  'set-mat': el => { const m = byId(S.materials, el.dataset.id), f = el.dataset.f; m[f] = (f === 'price' || f === 'packQty') ? num(el.value) : el.value.trim(); commit(); },
  'del-mat': el => { if (confirm('Удалить материал?')) { S.materials = S.materials.filter(m => m.id !== el.dataset.id); commit(); } },
  'add-tool': () => { const n = val('tName'); if (!n) return; getTool(n); commit(); },
  'set-tool': el => { byId(S.tools, el.dataset.id)[el.dataset.f] = el.value.trim(); commit(); },
  'del-tool': el => { if (!confirm('Удалить инструмент?')) return; const id = el.dataset.id; S.tools = S.tools.filter(t => t.id !== id); S.stages.forEach(s => s.tools = s.tools.filter(t => t !== id)); commit(); },
  'add-composite': () => { const n = val('kName'); if (!n) return; S.composites.push({id:uid(), name:n, unit:val('kUnit') || 'м2', components:[]}); commit(); },
  'set-composite': el => { byId(S.composites, el.dataset.id)[el.dataset.f] = el.value.trim(); commit(); },
  'del-composite': el => { if (confirm('Удалить композит?')) { S.composites = S.composites.filter(c => c.id !== el.dataset.id); commit(); } },
  'add-pdef': newParam,
  'set-pdef': el => { const p = byId(S.params, el.dataset.id), f = el.dataset.f; p[f] = f === 'key' ? (cleanKey(el.value) || p.key) : f === 'def' ? num(el.value) : el.value.trim(); commit(); },
  'del-pdef': el => { if (confirm('Удалить параметр? Формулы с ним перестанут считаться.')) { S.params = S.params.filter(p => p.id !== el.dataset.id); commit(); } },

  'import-md': () => $('fileMd').click(),
  'export-json': () => download('stroysmeta-backup-' + new Date().toISOString().slice(0,10) + '.json', JSON.stringify(S, null, 1)),
  'import-json': () => $('fileImport').click(),
  reset: () => { if (confirm('Все данные будут заменены примером. Продолжить?')) { snap(true); S = seed(); ui.objId = null; ui.stageId = null; commit(); } }
};
const LIVE = {
  'tree-q': el => { ui.q = el.value; $('treebox').innerHTML = treeHtml('', 0, ui.q.toLowerCase()) || '<div class="empty">Ничего не найдено</div>'; },
  'pick-q': el => { ui.pq = el.value; $('pickbox').innerHTML = pickHtml(curObj(), '', 0, ui.pq.toLowerCase()) || '<div class="empty">Ничего не найдено</div>'; }
};
const isField = el => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || isField(el)) return; if (el.tagName === 'A') e.preventDefault(); if (H[el.dataset.act]) H[el.dataset.act](el, e); });
document.addEventListener('change', e => { const el = e.target; if (el.dataset && el.dataset.act && H[el.dataset.act] && isField(el)) H[el.dataset.act](el, e); });
document.addEventListener('input', e => { const el = e.target; if (el.dataset && el.dataset.live && LIVE[el.dataset.live]) LIVE[el.dataset.live](el); });
$('fileMd').addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) importMd(fs); });
$('fileImport').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result); if (!d.materials || !d.stages || !d.objects) throw new Error('не тот файл');
    snap(true); migrate(d); ui.objId = null; ui.stageId = null; commit(); } catch (err) { alert('Не удалось загрузить: ' + err.message); } e.target.value = ''; };
  r.readAsText(f); });
render();
cloudReconcile();
