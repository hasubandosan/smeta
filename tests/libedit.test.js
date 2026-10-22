// Редактор библиотеки (логика): node tests/libedit.test.js
const assert = require('assert'), SM = require('../js/core.js');
for (const f of ['geometry', 'model', 'seeds', 'rules', 'libedit']) require('../js/' + f + '.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); }, X = SM.libedit, lib = () => SM.seeds.library();

t('демо-библиотека проходит проверку без ошибок', () => { const v = X.validate(lib()); assert.deepStrictEqual(v.filter(x => x.level === 'error'), []); });
t('правило описывается словами по-русски', () => { const L = lib(), r = L.rules.find(x => x.id === 'wet_waterproof'), s = X.describeRule(r, L);
  assert.ok(s.startsWith('ЕСЛИ ') && s.includes('помещение: тип == bathroom') && s.includes('есть цель «плитка на полу»') && s.includes('потребовать «Гидроизоляция пола'), s); });
t('все типы условий: заготовка → описание → вычисление без ошибок', () => { const L = lib(), o = SM.seeds.bathroom(), ctx = {obj: o, room: o.geometry.rooms[0], goals: o.goals};
  for (const [k] of X.COND_TYPES) { const c = X.defaultCond(k, L); assert.strictEqual(X.condType(c), k); assert.ok(X.describeCond(c, L).length > 0); assert.ok(['T', 'F', 'U'].includes(SM.rules.evalCond(c, ctx))); } });
t('разбор значений: числа, да/нет, текст, списки; пустое = неизвестно', () => { assert.strictEqual(X.parseValue('2,5'), 2.5); assert.strictEqual(X.parseValue('true'), true); assert.strictEqual(X.parseValue('нет'), false);
  assert.strictEqual(X.parseValue('water'), 'water'); assert.strictEqual(X.parseValue(''), null); assert.deepStrictEqual(X.parseValue('a, 2, true', true), ['a', 2, true]); });
t('замена и удаление по пути', () => { const L = lib(), r = L.rules[0]; X.replaceAt({library: L}, 'library.rules.0.if', X.defaultCond('goal', L)); assert.strictEqual(X.condType(r.if), 'goal');
  X.deleteAt({library: L}, 'library.processes.0.needed'); assert.strictEqual(L.processes[0].needed, undefined); });
t('проверка находит: цикл, битые ссылки, действие без значения, неописанный слой', () => { const L = lib(); L.processes[0].after = [L.processes[1].id]; L.processes[1].after = [L.processes[0].id];
  L.rules.push({id: 'x', name: 'Х', if: {state: {kind: 'floor', layer: 'nope', is: 'YES'}}, then: [{do: 'REQUIRE', process: 'ghost', because: 'b'}, {do: 'MODIFY_QUANTITY', because: 'b'}]});
  const txt = X.validate(L).map(x => x.text).join('\n'); assert.ok(/Цикл/.test(txt)); assert.ok(/несуществующий процесс/.test(txt)); assert.ok(/нет значения/.test(txt)); assert.ok(/слой «nope»/.test(txt)); });
t('удаление процесса чистит ссылки внутри библиотеки; usage считает использование', () => { const L = lib(), S = {techs: [{processId: 'screed_new'}], plan: [{processId: 'screed_new'}, {processId: 'x'}]};
  const u = X.usage(L, S, 'screed_new'); assert.ok(u.goals >= 1 && u.after >= 1 && u.techs === 1 && u.plan === 1); X.removeProcess(L, 'screed_new');
  assert.ok(!L.processes.some(p => p.id === 'screed_new')); assert.ok(!Object.values(L.goals).some(l => l.includes('screed_new'))); assert.ok(!L.processes.some(p => (p.after || []).includes('screed_new')));
  assert.deepStrictEqual(X.validate(L).filter(x => x.level === 'error'), []); });
console.log('Итого проверок: ' + n);
