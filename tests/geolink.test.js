// Связка планировщика с проектом (без DOM): node tests/geolink.test.js
const assert = require('assert'), SM = require('../js/core.js');
for (const f of ['geometry', 'model', 'seeds', 'planner', 'rules', 'geolink']) require('../js/' + f + '.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); }, G = SM.geolink, M = SM.model, clone = x => JSON.parse(JSON.stringify(x));
const fresh = () => { const o = SM.seeds.bathroom(); M.syncSurfaces(o); return {S: {object: o, plan: [], routes: []}, o, r: o.geometry.rooms[0]}; };
const edit = (S, f) => { const g = clone(S.object.geometry); f(g); return g; };

t('те же данные — «не изменилось»; правка применяется и становится текущей геометрией', () => { const {S, o} = fresh(); assert.ok(G.same(S, clone(o.geometry)));
  const g = edit(S, g => { g.rooms[0].height = 3; g.walls[0].thickness = 0.2; }); assert.ok(!G.same(S, g)); const res = G.apply(S, g); assert.ok(res.ok, res.message);
  assert.ok(G.same(S, g)); assert.strictEqual(o.geometry.rooms[0].height, 3); assert.strictEqual(o.geometry.walls[0].thickness, 0.2); g.walls[0].thickness = 9; assert.strictEqual(o.geometry.walls[0].thickness, 0.2, 'копия, а не ссылка'); });
t('отказ: геометрия с ошибкой — проект не меняется', () => { const {S, o, r} = fresh(), snap = JSON.stringify(o);
  const res = G.apply(S, edit(S, g => { g.walls.find(w => w.id === r.wallIds[0]).len = -1; })); assert.ok(!res.ok && /проверку/.test(res.message)); assert.strictEqual(JSON.stringify(o), snap); });
t('новое помещение: появляются пол, потолок, инженерия и стены в поверхностях', () => { const {S, o} = fresh(), ns = o.surfaces.length;
  const res = G.apply(S, edit(S, g => { const ws = [1, 2, 3, 4].map(i => ({id: 'nw' + i, len: 2, turn: 90, name: 'Н' + i})); g.walls.push(...ws); g.rooms.push({id: 'nr', name: 'Новая', height: 2.5, wallIds: ws.map(w => w.id)}); }));
  assert.ok(res.ok && res.addedRooms.join() === 'nr'); assert.strictEqual(o.surfaces.length, ns + 7); assert.ok(o.surfaces.filter(s => s.roomId === 'nr').length === 7); });
t('убрать пустое помещение можно (поверхности уходят); с данными — отказ с причиной, проект цел', () => { const {S, o} = fresh();
  G.apply(S, edit(S, g => { const ws = [1, 2, 3, 4].map(i => ({id: 'nw' + i, len: 2, turn: 90})); g.walls.push(...ws); g.rooms.push({id: 'nr', name: 'Новая', height: 2.5, wallIds: ws.map(w => w.id)}); }));
  const drop = (S, id) => edit(S, g => { const r = g.rooms.find(x => x.id === id), ids = new Set(r.wallIds); g.rooms = g.rooms.filter(x => x.id !== id); g.walls = g.walls.filter(w => !ids.has(w.id)); g.openings = g.openings.filter(x => !ids.has(x.wallId) && x.roomId !== id); });
  let res = G.apply(S, drop(S, 'nr')); assert.ok(res.ok && res.removedRooms.join() === 'nr'); assert.ok(!o.surfaces.some(s => s.roomId === 'nr'));
  const r0 = o.geometry.rooms[0], snap = JSON.stringify(S); res = G.apply(S, drop(S, r0.id)); assert.ok(!res.ok && /нельзя убрать/.test(res.message) && /целей|наблюдений/.test(res.message)); assert.strictEqual(JSON.stringify(S), snap); });
t('roomUse считает план, маршруты, цели, состояние, наблюдения, короба', () => { const {S, r} = fresh(); const u0 = G.roomUse(S, r.id); assert.ok(u0.some(x => /целей/.test(x)) && u0.some(x => /наблюдений/.test(x)));
  S.plan.push({id: 'p', roomId: r.id}); S.routes.push({id: 'q', roomId: r.id}); assert.ok(G.roomUse(S, r.id).some(x => /работ в плане: 1/.test(x)) && G.roomUse(S, r.id).some(x => /маршрутов: 1/.test(x)));
  const e = fresh(); e.o.goals = []; e.o.observations = []; e.o.state = {}; e.o.surfaces = e.o.surfaces.filter(s => s.kind !== 'box'); assert.deepStrictEqual(G.roomUse(e.S, e.r.id), []); e.o.surfaces.push({id: 'bx', roomId: e.r.id, kind: 'box', name: 'Короб', w: 1, l: 1, h: 1}); assert.ok(G.roomUse(e.S, e.r.id).some(x => /коробов/.test(x))); });
t('убранная стена с данными: поверхность помечается orphan, данные целы', () => { const {S, o, r} = fresh(), wid = r.wallIds[0], sf = o.surfaces.find(s => s.wallId === wid); M.setState(o, sf.id, 'x', 'YES');
  const res = G.apply(S, edit(S, g => { g.rooms.find(x => x.id === r.id).wallIds = r.wallIds.filter(i => i !== wid); const w = g.walls.find(x => x.id === wid); w.len = w.len; g.walls = g.walls.filter(x => x.id !== wid); g.openings = g.openings.filter(x => x.wallId !== wid); }));
  if (res.ok) { assert.ok(sf.orphan); assert.strictEqual(M.getState(o, sf.id, 'x'), 'YES'); } else assert.ok(/проверку|ошибки/.test(res.message), res.message); });
t('геометрия с ошибкой (даже уже имевшейся) не принимается: контракт — только ok===true', () => { const {S, o, r} = fresh(); o.geometry.walls.find(w => w.id === r.wallIds[0]).len = -1;
  assert.ok(!SM.geo.validate(o.geometry).ok); const res = G.apply(S, clone(o.geometry)); assert.ok(!res.ok); });
console.log('Итого проверок: ' + n);
