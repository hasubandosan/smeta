// Тесты ядра и геометрии без браузера и без зависимостей: node tests/core.test.js
const assert = require('assert'), SM = require('../js/core.js'); require('../js/geometry.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b);

t('формула: приоритет и функции', () => { near(SM.evalExpr('(2+3)*2', {}).value, 10); near(SM.evalExpr('ceil(395/25)', {}).value, 16); near(SM.evalExpr('19*thickness/10*1,1', {thickness: 60}).value, 125.4); });
t('UNKNOWN != 0: неизвестная переменная даёт «неизвестно», а не ноль', () => {
  const r = SM.evalExpr('floor*thickness', {floor: 42, thickness: null}); assert.deepStrictEqual([r.ok, r.unknown], [false, ['thickness']]);
  assert.strictEqual(SM.evalExpr('floor*0', {floor: 42}).value, 0); });
t('формула: ошибки не падают', () => { assert.ok(SM.evalExpr('2+', {}).error); assert.ok(SM.evalExpr('1/0', {}).error); assert.ok(SM.evalExpr('foo(1)', {}).error); });
t('объяснение формулы', () => assert.strictEqual(SM.explain('area*thickness*rate', {area: 42, thickness: 50, rate: 1.9}), '42 × 50 × 1,9 = 3990'));
t('упаковки: 395 кг / 25 = 16 мешков', () => { assert.strictEqual(SM.packs(395, 25), 16); assert.strictEqual(SM.packs(400, 25), 16); assert.strictEqual(SM.packs(5, 0), null); });

const rect = () => ({walls: [{id: 'a', len: 4}, {id: 'b', len: 3}, {id: 'c', len: 4}, {id: 'd', len: 3}],
  openings: [{id: 'o1', wallId: 'a', kind: 'дверь', w: 0.9, h: 2.1}], rooms: [{id: 'r', name: 'Комната', height: 2.7, wallIds: ['a', 'b', 'c', 'd']}]});
t('прямоугольник 4×3×2.7 с дверью', () => { const m = rect(), r = SM.geo.deriveRoom(m, m.rooms[0]);
  near(r.floor, 12); near(r.perimeter, 14); near(r.wallArea, 14 * 2.7 - 0.9 * 2.1); near(r.openingsArea, 1.89); assert.ok(r.closed); });
t('параметричность: длины 4→4.5 у обеих стен — всё пересчиталось', () => { const m = rect(); m.walls[0].len = m.walls[2].len = 4.5; const r = SM.geo.deriveRoom(m, m.rooms[0]); near(r.floor, 13.5); near(r.perimeter, 15); });
t('Г-образное помещение из 6 стен (не только 4)', () => {
  const m = {walls: [[4, 90], [2, 90], [2, -90], [2, 90], [2, 90], [4]].map((a, i) => ({id: 'w' + i, len: a[0], turn: a[1]})), openings: [], rooms: [{id: 'r', height: 2.5, wallIds: ['w0', 'w1', 'w2', 'w3', 'w4', 'w5']}]};
  const r = SM.geo.deriveRoom(m, m.rooms[0]); assert.ok(r.closed); near(r.floor, 12); near(r.perimeter, 16); near(r.wallArea, 16 * 2.5); });
t('незамкнутый контур: площадь неизвестна, причина названа', () => { const m = rect(); m.walls[0].len = 4.5; const r = SM.geo.deriveRoom(m, m.rooms[0]);
  assert.strictEqual(r.floor, null); assert.ok(r.issues[0].includes('не замкнут')); near(r.perimeter, 14.5); });
t('неизвестный проём не считается нулём', () => { const m = rect(); m.openings[0].h = null; const r = SM.geo.deriveRoom(m, m.rooms[0]);
  assert.strictEqual(r.wallArea, null); near(r.floor, 12); assert.ok(r.issues.some(s => s.includes('проёма'))); });

/* ---- Фаза 2: модель объекта и тестовая ванная ---- */
require('../js/model.js'); require('../js/seeds.js');
t('ванная из ТЗ: 6 стен при углах 90° замыкаются, пол 15.75 м²', () => { const o = SM.seeds.bathroom(), r = SM.model.derive(o)[0];
  assert.ok(r.closed && o.geometry.walls.length === 6); near(r.floor, 15.75); near(r.ceiling, 15.75); near(r.perimeter, 16); });
t('ванная: площадь стен = 16×2.7 − проёмы 3.80 (проёмы без привязки)', () => { const r = SM.model.derive(SM.seeds.bathroom())[0];
  near(r.openingsArea, 1.89 + 1.76 + 0.15); near(r.wallArea, 43.2 - 3.8); assert.ok(r.issues.some(s => s.includes('без привязки'))); });
t('ванная: изменение длины стены пересчитывает (4→4.5 у пары стен 5/6 ломает контур → неизвестно)', () => { const o = SM.seeds.bathroom(); o.geometry.walls[4].len = 4.5;
  const r = SM.model.derive(o)[0]; assert.strictEqual(r.floor, null); });
t('состояние по умолчанию UNKNOWN, не NO', () => { const o = SM.seeds.bathroom(), f = o.surfaces.find(s => s.kind === 'floor');
  assert.strictEqual(SM.model.getState(o, f.id, 'waterproofing'), 'UNKNOWN'); assert.strictEqual(SM.model.getState(o, f.id, 'existing_floor'), 'YES');
  assert.throws(() => SM.model.setState(o, f.id, 'x', 'maybe')); });
t('ванная: закуплено, неизвестное не выдумано', () => { const o = SM.seeds.bathroom(); const g = n => o.purchased.find(p => p.name.includes(n));
  assert.strictEqual(g('Ceresit').qty, 2); assert.strictEqual(g('Ceresit').packQty, null); assert.strictEqual(g('Перчатки').qty, null); });
t('миграция: сохраняет неизвестные поля, не принимает схему из будущего', () => { const m = SM.model.migrate({name: 'X', custom: 7, geometry: {walls: [{id: 'a', len: 1}]}});
  assert.strictEqual(m.custom, 7); assert.strictEqual(m.schemaVersion, SM.model.SCHEMA); assert.deepStrictEqual(m.goals, []); assert.throws(() => SM.model.migrate({schemaVersion: 99})); });
console.log('\nВсе проверки пройдены: ' + n);

/* ---- смета и закупка ---- */
require('../js/estimate.js');
t('смета: плитка на пол ванной, упаковки, купленное, неизвестное', () => {
  const o = SM.seeds.bathroom(), room = o.geometry.rooms[0];
  const S = {object: o, materials: [{id: 'g', name: 'Клей', unit: 'кг', packQty: 25, price: 700}, {id: 'x', name: 'Затирка', unit: 'кг', packQty: null, price: 300}],
    techs: [{id: 't', name: 'Плитка', params: [{key: 'k', def: 5}], ops: [{id: 'o1', name: 'Укладка', unit: 'м2', price: 1000, qty: 'floor', mats: [{id: 'a', matId: 'g', rate: '5*k/5'}, {id: 'b', matId: 'x', rate: '0.5'}]}, {id: 'o2', name: 'Неизв.', unit: 'м2', price: 10, qty: 'nope', mats: []}]}],
    plan: [{id: 'p', techId: 't', roomId: room.id, values: {}}], fin: {waste: 10, reserve: 0}, bought: {g: 25}};
  const R = SM.est.compute(S), g = R.buy.find(b => b.id === 'g'), x = R.buy.find(b => b.id === 'x');
  near(R.rows[0].q, 15.75); near(R.work, 15750); near(g.base, 78.75); near(g.total, 86.625); near(g.rest, 61.625); assert.strictEqual(g.packs, 3); near(g.cost, 2100);
  assert.strictEqual(x.packs, null); assert.strictEqual(x.cost, null); assert.deepStrictEqual(R.rows[1].missing, ['nope']); assert.ok(R.incomplete); });
t('короб: площадь покраски из размеров (0.6×0.4×2.7 → 5.4 м²)', () => { const o = SM.seeds.bathroom();
  const V = SM.est.vars({object: o}, {roomId: o.geometry.rooms[0].id}, {params: []}); near(V.box, 5.4); });
console.log('Итого проверок: ' + n);

/* ---- накладные/скидка/НДС и перенос из старого приложения ---- */
require('../js/legacy.js');
t('итог: подытог → накладные 10% → скидка 5% → НДС 20%', () => { const o = SM.seeds.bathroom();
  const S = {object: o, materials: [], techs: [{id: 't', name: 'Т', params: [], ops: [{id: 'o', name: 'О', unit: 'м2', price: 1000, qty: '10', mats: []}]}], plan: [{id: 'p', techId: 't', roomId: o.geometry.rooms[0].id}], fin: {overhead: 10, discount: 5, vat: 20}, bought: {}};
  const R = SM.est.compute(S); near(R.sub, 10000); near(R.overhead, 1000); near(R.discount, 550); near(R.vat, 2090); near(R.grand, 12540); });
t('перенос из старого приложения: ветвление → технологии, композит раскрыт, параметры, без дублей', () => {
  const old = {materials: [{id: 'm1', name: 'Песок', category: 'material', unit: 'кг', price: 280, packQty: 40}, {id: 'm2', name: 'Лента', category: 'material', unit: 'м', price: 400, packQty: 25}],
    composites: [{id: 'c1', name: 'Смесь', unit: 'кг', components: [{refType: 'material', refId: 'm1', rate: '2'}]}], params: [{key: 'floor', def: 0}, {key: 'thickness', def: 60}],
    stages: [{id: 'a', parentId: '', name: '2.5.6 Стяжка', mode: 'choice', unit: ''}, {id: 'b', parentId: 'a', name: 'Полусухая', mode: 'steps', unit: ''},
      {id: 's1', parentId: 'b', name: 'Укладка', unit: 'м2', price: 350, vol: 'floor', components: [{refType: 'composite', refId: 'c1', rate: '19*thickness/10'}]},
      {id: 's2', parentId: 'b', name: 'Лента', unit: 'м', price: 40, vol: 'perimeter', components: [{refType: 'material', refId: 'm2', rate: '1.05'}]},
      {id: 'w', parentId: 'a', name: 'Мокрая', mode: 'steps', unit: ''}, {id: 's3', parentId: 'w', name: 'Заливка', unit: 'м2', price: 400, vol: 'floor', components: []}]};
  const r = SM.legacy.convert(old, {techs: [], materials: []});
  assert.strictEqual(r.materials.length, 2); assert.deepStrictEqual(r.techs.map(x => x.name), ['2.5.6 Стяжка › Полусухая', '2.5.6 Стяжка › Мокрая']);
  const op = r.techs[0].ops[0]; assert.strictEqual(op.qty, 'floor'); assert.strictEqual(op.mats[0].matId, 'm1'); near(SM.evalExpr(op.mats[0].rate, {thickness: 60}).value, 2 * 19 * 6);
  assert.deepStrictEqual(r.techs[0].params, [{key: 'thickness', def: 60}]); assert.strictEqual(r.techs[0].ops.length, 2);
  assert.strictEqual(SM.legacy.convert(old, {techs: r.techs, materials: r.materials}).techs.length, 0); });
console.log('Итого проверок: ' + n);
