// Инженерия санузла (D42): поверхность «Инженерия», процессы, правила, обновление библиотеки: node tests/engineering.test.js
const assert = require('assert'), SM = require('../js/core.js');
for (const f of ['geometry', 'model', 'seeds', 'rules', 'libedit']) require('../js/' + f + '.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); }, M = SM.model;
const fresh = () => { const o = SM.seeds.bathroom(), L = SM.seeds.library(), r = o.geometry.rooms[0]; M.syncSurfaces(o); return {o, L, r, util: o.surfaces.find(s => s.kind === 'utilities')}; };
const ids = ['rough_plumbing', 'install_frame', 'rough_electric', 'finish_electric', 'finish_plumbing', 'sealing'];
const st = (P, id) => P.items.find(i => i.id === id);

t('у каждого помещения ровно одна поверхность «Инженерия»; синхронизация идемпотентна', () => { const {o} = fresh(); assert.strictEqual(o.surfaces.filter(s => s.kind === 'utilities').length, 1); const r = M.syncSurfaces(o); assert.deepStrictEqual(r.added, []); });
t('библиотека v4: слои инженерии, 6 процессов, библиотека проходит проверку без ошибок', () => { const {L} = fresh(); assert.strictEqual(L.version, SM.seeds.library().version);
  assert.deepStrictEqual(L.layers.utilities.map(l => l[0]), ids); for (const id of ids) assert.ok(L.processes.find(p => p.id === id && p.surface === 'utilities'));
  assert.deepStrictEqual(SM.libedit.validate(L).filter(v => v.level === 'error'), []); });
t('ванная: все 6 процессов инженерии попадают в план с причиной «этап справочника»', () => { const {o, L, r} = fresh(), P = SM.rules.plan(o, L, r.id);
  for (const id of ids) { const i = st(P, id); assert.ok(i, id); assert.ok(/справочника/.test(i.why.join(' ')), id); } });
t('жёсткий порядок только внутри цепочки; порядок относительно пола — рекомендация, а не блокировка', () => { const {o, L, r} = fresh(), P = SM.rules.plan(o, L, r.id);
  assert.strictEqual(st(P, 'rough_plumbing').status, 'READY'); assert.strictEqual(st(P, 'rough_electric').status, 'READY');
  assert.strictEqual(st(P, 'install_frame').status, 'BLOCKED'); assert.strictEqual(st(P, 'finish_electric').status, 'BLOCKED'); assert.strictEqual(st(P, 'finish_plumbing').status, 'BLOCKED'); assert.strictEqual(st(P, 'sealing').status, 'BLOCKED');
  for (const id of ids) for (const a of L.processes.find(p => p.id === id).after || []) assert.ok(ids.includes(a), 'after только внутри инженерии: ' + id);
  for (const id of ['waterproof_floor', 'screed_new', 'heating_water', 'tile_floor_lay']) assert.ok(!(L.processes.find(p => p.id === id).after || []).some(a => ids.includes(a)), 'пол от инженерии не зависит: ' + id);
  assert.ok(P.notes.some(x => x.kind === 'RECOMMEND' && /Порядок инженерии/.test(x.text))); });
t('цепочка разблокируется по отметкам выполнения: вода → инсталляция → чистовая сантехника → герметизация', () => { const {o, L, r} = fresh();
  for (const [id, next] of [['rough_plumbing', 'install_frame'], ['install_frame', 'finish_plumbing'], ['finish_plumbing', 'sealing']]) { SM.rules.complete(o, L, r.id, id); const P = SM.rules.plan(o, L, r.id); assert.strictEqual(st(P, id).status, 'DONE'); assert.strictEqual(st(P, next).status, 'READY', next); }
  SM.rules.complete(o, L, r.id, 'rough_electric'); assert.strictEqual(st(SM.rules.plan(o, L, r.id), 'finish_electric').status, 'READY'); });
t('предупреждение: гидроизоляция пола сделана, а черновая сантехника точно не сделана (неизвестно ≠ нет — тогда молчим)', () => { const {o, L, r, util} = fresh(), floor = o.surfaces.find(s => s.kind === 'floor'), warn = () => SM.rules.plan(o, L, r.id).notes.some(x => x.kind === 'WARN' && /Гидроизоляция пола уже сделана/.test(x.text));
  assert.ok(!warn()); M.setState(o, floor.id, 'waterproofing', 'YES'); assert.ok(!warn(), 'сантехника неизвестна → не предупреждаем');
  M.setState(o, util.id, 'rough_plumbing', 'NO'); assert.ok(warn()); M.setState(o, util.id, 'rough_plumbing', 'YES'); assert.ok(!warn()); });
t('не ванная: инженерия сама не добавляется', () => { const {o, L, r} = fresh(); r.type = 'kitchen'; const P = SM.rules.plan(o, L, r.id); for (const id of ids) assert.ok(!st(P, id), id); });
t('обновление библиотеки v3 → v4: добавляются слои, процессы и правила; правки руками целы', () => { const old = SM.seeds.library(); old.version = 3; delete old.layers.utilities; old.processes = old.processes.filter(p => !ids.includes(p.id)); old.rules = old.rules.filter(x => x.id !== 'bath_engineering' && x.id !== 'plumbing_after_waterproof');
  old.processes.find(p => p.id === 'demolish_floor').name = 'Мой демонтаж'; const L = SM.seeds.upgradeLibrary(old);
  assert.strictEqual(L.version, SM.seeds.library().version); assert.ok(L.layers.utilities && ids.every(id => L.processes.some(p => p.id === id))); assert.ok(L.rules.some(x => x.id === 'bath_engineering'));
  assert.strictEqual(L.processes.find(p => p.id === 'demolish_floor').name, 'Мой демонтаж'); assert.deepStrictEqual(L.upgradeSkipped, []); assert.strictEqual(SM.seeds.upgradeLibrary(L), L); });
t('редактор: вид «инженерия» назван по-русски', () => assert.strictEqual(SM.libedit.KIND_RU.utilities, 'инженерия'));
console.log('Итого проверок: ' + n);
