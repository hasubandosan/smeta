// Эффекты процессов на геометрию: node tests/geoeffects.test.js
const assert = require('assert'), SM = require('../js/core.js');
for (const f of ['geometry', 'model', 'seeds', 'rules', 'ver', 'estimate', 'routes', 'libedit']) require('../js/' + f + '.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); }, near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' != ' + b);
const mk = (effects, surface) => { const o = SM.seeds.bathroom(), lib = SM.seeds.library(), rid = o.geometry.rooms[0].id, W = o.surfaces.filter(s => s.kind === 'wall');
  lib.processes.push({id: 'gp', name: 'Геопроцесс', surface: surface || 'wall', effects}); lib.goalNames.gg = 'гео'; lib.goals.gg = ['gp']; return {o, lib, rid, W}; };
const st = (o, lib, rid) => SM.rules.plan(o, lib, rid).items.find(x => x.id === 'gp');
const wall = (o, s) => o.geometry.walls.find(w => w.id === s.wallId), opens = (o, s) => o.geometry.openings.filter(x => x.wallId === s.wallId);

t('создать проём на выбранной стене: появляется на ней одной, размеры неизвестны (null), статус DONE', () => { const {o, lib, rid, W} = mk([{geo: 'CREATE_OPENING', kind: 'окно'}]); o.goals = [{id: 'g', target: W[1].id, result: 'gg', params: {}}];
  const before = o.geometry.openings.length; assert.strictEqual(st(o, lib, rid).status, 'READY'); SM.rules.complete(o, lib, rid, 'gp');
  assert.strictEqual(o.geometry.openings.length, before + 1); const op = opens(o, W[1]).find(x => x.kind === 'окно'); assert.ok(op && op.w === null && op.h === null); assert.strictEqual(opens(o, W[0]).filter(x => x.kind === 'окно').length, 0); assert.strictEqual(st(o, lib, rid).status, 'DONE'); });
t('закрыть проём: убирает проёмы нужного вида на выбранных стенах, площадь стен растёт', () => { const {o, lib, rid, W} = mk([{geo: 'DESTROY_OPENING', kind: 'дверь'}]); o.goals = [{id: 'g', target: W[0].id, result: 'gg', params: {}}];
  o.geometry.openings.forEach(x => { x.wallId = W[0].wallId; }); const a0 = SM.geo.deriveRoom(o.geometry, o.geometry.rooms[0]).wallArea, doors = o.geometry.openings.filter(x => x.kind === 'дверь' && x.w && x.h);
  SM.rules.complete(o, lib, rid, 'gp'); assert.ok(!o.geometry.openings.some(x => x.kind === 'дверь')); const a1 = SM.geo.deriveRoom(o.geometry, o.geometry.rooms[0]).wallArea; near(a1 - a0, doors.reduce((s, x) => s + x.w * x.h, 0)); });
t('поменять свойство стены и помещения; повторно — уже DONE', () => { const {o, lib, rid, W} = mk([{geo: 'SET_WALL', key: 'material', value: 'кирпич'}, {geo: 'SET_ROOM', key: 'height', value: 2.5}]); o.goals = [{id: 'g', target: W[3].id, result: 'gg', params: {}}];
  SM.rules.complete(o, lib, rid, 'gp'); assert.strictEqual(wall(o, W[3]).material, 'кирпич'); assert.notStrictEqual(wall(o, W[2]).material, 'кирпич'); assert.strictEqual(o.geometry.rooms[0].height, 2.5); assert.strictEqual(st(o, lib, rid).status, 'DONE'); });
t('геометрия меняется — зависимые величины пересчитываются (потолок ниже → площадь стен меньше)', () => { const {o, lib, rid} = mk([{geo: 'SET_ROOM', key: 'height', value: 2.0}], 'ceiling'); const g = o.geometry, r0 = g.rooms[0], a0 = SM.geo.deriveRoom(g, r0).wallArea;
  o.goals = []; o.goals.push({id: 'g', target: rid, result: 'gg', params: {}}); SM.rules.complete(o, lib, rid, 'gp'); assert.ok(SM.geo.deriveRoom(o.geometry, o.geometry.rooms[0]).wallArea < a0); });
t('атомарность: недопустимое действие не меняет объект и объясняет причину', () => { const {o, lib, rid} = mk([{geo: 'SET_WALL', key: 'len', value: -1}]); o.goals = [{id: 'g', target: rid, result: 'gg', params: {}}];
  const snap = JSON.stringify(o); assert.throws(() => SM.rules.complete(o, lib, rid, 'gp'), /некорректной/); assert.strictEqual(JSON.stringify(o), snap);
  const x = mk([{geo: 'SET_WALL', key: 'name', value: 'q'}]); x.o.goals = [{id: 'g', target: x.rid, result: 'gg', params: {}}]; assert.throws(() => SM.rules.complete(x.o, x.lib, x.rid, 'gp'), /менять нельзя/); });
t('маршрут симулирует геометрию на копии; ошибка шага не роняет, а помечает маршрут', () => { const {o, lib, rid} = mk([{geo: 'SET_WALL', key: 'len', value: -1}]); o.goals = [{id: 'g', target: rid, result: 'gg', params: {}}];
  const S = {object: o, library: lib, materials: [], fin: {}, bought: {}, techs: [], plan: [], routes: [{id: 'r', name: 'R', roomId: rid, steps: [{processId: 'gp'}], assume: []}]}, R = SM.routes.compare(S, S.routes[0]);
  assert.ok(R.errors.length === 1 && R.incomplete); assert.strictEqual(o.geometry.walls[0].len, 3.5); });
t('проверка библиотеки знает эффекты геометрии', () => { const {lib} = mk([{geo: 'SET_WALL', value: 1}, {geo: 'BOOM'}]), txt = SM.libedit.validate(lib).map(x => x.text).join('\n'); assert.ok(/не выбрано свойство/.test(txt) && /неизвестный эффект геометрии BOOM/.test(txt)); });
console.log('Итого проверок: ' + n);
