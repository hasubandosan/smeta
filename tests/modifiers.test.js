// Действия правил SET_VALUE / MODIFY_QUANTITY / MODIFY_COEFFICIENT и условия по геометрии: node tests/modifiers.test.js
const assert = require('assert'), SM = require('../js/core.js');
for (const f of ['geometry', 'model', 'seeds', 'rules', 'ver', 'estimate']) require('../js/' + f + '.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); }, near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' != ' + b);
const mk = rules => { const o = SM.seeds.bathroom(), lib = SM.seeds.library(), rid = o.geometry.rooms[0].id; lib.rules = (lib.rules || []).concat(rules);
  const S = {object: o, library: lib, fin: {}, bought: {}, materials: [{id: 'm1', name: 'Клей', unit: 'кг', packQty: 25, price: 10}, {id: 'm2', name: 'Грунт', unit: 'л', packQty: 5, price: 20}],
    techs: [{id: 't', name: 'Плитка', processId: 'tile_floor_lay', params: [{key: 'k', def: 1}], ops: [{id: 'o', name: 'Уложить', unit: 'м2', price: 100, qty: 'floor * k', mats: [{id: 'a', matId: 'm1', rate: '2'}, {id: 'b', matId: 'm2', rate: '1'}]}]}],
    plan: [{id: 'p', techId: 't', roomId: rid, processId: 'tile_floor_lay', values: {}}]}; return S; };
const FL = 15.75, tile = {goal: 'tile_floor'};

t('условие по геометрии: высота и площадь; неизвестное не срабатывает', () => { const S = mk([]), ctx = {obj: S.object, room: S.object.geometry.rooms[0], goals: []}, ev = c => SM.rules.evalCond({geo: c}, ctx);
  assert.strictEqual(ev({key: 'height', op: '>', value: 2.5}), 'T'); assert.strictEqual(ev({key: 'floor', op: '>', value: 20}), 'F'); assert.strictEqual(ev({key: 'floor', op: '<', value: 20}), 'T');
  ctx.room = Object.assign({}, ctx.room, {height: null}); assert.strictEqual(ev({key: 'height', op: '>', value: 2.5}), 'U'); });
t('MODIFY_QUANTITY: множитель, прибавка и объяснение «почему» в строке сметы', () => { const S = mk([{id: 'r1', if: {geo: {key: 'floor', op: '>', value: 10}}, then: [{do: 'MODIFY_QUANTITY', process: 'tile_floor_lay', mode: 'mul', value: 1.1, because: 'площадь больше 10 м²'}, {do: 'MODIFY_QUANTITY', process: 'tile_floor_lay', mode: 'add', value: 1, because: 'подрезка'}]}]);
  const R = SM.est.compute(S), r = R.rows[0]; near(r.q, FL * 1.1 + 1); near(r.work, (FL * 1.1 + 1) * 100); assert.strictEqual(r.applied.length, 2); assert.ok(r.applied[0].includes('площадь больше 10')); });
t('правило с ложным условием ничего не меняет', () => { const S = mk([{id: 'r1', if: {geo: {key: 'floor', op: '>', value: 100}}, then: [{do: 'MODIFY_QUANTITY', value: 5, because: 'x'}]}]); near(SM.est.compute(S).rows[0].q, FL); assert.deepStrictEqual(SM.est.compute(S).rows[0].applied, []); });
t('MODIFY_COEFFICIENT: только указанный материал; без matId — все', () => { const S = mk([{id: 'r', if: tile, then: [{do: 'MODIFY_COEFFICIENT', process: 'tile_floor_lay', matId: 'm1', value: 1.5, because: 'клей: сложное основание'}]}]);
  let R = SM.est.compute(S); near(R.rows[0].mats.find(m => m.matId === 'm1').need, FL * 2 * 1.5); near(R.rows[0].mats.find(m => m.matId === 'm2').need, FL);
  S.library.rules[S.library.rules.length - 1].then[0].matId = null; R = SM.est.compute(S); near(R.rows[0].mats.find(m => m.matId === 'm2').need, FL * 1.5); });
t('SET_VALUE: правило сильнее значения технологии, явный ввод пользователя сильнее правила', () => { const S = mk([{id: 'r', if: tile, then: [{do: 'SET_VALUE', key: 'k', value: 2, because: 'выбран тёплый пол — двойной слой'}]}]);
  near(SM.est.compute(S).rows[0].q, FL * 2); S.plan[0].values = {k: 3}; near(SM.est.compute(S).rows[0].q, FL * 3); });
t('неизвестное значение правила → объём/расход неизвестны, а не 0 и не игнор', () => { const S = mk([{id: 'r', if: tile, then: [{do: 'MODIFY_QUANTITY', value: null, because: 'коэффициент не задан'}]}]);
  let R = SM.est.compute(S), r = R.rows[0]; assert.strictEqual(r.q, null); assert.strictEqual(r.work, null); assert.ok(r.missing.some(x => x.includes('коэффициент не задан'))); assert.ok(R.incomplete);
  S.library.rules.pop(); S.library.rules.push({id: 'r2', if: tile, then: [{do: 'MODIFY_COEFFICIENT', matId: 'm1', value: null, because: 'расход не задан'}]}); r = SM.est.compute(S).rows[0];
  assert.strictEqual(r.mats.find(m => m.matId === 'm1').need, null); near(r.mats.find(m => m.matId === 'm2').need, FL); });
t('ошибки данных правил называются: SET_VALUE без key, действие без value', () => { const S = mk([{id: 'r', if: tile, then: [{do: 'SET_VALUE', value: 1}]}]); assert.throws(() => SM.rules.plan(S.object, S.library, S.object.geometry.rooms[0].id), /key/); const E = SM.est.compute(S); assert.ok(E.planErrors[0].includes('key')); assert.ok(E.incomplete);
  S.library.rules.pop(); S.library.rules.push({id: 'r', if: tile, then: [{do: 'MODIFY_QUANTITY'}]}); assert.throws(() => SM.rules.plan(S.object, S.library, S.object.geometry.rooms[0].id), /value/); });
console.log('Итого проверок: ' + n);
