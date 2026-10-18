// Перенос объектов из старого приложения без браузера: node tests/legacy.test.js
const assert = require('assert'), SM = require('../js/core.js');
for (const f of ['geometry', 'model', 'seeds', 'rules', 'ver', 'estimate', 'exec', 'storage', 'fact', 'legacy']) require('../js/' + f + '.js');
const L = SM.legacy; let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); };
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, (m || '') + ' ' + a + ' != ' + b);
const old = () => { const N = (id, parentId, name, o) => Object.assign({id, parentId, name, mode: 'steps', unit: '', price: 0, vol: '', components: [], tools: [], notes: []}, o || {});
  const c = (id, rate) => ({refType: 'material', refId: id, rate});
  const stages = [N('r2', '', '2. Работы'), N('r25', 'r2', '2.5. Черновая'), N('r256', 'r25', 'Стяжка пола', {mode: 'choice'}),
    N('semi', 'r256', 'Полусухая'), N('s1', 'semi', '1. Лента', {unit: 'м', price: 40, vol: 'perimeter', components: [c('tape', '1.05')]}),
    N('s2', 'semi', '2. Укладка', {unit: 'м2', price: 350, vol: 'floor', components: [c('sand', '19*thickness/10*1.1')]}),
    N('s3', 'semi', '3. Затирка', {unit: 'м2', price: 120, vol: 'floor'}), N('s4', 'semi', '4. Швы', {unit: 'м', price: 150, vol: ''}),
    N('wet', 'r256', 'Мокрая'), N('w1', 'wet', '1. Заливка', {unit: 'м2', price: 400, vol: 'floor', components: [c('sand', '19*thickness/10')]}),
    N('lev', 'r25', '2.5.7. Налив', {unit: 'м2', price: 250, vol: 'floor'}), N('inner', 'r25', 'Узел с единицей', {unit: 'шт', price: 5}), N('inn1', 'inner', 'Шаг', {unit: 'шт', price: 1, vol: '1'})];
  const sel = {}; ['r2', 'r25', 'r256', 'semi', 's1', 's2', 's3', 's4'].forEach(k => sel[k] = {}); sel.s4 = {q: '12'};
  return {materials: [{id: 'tape', name: 'Лента', unit: 'м', price: 400, packQty: 25, category: 'material'}, {id: 'sand', name: 'Пескобетон', unit: 'кг', price: 280, packQty: 40, category: 'material'}],
    composites: [], tools: [], params: ['floor', 'ceiling', 'walls', 'perimeter', 'thickness'].map(k => ({id: k, key: k, label: k, unit: '', def: k === 'thickness' ? 60 : 0})), stages,
    objects: [{id: 'ob1', name: 'Квартира', note: '', values: {thickness: 60}, rooms: [{id: 'a', name: 'Гостиная', l: 6, w: 5, h: 2.7, open: 4.5}, {id: 'b', name: 'Кухня', l: 4, w: 3, h: 2.7, open: 2}, {id: 'c', name: 'Прихожая', l: 4, w: 2, h: 2.7, open: 1.6}],
      fin: {reserve: 5, overhead: 10, discount: 0, vat: 0}, sel, pick: {r256: 'semi'}, extra: []}]}; };
const proj = () => SM.store.fresh(), work = (S, f) => SM.est.compute(S).rows.filter(f || (() => true)).reduce((a, r) => a + (r.work || 0), 0);
const mine = S => S.plan.filter(p => p.legacyObjectId === 'ob1');

t('помещения: площади, периметр и площадь стен совпадают со старым расчётом', () => { const S = proj(), o = old(); L.importObject(o, o.objects[0], S);
  const D = SM.model.derive(S.object).filter(d => S.object.geometry.rooms.find(r => r.id === d.roomId).legacyObjectId === 'ob1');
  assert.deepStrictEqual(D.map(d => Math.round(d.floor * 1e6) / 1e6), [30, 12, 8]); assert.deepStrictEqual(D.map(d => Math.round(d.perimeter)), [22, 14, 12]);
  [54.9, 35.8, 30.8].forEach((w, i) => near(D[i].wallArea, w, 'стены')); });
t('в план попал только выбранный вариант, по пункту на помещение; ненужные этапы не тронуты', () => { const S = proj(), o = old(), r = L.importObject(o, o.objects[0], S);
  assert.strictEqual(r.items, 3); assert.deepStrictEqual([...new Set(mine(S).map(p => S.techs.find(t => t.id === p.techId).legacyId))], ['semi']); assert.ok(mine(S).every(p => p.techVer === 1)); });
