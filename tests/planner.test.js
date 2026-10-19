// Ядро CAD-планировщика (срез 1): node tests/planner.test.js
const assert = require('assert'), SM = require('../js/core.js');
for (const f of ['geometry', 'model', 'seeds', 'rules', 'ver', 'estimate', 'storage', 'planner']) require('../js/' + f + '.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); };
const P = SM.planner, bath = () => SM.seeds.bathroom().geometry, near = (a, b, e) => assert.ok(Math.abs(a - b) < (e || 1e-9), a + ' ≠ ' + b);
const rect = (w, h) => ({walls: [{id: 'a', len: w, turn: 90}, {id: 'b', len: h, turn: 90}, {id: 'c', len: w, turn: 90}, {id: 'd', len: h, turn: null}], openings: [], rooms: [{id: 'r', name: 'тест', height: 2.5, wallIds: ['a', 'b', 'c', 'd']}]});

t('версия и контракт', () => { assert.strictEqual(typeof P.VERSION, 'string'); assert.strictEqual(P.CONTRACT, 1); });
t('эталонная ванная: контур, площадь 15,75 м², периметр', () => {
  const d = P.fromGeometry(bath()), r = d.rooms[0], exp = [[0, 0], [3.5, 0], [3.5, 0.5], [4, 0.5], [4, 4], [0, 4]];
  assert.ok(r.closed); assert.strictEqual(r.vertices.length, 6);
  exp.forEach(([x, y], i) => { near(r.vertices[i].x, x, 1e-9); near(r.vertices[i].y, y, 1e-9); });
  near(r.area, 15.75); near(r.perimeter, 16); near(P.measure(bath())[0].floor, 15.75);
  const w0 = d.walls[0]; assert.strictEqual(w0.roomId, r.id); near(w0.b.x, 3.5); });
t('round-trip без потерь: id, неизвестные поля, null, необязательные поля контракта', () => {
  const g = bath(); g.walls[0].thickness = 0.25; g.walls[0].shared = 'другая'; g.walls[1].чужое = {k: [1, 2]}; g.rooms[0].pos = {x: 2, y: 3, rot: 90};
  Object.assign(g.openings[0], {wallId: g.walls[0].id, at: 1, sill: 0, swing: 'in'}); g.openings[1].чужое = 'да'; g.поверхности = {x: 1};
  g.fixtures = [{id: 'f1', roomId: g.rooms[0].id, kind: 'toilet', x: 1, y: 1, rot: 0, w: 0.4, d: 0.7, h: null, поле: 1}];
  const copy = JSON.parse(JSON.stringify(g)), out = P.toGeometry(P.fromGeometry(g), g);
  assert.deepStrictEqual(out, copy); assert.deepStrictEqual(g, copy, 'вход не изменён'); assert.strictEqual(out.walls[5].turn, null); assert.ok(SM.geo.validate(out).ok);
  assert.deepStrictEqual(P.toGeometry(P.fromGeometry(bath())).fixtures, undefined, 'fixtures не появляются из ничего'); });
t('пустая и неполная геометрия', () => { const o = P.toGeometry(P.fromGeometry(null), null); assert.deepStrictEqual(o, {walls: [], openings: [], rooms: []}); assert.ok(P.finish(P.fromGeometry({walls: [], openings: [], rooms: []})).ok); });
t('правка вершины: пересчёт len/turn, произвольные углы, площадь по Гауссу', () => {
  const g = rect(4, 3), d = P.fromGeometry(g), m = P.moveVertex(d, 'r', 2, {x: 5, y: 3.5}), out = P.toGeometry(m, g);
  assert.ok(SM.geo.validate(out).ok); near(out.walls[1].len, Math.hypot(1, 3.5)); near(out.walls[2].len, Math.hypot(5 - 0, 0.5)); assert.ok(Math.abs(out.walls[0].turn - 90) > 1, 'угол уже не 90°');
  const poly = SM.geo.polygon(out, out.rooms[0]); assert.ok(poly.ok); near(SM.geo.deriveRoom(out, out.rooms[0]).floor, m.rooms[0].area, 1e-6);
  const back = P.fromGeometry(out); near(back.rooms[0].area, m.rooms[0].area, 1e-6); assert.deepStrictEqual(out.walls.map(w => w.id), ['a', 'b', 'c', 'd']); });
t('правка не меняет исходный drawing; возврат вершины даёт исходные числа', () => {
  const g = rect(4, 3), d = P.fromGeometry(g), snap = JSON.stringify(d), m = P.moveVertex(d, 'r', 1, {x: 4.7, y: 0.2});
  assert.strictEqual(JSON.stringify(d), snap); const b = P.moveVertex(m, 'r', 1, {x: 4, y: 0}); assert.deepStrictEqual(P.toGeometry(b, g), g); });
t('угловая комната: вершина двигается, углы 135°/45° считаются и сохраняются', () => {
  const g = rect(4, 4), m = P.moveVertex(P.fromGeometry(g), 'r', 3, {x: -2, y: 4}), out = P.toGeometry(m, g), c = SM.geo.validate(out);
  assert.ok(c.ok, JSON.stringify(c.issues)); out.walls.forEach(w => assert.ok(w.len > 0)); const turns = out.walls.slice(0, 3).map(w => w.turn); assert.ok(turns.some(x => Math.abs(x - 90) > 1)); });
t('неизвестная длина = null: не нуль, правка вершин запрещена, round-trip без потерь', () => {
  const g = bath(); g.walls[2].len = null; const d = P.fromGeometry(g), r = d.rooms[0];
  assert.strictEqual(r.vertices, null); assert.strictEqual(r.closed, false); assert.ok(/длина/.test(r.issue)); assert.strictEqual(r.area, null); assert.strictEqual(r.perimeter, null);
  assert.throws(() => P.moveVertex(d, r.id, 0, {x: 1, y: 1}), /нельзя/); const out = P.toGeometry(d, g); assert.deepStrictEqual(out, g); assert.strictEqual(out.walls[2].len, null);
  const f = P.finish(d, g); assert.ok(f.ok && f.issues.some(x => x.code === 'unknown_len')); });
t('finish отдаёт геометрию только при ok; нулевая стена — отказ', () => {
  const g = rect(4, 3), d = P.fromGeometry(g), good = P.finish(P.moveVertex(d, 'r', 2, {x: 4.5, y: 3.2}), g); assert.ok(good.ok && good.geometry);
  const bad = P.finish(P.moveVertex(d, 'r', 1, {x: 0, y: 0}), g); assert.ok(!bad.ok); assert.strictEqual(bad.geometry, null); assert.ok(bad.issues.some(x => x.code === 'bad_len')); });
t('ошибки ввода по-русски: нет комнаты, нет вершины, не число', () => { const d = P.fromGeometry(rect(1, 1));
  assert.throws(() => P.moveVertex(d, 'нет', 0, {x: 0, y: 0}), /не найдено/); assert.throws(() => P.moveVertex(d, 'r', 9, {x: 0, y: 0}), /Нет вершины/); assert.throws(() => P.moveVertex(d, 'r', 0, {x: 'a', y: 0}), /числами/); });
t('проём: концы по at/w; без привязки — null; висячие данные сохраняются', () => {
  const g = bath(); Object.assign(g.openings[0], {wallId: g.walls[1].id, at: 0.1}); const d = P.fromGeometry(g), o = d.openings[0];   // стена 2: (3.5,0)→(3.5,0.5), проём 0.9 > стены — допустим, предупреждение даёт validate
  near(o.p1.x, 3.5); near(o.p1.y, 0.1); near(o.p2.y, 1.0); assert.strictEqual(d.openings[1].p1, null); assert.ok(SM.geo.validate(P.toGeometry(d, g)).issues.some(x => x.code === 'opening_out')); });
t('привязка: вершина важнее сетки; сетка не задана — точка как есть', () => {
  const d = P.fromGeometry(bath()); let s = P.snapPoint(d, {x: 3.46, y: 0.52}, {grid: 0.1, tol: 0.1}); assert.strictEqual(s.kind, 'vertex'); near(s.x, 3.5); near(s.y, 0.5); assert.strictEqual(s.index, 2);
  s = P.snapPoint(d, {x: 1.234, y: 2.31}, {grid: 0.1}); assert.strictEqual(s.kind, 'grid'); near(s.x, 1.2); near(s.y, 2.3);
  s = P.snapPoint(d, {x: 1.234, y: 2.31}, {grid: null}); assert.strictEqual(s.kind, null); near(s.x, 1.234); });
t('привязка учитывает room.pos (поворот и сдвиг)', () => { const g = rect(4, 3); g.rooms[0].pos = {x: 10, y: 0, rot: 90}; const d = P.fromGeometry(g);
  const w = P.toWorld(d.rooms[0], {x: 4, y: 0}); near(w.x, 10); near(w.y, 4); const s = P.snapPoint(d, {x: 10.02, y: 4.01}, {tol: 0.1}); assert.strictEqual(s.kind, 'vertex'); near(s.x, 10); });
t('undo/redo: без лимита глубины, повтор сбрасывается новой правкой', () => {
  const h = P.createHistory(rect(1, 1)); assert.ok(!h.canUndo() && !h.canRedo());
  for (let i = 2; i <= 300; i++) h.push(rect(i, 1), 'шаг ' + i); assert.strictEqual(h.current().walls[0].len, 300);
  for (let i = 0; i < 299; i++) assert.ok(h.undo()); assert.strictEqual(h.undo(), null); assert.strictEqual(h.current().walls[0].len, 1);
  h.redo(); assert.strictEqual(h.current().walls[0].len, 2); h.push(rect(9, 9), 'новое'); assert.ok(!h.canRedo()); assert.strictEqual(h.reason(), 'новое');
  const c = h.current(); c.walls[0].len = 777; assert.strictEqual(h.current().walls[0].len, 9, 'снимки изолированы'); });
t('несколько помещений и сироты: стена без комнаты и комната без стен не ломают загрузку', () => {
  const g = rect(4, 3); g.walls.push({id: 'x', len: 2}); g.rooms.push({id: 'e', name: 'пусто', wallIds: []}); const d = P.fromGeometry(g);
  assert.strictEqual(d.walls[4].roomId, null); assert.strictEqual(d.walls[4].a, null); assert.strictEqual(d.rooms[1].vertices, null); assert.deepStrictEqual(P.toGeometry(d, g), g); });
t('describe: подписи по-русски, неизвестное — «не задано», не 0', () => { const g = bath(), d = P.describe(g, g.walls[5].id); assert.strictEqual(d.kind, 'wall'); assert.ok(d.rows.some(r => r[0] === 'Поворот в конце' && /по умолчанию/.test(r[1])) && d.rows.some(r => r[0] === 'Толщина' && r[1] === 'не задано'));
  const r = P.describe(g, g.rooms[0].id); assert.ok(r.rows.some(x => x[0] === 'Площадь пола' && x[1] === '15,75 м²')); assert.strictEqual(P.describe(g, 'нет'), null); });
console.log('Итого проверок: ' + n);
