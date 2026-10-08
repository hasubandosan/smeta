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
console.log('\nВсе проверки пройдены: ' + n);
