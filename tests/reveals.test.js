// Откосы проёмов (D43): площадь = полный периметр проёма × толщина стены: node tests/reveals.test.js
const assert = require('assert'), SM = require('../js/core.js');
for (const f of ['geometry', 'model', 'seeds', 'rules', 'libedit', 'estimate']) require('../js/' + f + '.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); }, near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' ≠ ' + b);
const room = () => { const g = {walls: [], openings: [], rooms: []}, ws = [['a', 4], ['b', 3], ['c', 4], ['d', 3]].map(([id, len]) => ({id, len, turn: 90, thickness: 0.2})); g.walls = ws;
  g.rooms.push({id: 'r', name: 'К', height: 2.7, wallIds: ws.map(w => w.id)}); return g; };
const D = g => SM.geo.deriveRoom(g, g.rooms[0]);

t('нет проёмов → откосов 0', () => assert.strictEqual(D(room()).reveals, 0));
t('дверь 0.9×2.1 в стене 0.2 м: (0.9+2.1)×2×0.2 = 1.2 м²; окно 1×1.2 в стене 0.3 м добавляет 2×2.2×0.3', () => { const g = room(); g.openings.push({id: 'o1', roomId: 'r', wallId: 'a', kind: 'дверь', w: 0.9, h: 2.1}); near(D(g).reveals, 1.2);
  g.walls[1].thickness = 0.3; g.openings.push({id: 'o2', roomId: 'r', wallId: 'b', kind: 'окно', w: 1, h: 1.2}); near(D(g).reveals, 1.2 + 2 * 2.2 * 0.3); });
t('толщина неизвестна → null, а не 0', () => { const g = room(); g.openings.push({id: 'o1', roomId: 'r', wallId: 'a', kind: 'дверь', w: 0.9, h: 2.1}); g.walls[0].thickness = null; assert.strictEqual(D(g).reveals, null); delete g.walls[0].thickness; assert.strictEqual(D(g).reveals, null); });
t('проём без привязки к стене или без размера → null', () => { const g = room(); g.openings.push({id: 'o1', roomId: 'r', wallId: null, kind: 'окно', w: 1, h: 1}); assert.strictEqual(D(g).reveals, null);
  const h = room(); h.openings.push({id: 'o1', roomId: 'r', wallId: 'a', kind: 'окно', w: null, h: 1}); assert.strictEqual(D(h).reveals, null); });
t('проём другого помещения не считается', () => { const g = room(); g.walls.push({id: 'x', len: 1, thickness: 0.4}); g.openings.push({id: 'o9', roomId: 'other', wallId: 'x', kind: 'окно', w: 1, h: 1}); assert.strictEqual(D(g).reveals, 0); });
t('условие «размер помещения» видит откосы; формулы получают переменную reveals', () => { const o = SM.seeds.bathroom(), r = o.geometry.rooms[0];
  const ctx = {obj: o, room: r, goals: []}; assert.strictEqual(SM.rules.evalCond({geo: {key: 'reveals', op: '>', value: 0}}, ctx, []), 'U', 'в ванной проёмы без стены и толщины → неизвестно');
  const S = {object: o, library: SM.seeds.library(), techs: [], materials: []}, V = SM.est.vars(S, {roomId: r.id}, {params: []}, null, []); assert.ok('reveals' in V); assert.strictEqual(V.reveals, null);
  o.geometry.openings.forEach(x => { x.wallId = r.wallIds[0]; }); o.geometry.walls.forEach(w => { w.thickness = 0.1; }); const d = SM.geo.deriveRoom(o.geometry, r); assert.ok(d.reveals > 0); near(d.reveals, o.geometry.openings.reduce((s, x) => s + 2 * (x.w + x.h) * 0.1, 0));
  assert.strictEqual(SM.rules.evalCond({geo: {key: 'reveals', op: '>', value: 0}}, {obj: o, room: r, goals: []}, []), 'T'); });
t('редактор: ключ откосов в списке размеров', () => assert.ok(SM.libedit.GEO_KEYS.some(k => k[0] === 'reveals')));
console.log('Итого проверок: ' + n);
