// Валидатор геометрии (контракт для CAD-модуля): node tests/geo.test.js
const assert = require('assert'), SM = require('../js/core.js');
for (const f of ['geometry', 'model', 'seeds', 'rules', 'ver', 'estimate', 'storage']) require('../js/' + f + '.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); };
const bath = () => SM.seeds.bathroom().geometry, codes = r => r.issues.map(x => x.code);
t('тестовая ванная валидна; проёмы без стены — только info', () => { const r = SM.geo.validate(bath()); assert.ok(r.ok); assert.deepStrictEqual([...new Set(codes(r))], ['opening_loose']); });
t('пустая геометрия валидна', () => assert.ok(SM.geo.validate({walls: [], openings: [], rooms: []}).ok && SM.geo.validate(null).ok));
t('битые ссылки и повтор id — ошибки', () => { const g = bath(); g.rooms[0].wallIds.push('нет'); g.openings[0].wallId = 'нет'; g.openings[1].roomId = 'нет'; g.walls.push({id: g.walls[0].id, len: 1}); const c = codes(SM.geo.validate(g)); assert.ok(!SM.geo.validate(g).ok);
  for (const x of ['not_closed', 'opening_wall', 'opening_room', 'dup_id']) assert.ok(c.includes(x), x); });
t('длина ≤ 0 и поворот не число — ошибки; неизвестная длина (null) — предупреждение, не ошибка', () => { const g = bath(); g.walls[0].len = 0; g.walls[1].turn = 'abc'; let c = codes(SM.geo.validate(g)); assert.ok(c.includes('bad_len') && c.includes('bad_turn'));
  const h = bath(); h.walls[2].len = null; const r = SM.geo.validate(h); assert.ok(r.ok); assert.ok(codes(r).includes('unknown_len')); });
t('контур не замкнут — ошибка с зазором; самопересечение — предупреждение', () => { const g = bath(); g.walls[0].len = 3.7; const r = SM.geo.validate(g); assert.ok(!r.ok && r.issues.some(x => x.code === 'not_closed' && /зазор/.test(x.text)));
  const b = {walls: [{id: 'a', len: 2, turn: 135}, {id: 'b', len: 2, turn: 135}, {id: 'c', len: 2, turn: 135}, {id: 'd', len: 2, turn: 135}, {id: 'e', len: 2, turn: 135}, {id: 'f', len: 2, turn: 135}, {id: 'g', len: 2, turn: 135}, {id: 'h', len: 2, turn: 135}], openings: [], rooms: [{id: 'r', name: 'звезда', wallIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']}]};
  assert.ok(codes(SM.geo.validate(b)).includes('self_intersect')); assert.ok(!codes(SM.geo.validate(bath())).includes('self_intersect')); });
t('проём за краем стены — предупреждение (позиция at необязательна)', () => { const g = bath(), w = g.walls[0]; g.openings[0].wallId = w.id; assert.ok(!codes(SM.geo.validate(g)).includes('opening_out')); g.openings[0].at = 3; assert.ok(codes(SM.geo.validate(g)).includes('opening_out')); g.openings[0].at = 1; assert.ok(!codes(SM.geo.validate(g)).includes('opening_out')); });
t('контракт CAD: необязательные поля геометрии (thickness, at, sill, swing, pos, shared, fixtures) переживают сохранение, загрузку и миграцию', () => { const P = SM.store.fresh(); P.object = SM.seeds.bathroom(); const g = P.object.geometry;
  g.walls[0].thickness = 0.25; g.walls[0].shared = 'другая'; Object.assign(g.openings[0], {at: 1, sill: 0, swing: 'in', wallId: g.walls[0].id}); g.rooms[0].pos = {x: 2, y: 3, rot: 90}; g.fixtures = [{id: 'f1', roomId: g.rooms[0].id, kind: 'toilet', x: 1, y: 1, rot: 0, w: 0.4, d: 0.7, h: null, поле: 'неизвестное'}];
  const Q = SM.store.parse(SM.store.toJson(P)).object.geometry; assert.deepStrictEqual(Q, g); assert.deepStrictEqual(SM.model.migrate(P.object).geometry, g); assert.ok(SM.geo.validate(Q).ok); });
console.log('Итого проверок: ' + n);
