// Поверхности из геометрии и процессы на конкретные поверхности: node tests/surfaces.test.js
const assert = require('assert'), SM = require('../js/core.js');
for (const f of ['geometry', 'model', 'seeds', 'rules', 'ver', 'estimate']) require('../js/' + f + '.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); }, near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' != ' + b);
const mk = () => { const o = SM.seeds.bathroom(), lib = SM.seeds.library(), rid = o.geometry.rooms[0].id, W = o.surfaces.filter(s => s.kind === 'wall'); return {o, lib, rid, W}; };
const st = (P, id) => P.items.find(x => x.id === id);

t('поверхности из геометрии: идемпотентно, новая стена даёт поверхность, id и состояние старых сохраняются', () => { const {o, rid} = mk(), ids = o.surfaces.map(s => s.id), before = o.surfaces.length;
  const r0 = SM.model.syncSurfaces(o); assert.deepStrictEqual([r0.added, r0.removed, r0.orphaned], [[], [], []]); assert.strictEqual(o.surfaces.length, before);
  const w = {id: 'wNew', name: 'Стена 7', len: 1, turn: 0, material: ''}; o.geometry.walls.push(w); o.geometry.rooms[0].wallIds.push(w.id);
  const r1 = SM.model.syncSurfaces(o); assert.strictEqual(r1.added.length, 1); assert.ok(o.surfaces.find(s => s.wallId === 'wNew' && s.name === 'Стена 7')); assert.ok(ids.every(id => o.surfaces.some(s => s.id === id))); });
t('стену убрали: поверхность без данных удаляется, с данными — orphan и в расчёты не входит', () => { const {o, lib, rid, W} = mk(), g = o.geometry.rooms[0];
  SM.model.setState(o, W[0].id, 'existing_tile', 'YES'); g.wallIds = g.wallIds.filter(id => id !== W[0].wallId && id !== W[1].wallId);
  const r = SM.model.syncSurfaces(o); assert.deepStrictEqual(r.orphaned, [W[0].id]); assert.deepStrictEqual(r.removed, [W[1].id]);
  assert.strictEqual(o.surfaces.find(s => s.id === W[0].id).orphan, true); assert.strictEqual(SM.model.getState(o, W[0].id, 'existing_tile'), 'YES');
  const P = SM.rules.plan(o, lib, rid); assert.notStrictEqual(st(P, 'demolish_wall_tile').status, 'DONE'); /* orphan с YES не влияет: остальные стены UNKNOWN */ assert.strictEqual(st(P, 'demolish_wall_tile').status, 'NEEDS_INFO');
  g.wallIds.push(W[0].wallId); SM.model.syncSurfaces(o); assert.ok(!o.surfaces.find(s => s.id === W[0].id).orphan); });
t('миграция сама досоздаёт поверхности по геометрии', () => { const {o} = mk(); o.surfaces = o.surfaces.filter(s => s.kind === 'box'); const d = SM.model.migrate(o);
  assert.strictEqual(d.surfaces.filter(s => s.kind === 'wall').length, 6); assert.strictEqual(d.surfaces.filter(s => s.kind === 'floor').length, 1); });
t('цель на конкретную стену: процесс считается только по ней, остальные стены не мешают', () => { const {o, lib, rid, W} = mk(); o.goals = [{id: 'g', target: W[0].id, result: 'wall_tile', params: {}}];
  W.forEach(s => SM.model.setState(o, s.id, 'existing_tile', 'YES')); SM.model.setState(o, W[0].id, 'existing_tile', 'NO');
  let it = st(SM.rules.plan(o, lib, rid), 'demolish_wall_tile'); assert.deepStrictEqual(it.scope, [W[0].id]); assert.strictEqual(it.status, 'DONE');
  o.goals[0].target = rid; it = st(SM.rules.plan(o, lib, rid), 'demolish_wall_tile'); assert.strictEqual(it.scope, null); assert.strictEqual(it.status, 'READY'); });
t('плитка на стене 1 ждёт подготовку стены 1, а не всех; выполнение меняет только выбранные стены', () => { const {o, lib, rid, W} = mk(); o.goals = [{id: 'g', target: W[0].id, result: 'wall_tile', params: {}}];
  W.forEach(s => SM.model.setState(o, s.id, 'existing_tile', 'NO')); SM.model.setState(o, W[0].id, 'base_prepared', 'YES'); SM.model.setState(o, W[1].id, 'base_prepared', 'NO');
  assert.strictEqual(st(SM.rules.plan(o, lib, rid), 'tile_wall').status, 'READY'); SM.rules.complete(o, lib, rid, 'tile_wall');
  assert.strictEqual(SM.model.getState(o, W[0].id, 'tile'), 'YES'); assert.strictEqual(SM.model.getState(o, W[1].id, 'tile'), 'UNKNOWN'); });
t('две цели на разные стены объединяются в одну область', () => { const {o, lib, rid, W} = mk(); o.goals = [{id: 'a', target: W[0].id, result: 'wall_tile', params: {}}, {id: 'b', target: W[3].id, result: 'wall_tile', params: {}}];
  assert.deepStrictEqual(st(SM.rules.plan(o, lib, rid), 'tile_wall').scope.sort(), [W[0].id, W[3].id].sort()); });
t('смета: площадь выбранной стены из геометрии; проём без привязки → неизвестно, не 0 и не догадка', () => { const {o, lib, rid, W} = mk(); o.goals = [{id: 'g', target: W[0].id, result: 'wall_tile', params: {}}];
  const S = {object: o, library: lib, materials: [], fin: {}, bought: {}, techs: [{id: 't', name: 'Плитка', processId: 'tile_wall', params: [], ops: [{id: 'o', name: 'Уложить', unit: 'м2', price: 100, qty: 'walls', mats: []}]}],
    plan: [{id: 'p', techId: 't', roomId: rid, processId: 'tile_wall', values: {}}]};
  let R = SM.est.compute(S); assert.strictEqual(R.rows[0].q, null);
  o.geometry.openings.forEach(x => { x.wallId = W[4].wallId; }); R = SM.est.compute(S); near(R.rows[0].q, 3.5 * 2.7); near(R.work, 3.5 * 2.7 * 100);
  o.goals[0].target = rid; R = SM.est.compute(S); near(R.rows[0].q, SM.geo.deriveRoom(o.geometry, o.geometry.rooms[0]).wallArea); });
console.log('Итого проверок: ' + n);
