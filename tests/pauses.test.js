// Паузы между процессами: node tests/pauses.test.js
const assert = require('assert'), SM = require('../js/core.js');
for (const f of ['geometry', 'model', 'seeds', 'rules', 'ver', 'estimate', 'pauses', 'routes', 'exec', 'storage']) require('../js/' + f + '.js');
const P = SM.pauses; let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); };
const S = () => ({library: {processes: [{id: 'a', name: 'Стяжка'}, {id: 'b', name: 'Гидроизоляция'}, {id: 'c', name: 'Плитка'}]}, pauses: []});
const st = (...ids) => ids.map(processId => ({processId}));
const pz = (afterId, beforeId, minDays, maxDays) => ({id: afterId + beforeId, afterId, beforeId, minDays, maxDays});

t('без пауз: время 0, шаги в порядке', () => { const r = P.schedule(S(), st('a', 'c')); assert.strictEqual(r.minDays, 0); assert.strictEqual(r.maxDays, 0); assert.deepStrictEqual(r.warnings, []); });
t('цепочка: паузы складываются, max только если задан везде', () => { const s = S(); s.pauses = [pz('a', 'b', 3, 5), pz('b', 'c', 7, null)]; let r = P.schedule(s, st('a', 'b', 'c'));
  assert.strictEqual(r.minDays, 10); assert.strictEqual(r.maxDays, null); s.pauses[1].maxDays = 10; r = P.schedule(s, st('a', 'b', 'c')); assert.strictEqual(r.maxDays, 15); assert.strictEqual(r.steps[1].earliest, 3); });
t('несколько предшественников — берётся самый поздний', () => { const s = S(); s.pauses = [pz('a', 'c', 7, 10), pz('b', 'c', 1, 2)]; const r = P.schedule(s, st('a', 'b', 'c')); assert.strictEqual(r.minDays, 7); });
t('неизвестное остаётся неизвестным: пустое число ≠ 0, указывается пара процессов', () => { const s = S(); s.pauses = [pz('a', 'c', '', null)]; const r = P.schedule(s, st('a', 'c')); assert.strictEqual(r.minDays, null); assert.deepStrictEqual(r.unknown, ['Стяжка → Плитка']); assert.strictEqual(P.num('0'), 0); assert.strictEqual(P.num(''), null); assert.strictEqual(P.num('-1'), null); assert.strictEqual(P.num('2,5'), 2.5); });
t('порядок нарушен — предупреждение, паузу вне маршрута игнорируем', () => { const s = S(); s.pauses = [pz('a', 'c', 7, 10), pz('b', 'c', 1, 1)]; const r = P.schedule(s, st('c', 'a')); assert.strictEqual(r.warnings.length, 1); assert.ok(r.warnings[0].includes('Плитка'));
  assert.deepStrictEqual(P.schedule(s, st('c')).warnings, []); });
t('forProcess и пустые шаги', () => { const s = S(); s.pauses = [pz('a', 'c', 1, 2)]; assert.strictEqual(P.forProcess(s, 'a').length, 1); assert.strictEqual(P.forProcess(s, 'b').length, 0); assert.strictEqual(P.schedule(s, []).minDays, 0); assert.strictEqual(P.schedule({}, st('a')).minDays, 0); });
t('проект: pauses по умолчанию [], переживают сохранение; маршрут отдаёт time', () => { const p = SM.store.fresh(); assert.deepStrictEqual(p.pauses, []); const L = p.library.processes, a = L[0].id, b = L[1].id; p.pauses.push(pz(a, b, 2, 4));
  const q = SM.store.parse(SM.store.toJson(p)); assert.strictEqual(q.pauses.length, 1); const rid = q.object.geometry.rooms[0].id; const c = SM.routes.compare(q, {id: 'r', name: 'x', roomId: rid, steps: [{processId: a}, {processId: b}], assume: []}); assert.strictEqual(c.time.minDays, 2); assert.strictEqual(c.time.maxDays, 4);
  const old = JSON.parse(SM.store.toJson(p)); delete old.pauses; assert.deepStrictEqual(SM.store.parse(JSON.stringify(old)).pauses, []); });
console.log('Итого проверок: ' + n);