t('итог работ совпадает со старым: ручной объём швов считается один раз', () => { const S = proj(), o = old(); L.importObject(o, o.objects[0], S);
  near(work(S), 48 * 40 + 50 * 350 + 50 * 120 + 12 * 150); assert.strictEqual(SM.est.compute(S).rows.filter(r => r.op.name === '4. Швы' && r.q !== null).length, 1); });
t('расход материала совпадает со старым (19*толщина/10*1,1 на 50 м²)', () => { const S = proj(), o = old(); L.importObject(o, o.objects[0], S); near(SM.est.compute(S).buy.find(b => b.id === 'sand').base, 50 * 19 * 60 / 10 * 1.1); });
t('невыбранный шаг не попадает в смету', () => { const S = proj(), o = old(); delete o.objects[0].sel.s3; L.importObject(o, o.objects[0], S); near(work(S), 48 * 40 + 50 * 350 + 12 * 150); });
t('«выбранные помещения» у этапа: операция только там, где выбрана', () => { const S = proj(), o = old(); o.objects[0].sel.s3 = {rooms: ['a']}; L.importObject(o, o.objects[0], S);
  near(work(S), 48 * 40 + 50 * 350 + 30 * 120 + 12 * 150); });
t('повторный перенос ничего не дублирует', () => { const S = proj(), o = old(); L.importObject(o, o.objects[0], S); const a = JSON.stringify(S), r = L.importObject(o, o.objects[0], S);
  assert.deepStrictEqual([r.rooms, r.items, r.techs, r.materials], [0, 0, 0, 0]); assert.strictEqual(JSON.stringify(S), a); });
t('старые данные не изменяются при переносе', () => { const S = proj(), o = old(), before = JSON.stringify(o); L.importObject(o, o.objects[0], S); assert.strictEqual(JSON.stringify(o), before); });
t('объект без помещений: площади из значений объекта, помещение без стен, пометка', () => { const S = proj(), o = old(); Object.assign(o.objects[0], {rooms: [], values: {thickness: 60, floor: 42, perimeter: 26}});
  const r = L.importObject(o, o.objects[0], S); assert.strictEqual(r.items, 1); near(work(S), 26 * 40 + 42 * 350 + 42 * 120 + 12 * 150); assert.ok(r.notes.some(x => x.includes('нет помещений'))); });
t('доп. позиции: работа, материал со ссылкой, свой материал; формула объёма отмечена', () => { const S = proj(), o = old();
  o.objects[0].extra = [{type: 'custom', category: 'labor', name: 'Вынос мусора', unit: 'рейс', qty: '3', price: 500}, {type: 'material', refId: 'tape', qty: '2'}, {type: 'custom', category: 'material', name: 'Герметик', unit: 'шт', qty: '4', price: 300}, {type: 'custom', category: 'labor', name: 'По площади', unit: 'м2', qty: 'floor', price: 10}];
  const r = L.importObject(o, o.objects[0], S); const E = S.techs.find(x => x.legacyId === 'extra:ob1'); assert.strictEqual(E.ops.length, 4);
  near(SM.est.compute(S).rows.find(x => x.op.name === 'Вынос мусора').work, 1500); assert.ok(r.notes.some(x => x.includes('Герметик')) && r.notes.some(x => x.includes('формула')));
  assert.ok(SM.est.compute(S).buy.some(b => b.id === 'tape')); });
t('проценты переносятся только в пустой проект; иначе — в отчёт', () => { let S = proj(), o = old(); L.importObject(o, o.objects[0], S); assert.deepStrictEqual([S.fin.reserve, S.fin.overhead], [5, 10]);
  S = proj(); S.fin = {reserve: 1, overhead: 0, discount: 0, vat: 0}; const r = L.importObject(o, old().objects[0], S); assert.strictEqual(S.fin.reserve, 1); assert.ok(r.notes.some(x => x.includes('не перенесены'))); });
t('этап с вложенными шагами и своей единицей — в отчёте «не перенесено», а не молча', () => { const S = proj(), o = old(); o.objects[0].sel.inner = {}; o.objects[0].sel.inn1 = {};
  const r = L.importObject(o, o.objects[0], S); assert.ok(r.skipped.some(x => x.name === 'Узел с единицей')); });
t('после переноса проект сохраняется и загружается без потерь (версии, пропуски, ручной объём)', () => { const S = proj(), o = old(); L.importObject(o, o.objects[0], S); const R = SM.store.parse(SM.store.toJson(S));
  near(work(R), 48 * 40 + 50 * 350 + 50 * 120 + 12 * 150); assert.ok(R.plan.some(p => p.opQty) && R.plan.some(p => p.skipOps)); });
t('список объектов старого приложения для показа', () => { assert.deepStrictEqual(L.objects(old()), [{id: 'ob1', name: 'Квартира', rooms: 3, stages: 8, extras: 0}]); });
console.log('Итого проверок: ' + n);
