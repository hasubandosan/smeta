// Операции правки CAD-планировщика (срез 3): node tests/planner-edit.test.js
const assert = require('assert'), SM = require('../js/core.js');
for (const f of ['geometry', 'model', 'seeds', 'rules', 'ver', 'estimate', 'storage', 'planner']) require('../js/' + f + '.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); };
const P = SM.planner, O = P.ops, near = (a, b, e) => assert.ok(Math.abs(a - b) < (e || 1e-6), a + ' ≠ ' + b), J = x => JSON.stringify(x);
const rect = (w, h) => ({walls: [{id: 'a', len: w, turn: 90}, {id: 'b', len: h, turn: 90}, {id: 'c', len: w, turn: 90}, {id: 'd', len: h, turn: null}], openings: [], rooms: [{id: 'r', name: 'тест', height: 2.5, wallIds: ['a', 'b', 'c', 'd']}]});
const out = (d, base) => { const g = P.toGeometry(d, base), v = SM.geo.validate(g); assert.ok(v.ok, J(v.issues)); return g; };
const world = (g, ri) => { const d = P.fromGeometry(g), r = d.rooms[ri]; return r.vertices.map(p => P.toWorld(r, p)); };
const area = (g, id) => P.measure(g).find(r => r.id === id).floor, lens = g => g.walls.map(w => w.len), turns = g => g.walls.map(w => w.turn);
const pure = (g, f) => { const d = P.fromGeometry(g), s = J(d); const r = f(d); assert.strictEqual(J(d), s, 'вход не изменён'); return r; };

t('длина стены числом: прямоугольник остаётся прямоугольником (с обеих сторон)', () => { const g = rect(4, 3);
  let o = out(pure(g, d => O.setWallLength(d, 'a', 5)), g); assert.deepStrictEqual([lens(o), turns(o)], [[5, 3, 5, 3], [90, 90, 90, null]]); near(area(o, 'r'), 15);
  o = out(O.setWallLength(P.fromGeometry(g), 'a', 5, {anchor: 'end'}), g); assert.deepStrictEqual(lens(o), [5, 3, 5, 3]);
  o = out(O.setWallLength(P.fromGeometry(g), 'b', 2), g); assert.deepStrictEqual(lens(o), [4, 2, 4, 2]);
  o = out(O.setWallLength(P.fromGeometry(g), 'a', 5, {mode: 'end'}), g); near(o.walls[1].len, Math.hypot(1, 3)); assert.ok(Math.abs(o.walls[1].turn - 90) > 1); });
t('длина стены в Г-образной (ванная): площадь пересчитана', () => { const g = SM.seeds.bathroom().geometry, o = out(O.setWallLength(P.fromGeometry(g), g.walls[0].id, 3.8), g); near(area(o, g.rooms[0].id), 15.9); });
t('длина: ошибки по-русски', () => { const d = P.fromGeometry(rect(4, 3));
  for (const bad of [0, -1, 'abc', null, NaN]) assert.throws(() => O.setWallLength(d, 'a', bad), /положительным/); assert.throws(() => O.setWallLength(d, 'нет', 1), /не найдена/);
  const g = rect(4, 3); g.walls[1].len = null; assert.throws(() => O.setWallLength(P.fromGeometry(g), 'a', 5), /править нельзя/); });
t('угол числом: внутренний угол 80°, длина следующей стены сохраняется; прямой и 270° у вершин эталона', () => {
  const g = rect(4, 3), o = out(pure(g, d => O.setVertexAngle(d, 'r', 1, 80)), g), d2 = P.fromGeometry(o); near(P.vertexAngle(d2, 'r', 1), 80); near(o.walls[1].len, 3);
  const b = P.fromGeometry(SM.seeds.bathroom().geometry), id = b.rooms[0].id; near(P.vertexAngle(b, id, 1), 90); near(P.vertexAngle(b, id, 2), 270);
  const o2 = out(O.setVertexAngle(b, id, 2, 240), SM.seeds.bathroom().geometry); near(P.vertexAngle(P.fromGeometry(o2), id, 2), 240);
  for (const bad of [0, 360, -5, 'x', null]) assert.throws(() => O.setVertexAngle(b, id, 1, bad), /Угол/); assert.throws(() => O.setVertexAngle(b, id, 99, 90), /Нет вершины/); });
t('разделение стены: id первой части сохранён, вторая новая, форма и площадь те же, проёмы переезжают', () => {
  const g = rect(4, 3); g.openings = [{id: 'o1', wallId: 'a', kind: 'дверь', at: 0.2, w: 0.8}, {id: 'o2', wallId: 'a', kind: 'окно', at: 2, w: 0.8}, {id: 'o3', wallId: null, kind: 'дверь', w: 0.9}];
  const d = pure(g, d => O.splitWall(d, 'a', 1.5)), o = out(d, g), nid = d.created.wallId;
  assert.deepStrictEqual(o.rooms[0].wallIds, ['a', nid, 'b', 'c', 'd']); assert.deepStrictEqual([o.walls[0].len, o.walls[1].len], [1.5, 2.5]); assert.deepStrictEqual([o.walls[0].turn, o.walls[1].turn], [0, 90]);
  near(area(o, 'r'), 12); const op = id => o.openings.find(x => x.id === id); assert.strictEqual(op('o1').wallId, 'a'); assert.strictEqual(op('o2').wallId, nid); near(op('o2').at, 0.5); assert.strictEqual(op('o3').wallId, null);
  const g2 = rect(4, 3); g2.openings = [{id: 'x', wallId: 'a', kind: 'дверь', at: 1, w: 1}]; assert.throws(() => O.splitWall(P.fromGeometry(g2), 'a', 1.5), /на месте разреза/);
  for (const bad of [0, 4, 5, 'q']) assert.throws(() => O.splitWall(P.fromGeometry(g), 'a', bad), /внутри стены/); const mid = O.splitWall(P.fromGeometry(g), 'd'); near(out(mid, g).walls.find(w => w.id === 'd').len, 1.5); });
t('разделить и убрать угол = исходная геометрия (побитово)', () => { const g = rect(4, 3), d = O.splitWall(P.fromGeometry(g), 'a', 1.5), back = O.removeVertex(d, 'r', 1); assert.deepStrictEqual(P.toGeometry(back, g), g);
  const g1 = rect(4, 3); g1.openings = [{id: 'o', wallId: 'a', kind: 'окно', at: 0.2, w: 0.5}]; const d1 = O.splitWall(P.fromGeometry(g1), 'a', 1.5), nid = d1.created.wallId, d2 = O.removeVertex(d1, 'r', 1);
  assert.strictEqual(d2.notes.length, 0); const tri = O.addRoomFromPoints(P.fromGeometry(null), [{x: 0, y: 0}, {x: 3, y: 0}, {x: 0, y: 4}]); assert.throws(() => O.removeVertex(tri, tri.created.roomId, 0), /не меньше трёх/);
  const g3 = rect(4, 3); g3.openings = [{id: 'o', wallId: 'b', kind: 'окно', at: 0.2, w: 0.5}]; const d3 = O.removeVertex(P.fromGeometry(g3), 'r', 1); assert.ok(d3.notes.some(x => /без стены/.test(x))); assert.strictEqual(P.toGeometry(d3, g3).openings[0].wallId, null); });
t('новая комната: прямоугольник — len/turn, height = null, имя по умолчанию, ids уникальны, положение pos', () => {
  let d = O.addRoomRect(P.fromGeometry(null), {w: 3, h: 2}), o = out(d); assert.deepStrictEqual([lens(o), turns(o)], [[3, 2, 3, 2], [90, 90, 90, null]]); assert.strictEqual(o.rooms[0].height, null); assert.strictEqual(o.rooms[0].name, 'Помещение 1'); near(area(o, o.rooms[0].id), 6);
  d = O.addRoomRect(d, {w: 2, h: 2, name: 'Кладовка', pos: {x: 4, y: 1, rot: 0}, height: 2.4}); o = out(d); assert.strictEqual(o.rooms.length, 2); assert.strictEqual(new Set(o.walls.map(w => w.id)).size, 8); assert.strictEqual(o.rooms[1].height, 2.4);
  const w2 = world(o, 1); near(w2[0].x, 4); near(w2[0].y, 1); near(w2[2].x, 6); near(w2[2].y, 3);
  for (const bad of [{w: 0, h: 1}, {w: 1, h: -1}, {w: 'a', h: 1}, {h: 1}]) assert.throws(() => O.addRoomRect(P.fromGeometry(null), bad), /положительным/); });
t('Г-образная комната: площадь w·h − вырез, 6 стен; ошибки выреза', () => { const o = out(O.addRoomL(P.fromGeometry(null), {w: 5, h: 4, cutW: 2, cutH: 1.5})); assert.strictEqual(o.walls.length, 6); near(area(o, o.rooms[0].id), 17); near(P.vertexAngle(P.fromGeometry(o), o.rooms[0].id, 3), 270);
  assert.throws(() => O.addRoomL(P.fromGeometry(null), {w: 5, h: 4, cutW: 5, cutH: 1}), /меньше комнаты/); assert.throws(() => O.addRoomL(P.fromGeometry(null), {w: 5, h: 4, cutW: 1}), /выреза/);
  assert.throws(() => O.addRoomFromPoints(P.fromGeometry(null), [{x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0}]), /нулевая/); assert.throws(() => O.addRoomFromPoints(P.fromGeometry(null), [{x: 0, y: 0}]), /не меньше трёх/); });
t('правка вершины 0: комната остаётся на месте (разворот уходит в room.pos), предметы тоже', () => {
  const g = rect(4, 3); g.fixtures = [{id: 'f', roomId: 'r', kind: 'предмет', x: 1, y: 1, rot: 0, w: 0.5, d: 0.5}];
  const f0 = P.toWorld(P.fromGeometry(g).rooms[0], {x: 1, y: 1}), o = out(P.moveVertex(P.fromGeometry(g), 'r', 0, {x: -1, y: -0.5}), g), w = world(o, 0), d2 = P.fromGeometry(o);
  [[-1, -0.5], [4, 0], [4, 3], [0, 3]].forEach(([x, y], i) => { near(w[i].x, x); near(w[i].y, y); }); assert.ok(o.rooms[0].pos); const f1 = P.toWorld(d2.rooms[0], {x: o.fixtures[0].x, y: o.fixtures[0].y}); near(f1.x, f0.x); near(f1.y, f0.y);
  near(o.walls[0].len, Math.hypot(5, 0.5)); });
t('свойства: толщина/высота — число или пусто (null), не 0; имя и материал', () => { const g = rect(4, 3), d = P.fromGeometry(g);
  let o = out(O.setWallProps(d, 'a', {thickness: '0.2', name: 'Фасад', material: 'кирпич'}), g); assert.deepStrictEqual([o.walls[0].thickness, o.walls[0].name, o.walls[0].material], [0.2, 'Фасад', 'кирпич']);
  o = out(O.setWallProps(O.setWallProps(d, 'a', {thickness: 0.2}), 'a', {thickness: '', name: ''}), g); assert.strictEqual(o.walls[0].thickness, null); assert.ok(!('name' in o.walls[0]));
  for (const bad of [0, -1, 'x']) assert.throws(() => O.setWallProps(d, 'a', {thickness: bad}), /положительным/); assert.throws(() => O.setWallProps(d, 'a', {len: 5}), /не правится/);
  o = out(O.setRoomProps(d, 'r', {name: 'Зал', height: ''}), g); assert.strictEqual(o.rooms[0].height, null); assert.strictEqual(o.rooms[0].name, 'Зал'); assert.throws(() => O.setRoomProps(d, 'r', {height: 0}), /положительным/); });
t('перегородка: комната режется на две, общая стена = пара shared, предметы по своим комнатам', () => {
  const g = rect(4, 3); g.fixtures = [{id: 'fl', roomId: 'r', kind: 'предмет', x: 1, y: 1}, {id: 'fr', roomId: 'r', kind: 'предмет', x: 3, y: 1}];
  const d = pure(g, d => O.splitRoom(d, 'r', {x: 2, y: 0}, {x: 2, y: 3}, {names: ['Левая', 'Правая'], thickness: 0.1})), o = out(d, g), rid = d.created.roomId;
  assert.strictEqual(o.rooms.length, 2); assert.strictEqual(o.walls.length, 8); o.rooms.forEach(r => { near(area(o, r.id), 6); assert.strictEqual(r.wallIds.length, 4); });
  const [c1, c2] = d.created.wallIds.map(id => o.walls.find(w => w.id === id)); assert.strictEqual(c1.shared, c2.id); assert.strictEqual(c2.shared, c1.id); assert.strictEqual(c1.thickness, 0.1); near(c1.len, 3); near(c2.len, 3);
  assert.ok(o.rooms.some(r => r.id === 'r') && o.rooms.some(r => r.id === rid)); const fr = o.fixtures.find(f => f.id === 'fr'), fl = o.fixtures.find(f => f.id === 'fl'); assert.notStrictEqual(fr.roomId, fl.roomId);
  const dd = P.fromGeometry(o); for (const f of o.fixtures) { const r = dd.rooms.find(x => x.id === f.roomId), q = P.toWorld(r, f); assert.ok(q.x > 0 && q.x < 4); assert.ok((f.id === 'fl') === (q.x < 2), f.id + ' в своей половине'); } });
t('перегородка: ошибки (вдоль стены, совпадение точек, вне контура, вне помещения)', () => { const d = P.fromGeometry(rect(4, 3));
  assert.throws(() => O.splitRoom(d, 'r', {x: 1, y: 0}, {x: 3, y: 0}), /совпадает с существующей стеной/); assert.throws(() => O.splitRoom(d, 'r', {x: 2, y: 0}, {x: 2, y: 0}), /совпадают/);
  assert.throws(() => O.splitRoom(d, 'r', {x: 2, y: 1}, {x: 2, y: 3}), /лежать на стене/); const L = O.addRoomL(P.fromGeometry(null), {w: 5, h: 4, cutW: 2, cutH: 1.5}), id = L.created.roomId;
  assert.throws(() => O.splitRoom(L, id, {x: 5, y: 2.5}, {x: 3, y: 4}), /вне помещения/); const ok = O.splitRoom(L, id, {x: 3, y: 2.5}, {x: 0, y: 2.5}); assert.strictEqual(ok.rooms.length, 2); out(ok); });
t('общая стена при разделении: связь снимается у обеих, есть предупреждение', () => { const g = rect(4, 3), d = O.splitRoom(P.fromGeometry(g), 'r', {x: 2, y: 0}, {x: 2, y: 3}), [c1, c2] = d.created.wallIds;
  const d2 = O.splitWall(d, c1, 1); assert.ok(d2.notes.some(x => /Связь/.test(x))); const o = out(d2, g); assert.ok(!('shared' in o.walls.find(w => w.id === c1)) && !('shared' in o.walls.find(w => w.id === c2))); });
t('удаление помещения: стены уходят, проёмы без привязки, предметы удаляются с предупреждением', () => { let g = rect(4, 3); g.openings = [{id: 'o', wallId: 'a', kind: 'дверь', at: 1, w: 0.9}]; g.fixtures = [{id: 'f', roomId: 'r', x: 1, y: 1}];
  const d = O.removeRoom(P.fromGeometry(g), 'r'), o = out(d); assert.deepStrictEqual([o.walls.length, o.rooms.length, (o.fixtures || []).length], [0, 0, 0]); assert.strictEqual(o.openings[0].wallId, null); assert.ok(!('at' in o.openings[0])); assert.strictEqual(d.notes.length, 2); assert.throws(() => O.removeRoom(d, 'r'), /не найдено/); });
t('ближайшая точка контура и привязка к вершине; toLocal обратна toWorld', () => { const d = P.fromGeometry(rect(4, 3)), q = P.nearestOnContour(d, 'r', {x: 2, y: -0.5}, 0.1); assert.strictEqual(q.wallId, 'a'); near(q.at, 2); near(q.dist, 0.5); assert.strictEqual(q.vertex, null);
  const v = P.nearestOnContour(d, 'r', {x: 3.95, y: 0.05}, 0.1); assert.strictEqual(v.vertex, 1); near(v.x, 4); const g = rect(4, 3); g.rooms[0].pos = {x: 3, y: -2, rot: 37}; const r = P.fromGeometry(g).rooms[0], p = {x: 1.3, y: 0.7}, w = P.toWorld(r, p), b = P.toLocal(r, w); near(b.x, p.x); near(b.y, p.y); });
t('все операции чистые: вход не меняется, id существующих сохраняются', () => { const g = rect(4, 3); g.rooms[0].pos = {x: 1, y: 2, rot: 15}; const ids = g.walls.map(w => w.id);
  for (const f of [d => O.setWallLength(d, 'b', 2.5), d => O.setVertexAngle(d, 'r', 2, 100), d => O.splitWall(d, 'c'), d => O.removeVertex(d, 'r', 3), d => O.setWallProps(d, 'a', {height: 2.5}), d => O.splitRoom(d, 'r', {x: 2, y: 0}, {x: 2, y: 3})]) {
    const o = out(pure(g, f), g); ids.forEach(id => assert.ok(o.walls.some(w => w.id === id) || /removeVertex/.test(f.toString()), 'id ' + id)); }
  const o = out(O.removeVertex(P.fromGeometry(g), 'r', 3), g); assert.ok(o.walls.some(w => w.id === 'd') === false && o.walls.some(w => w.id === 'c')); });
console.log('Итого проверок: ' + n);
