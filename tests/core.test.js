// Тесты ядра и геометрии без браузера и без зависимостей: node tests/core.test.js
const assert = require('assert'), SM = require('../js/core.js'); require('../js/geometry.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b);

t('формула: приоритет и функции', () => { near(SM.evalExpr('(2+3)*2', {}).value, 10); near(SM.evalExpr('ceil(395/25)', {}).value, 16); near(SM.evalExpr('19*thickness/10*1,1', {thickness: 60}).value, 125.4); });
t('UNKNOWN != 0: неизвестная переменная даёт «неизвестно», а не ноль', () => {
  const r = SM.evalExpr('floor*thickness', {floor: 42, thickness: null}); assert.deepStrictEqual([r.ok, r.unknown], [false, ['thickness']]);
  assert.strictEqual(SM.evalExpr('floor*0', {floor: 42}).value, 0); });
t('формула: ошибки не падают', () => { assert.ok(SM.evalExpr('2+', {}).error); assert.ok(SM.evalExpr('1/0', {}).error); assert.ok(SM.evalExpr('foo(1)', {}).error); });
t('объяснение формулы', () => assert.strictEqual(SM.explain('area*thickness*rate', {area: 42, thickness: 50, rate: 1.9}), '42 × 50 × 1,9 = 3990'));
t('упаковки: 395 кг / 25 = 16 мешков', () => { assert.strictEqual(SM.packs(395, 25), 16); assert.strictEqual(SM.packs(400, 25), 16); assert.strictEqual(SM.packs(5, 0), null); });

const rect = () => ({walls: [{id: 'a', len: 4}, {id: 'b', len: 3}, {id: 'c', len: 4}, {id: 'd', len: 3}],
  openings: [{id: 'o1', wallId: 'a', kind: 'дверь', w: 0.9, h: 2.1}], rooms: [{id: 'r', name: 'Комната', height: 2.7, wallIds: ['a', 'b', 'c', 'd']}]});
t('прямоугольник 4×3×2.7 с дверью', () => { const m = rect(), r = SM.geo.deriveRoom(m, m.rooms[0]);
  near(r.floor, 12); near(r.perimeter, 14); near(r.wallArea, 14 * 2.7 - 0.9 * 2.1); near(r.openingsArea, 1.89); assert.ok(r.closed); });
t('параметричность: длины 4→4.5 у обеих стен — всё пересчиталось', () => { const m = rect(); m.walls[0].len = m.walls[2].len = 4.5; const r = SM.geo.deriveRoom(m, m.rooms[0]); near(r.floor, 13.5); near(r.perimeter, 15); });
t('Г-образное помещение из 6 стен (не только 4)', () => {
  const m = {walls: [[4, 90], [2, 90], [2, -90], [2, 90], [2, 90], [4]].map((a, i) => ({id: 'w' + i, len: a[0], turn: a[1]})), openings: [], rooms: [{id: 'r', height: 2.5, wallIds: ['w0', 'w1', 'w2', 'w3', 'w4', 'w5']}]};
  const r = SM.geo.deriveRoom(m, m.rooms[0]); assert.ok(r.closed); near(r.floor, 12); near(r.perimeter, 16); near(r.wallArea, 16 * 2.5); });
t('незамкнутый контур: площадь неизвестна, причина названа', () => { const m = rect(); m.walls[0].len = 4.5; const r = SM.geo.deriveRoom(m, m.rooms[0]);
  assert.strictEqual(r.floor, null); assert.ok(r.issues[0].includes('не замкнут')); near(r.perimeter, 14.5); });
t('неизвестный проём не считается нулём', () => { const m = rect(); m.openings[0].h = null; const r = SM.geo.deriveRoom(m, m.rooms[0]);
  assert.strictEqual(r.wallArea, null); near(r.floor, 12); assert.ok(r.issues.some(s => s.includes('проёма'))); });

/* ---- Фаза 2: модель объекта и тестовая ванная ---- */
require('../js/model.js'); require('../js/seeds.js');
t('ванная из ТЗ: 6 стен при углах 90° замыкаются, пол 15.75 м²', () => { const o = SM.seeds.bathroom(), r = SM.model.derive(o)[0];
  assert.ok(r.closed && o.geometry.walls.length === 6); near(r.floor, 15.75); near(r.ceiling, 15.75); near(r.perimeter, 16); });
t('ванная: площадь стен = 16×2.7 − проёмы 3.80 (проёмы без привязки)', () => { const r = SM.model.derive(SM.seeds.bathroom())[0];
  near(r.openingsArea, 1.89 + 1.76 + 0.15); near(r.wallArea, 43.2 - 3.8); assert.ok(r.issues.some(s => s.includes('без привязки'))); });
t('ванная: изменение длины стены пересчитывает (4→4.5 у пары стен 5/6 ломает контур → неизвестно)', () => { const o = SM.seeds.bathroom(); o.geometry.walls[4].len = 4.5;
  const r = SM.model.derive(o)[0]; assert.strictEqual(r.floor, null); });
t('состояние по умолчанию UNKNOWN, не NO', () => { const o = SM.seeds.bathroom(), f = o.surfaces.find(s => s.kind === 'floor');
  assert.strictEqual(SM.model.getState(o, f.id, 'waterproofing'), 'UNKNOWN'); assert.strictEqual(SM.model.getState(o, f.id, 'existing_floor'), 'YES');
  assert.throws(() => SM.model.setState(o, f.id, 'x', 'maybe')); });
t('ванная: закуплено, неизвестное не выдумано', () => { const o = SM.seeds.bathroom(); const g = n => o.purchased.find(p => p.name.includes(n));
  assert.strictEqual(g('Ceresit').qty, 2); assert.strictEqual(g('Ceresit').packQty, null); assert.strictEqual(g('Перчатки').qty, null); });
t('миграция: сохраняет неизвестные поля, не принимает схему из будущего', () => { const m = SM.model.migrate({name: 'X', custom: 7, geometry: {walls: [{id: 'a', len: 1}]}});
  assert.strictEqual(m.custom, 7); assert.strictEqual(m.schemaVersion, SM.model.SCHEMA); assert.deepStrictEqual(m.goals, []); assert.throws(() => SM.model.migrate({schemaVersion: 99})); });
console.log('\nВсе проверки пройдены: ' + n);

/* ---- смета и закупка ---- */
require('../js/estimate.js');
t('смета: плитка на пол ванной, упаковки, купленное, неизвестное', () => {
  const o = SM.seeds.bathroom(), room = o.geometry.rooms[0];
  const S = {object: o, materials: [{id: 'g', name: 'Клей', unit: 'кг', packQty: 25, price: 700}, {id: 'x', name: 'Затирка', unit: 'кг', packQty: null, price: 300}],
    techs: [{id: 't', name: 'Плитка', params: [{key: 'k', def: 5}], ops: [{id: 'o1', name: 'Укладка', unit: 'м2', price: 1000, qty: 'floor', mats: [{id: 'a', matId: 'g', rate: '5*k/5'}, {id: 'b', matId: 'x', rate: '0.5'}]}, {id: 'o2', name: 'Неизв.', unit: 'м2', price: 10, qty: 'nope', mats: []}]}],
    plan: [{id: 'p', techId: 't', roomId: room.id, values: {}}], fin: {waste: 10, reserve: 0}, bought: {g: 25}};
  const R = SM.est.compute(S), g = R.buy.find(b => b.id === 'g'), x = R.buy.find(b => b.id === 'x');
  near(R.rows[0].q, 15.75); near(R.work, 15750); near(g.base, 78.75); near(g.total, 86.625); near(g.rest, 61.625); assert.strictEqual(g.packs, 3); near(g.cost, 2100);
  assert.strictEqual(x.packs, null); assert.strictEqual(x.cost, null); assert.deepStrictEqual(R.rows[1].missing, ['nope']); assert.ok(R.incomplete); });
t('короб: площадь покраски из размеров (0.6×0.4×2.7 → 5.4 м²)', () => { const o = SM.seeds.bathroom();
  const V = SM.est.vars({object: o}, {roomId: o.geometry.rooms[0].id}, {params: []}); near(V.box, 5.4); });
console.log('Итого проверок: ' + n);

/* ---- накладные/скидка/НДС и перенос из старого приложения ---- */
require('../js/legacy.js');
t('итог: подытог → накладные 10% → скидка 5% → НДС 20%', () => { const o = SM.seeds.bathroom();
  const S = {object: o, materials: [], techs: [{id: 't', name: 'Т', params: [], ops: [{id: 'o', name: 'О', unit: 'м2', price: 1000, qty: '10', mats: []}]}], plan: [{id: 'p', techId: 't', roomId: o.geometry.rooms[0].id}], fin: {overhead: 10, discount: 5, vat: 20}, bought: {}};
  const R = SM.est.compute(S); near(R.sub, 10000); near(R.overhead, 1000); near(R.discount, 550); near(R.vat, 2090); near(R.grand, 12540); });
t('перенос из старого приложения: ветвление → технологии, композит раскрыт, параметры, без дублей', () => {
  const old = {materials: [{id: 'm1', name: 'Песок', category: 'material', unit: 'кг', price: 280, packQty: 40}, {id: 'm2', name: 'Лента', category: 'material', unit: 'м', price: 400, packQty: 25}],
    composites: [{id: 'c1', name: 'Смесь', unit: 'кг', components: [{refType: 'material', refId: 'm1', rate: '2'}]}], params: [{key: 'floor', def: 0}, {key: 'thickness', def: 60}],
    stages: [{id: 'a', parentId: '', name: '2.5.6 Стяжка', mode: 'choice', unit: ''}, {id: 'b', parentId: 'a', name: 'Полусухая', mode: 'steps', unit: ''},
      {id: 's1', parentId: 'b', name: 'Укладка', unit: 'м2', price: 350, vol: 'floor', components: [{refType: 'composite', refId: 'c1', rate: '19*thickness/10'}]},
      {id: 's2', parentId: 'b', name: 'Лента', unit: 'м', price: 40, vol: 'perimeter', components: [{refType: 'material', refId: 'm2', rate: '1.05'}]},
      {id: 'w', parentId: 'a', name: 'Мокрая', mode: 'steps', unit: ''}, {id: 's3', parentId: 'w', name: 'Заливка', unit: 'м2', price: 400, vol: 'floor', components: []}]};
  const r = SM.legacy.convert(old, {techs: [], materials: []});
  assert.strictEqual(r.materials.length, 2); assert.deepStrictEqual(r.techs.map(x => x.name), ['2.5.6 Стяжка › Полусухая', '2.5.6 Стяжка › Мокрая']);
  const op = r.techs[0].ops[0]; assert.strictEqual(op.qty, 'floor'); assert.strictEqual(op.mats[0].matId, 'm1'); near(SM.evalExpr(op.mats[0].rate, {thickness: 60}).value, 2 * 19 * 6);
  assert.deepStrictEqual(r.techs[0].params, [{key: 'thickness', def: 60}]); assert.strictEqual(r.techs[0].ops.length, 2);
  assert.strictEqual(SM.legacy.convert(old, {techs: r.techs, materials: r.materials}).techs.length, 0); });
console.log('Итого проверок: ' + n);

/* ---- Фаза 4–5: правила, эффекты, что можно делать сейчас ---- */
require('../js/rules.js');
const bath = () => { const o = SM.seeds.bathroom(); return {o, lib: SM.seeds.library(), rid: o.geometry.rooms[0].id}; };
const st = (P, id) => P.items.find(x => x.id === id);
t('ванная: что можно / что заблокировано / что уточнить', () => { const {o, lib, rid} = bath(), P = SM.rules.plan(o, lib, rid);
  assert.strictEqual(st(P, 'demolish_floor').status, 'READY'); assert.strictEqual(st(P, 'waterproof_floor').status, 'BLOCKED');
  assert.ok(st(P, 'waterproof_floor').reasons[0].includes('Демонтаж старого пола'));
  assert.strictEqual(st(P, 'tile_wall').status, 'BLOCKED'); assert.strictEqual(st(P, 'demolish_wall_tile').status, 'NEEDS_INFO');
  assert.strictEqual(st(P, 'paint_box').status, 'NEEDS_INFO'); assert.strictEqual(st(P, 'gkl_ceiling').status, 'READY'); });
t('правило объясняет «почему»: гидроизоляция из-за влажной зоны и выбора', () => { const {o, lib, rid} = bath(), w = st(SM.rules.plan(o, lib, rid), 'waterproof_floor');
  assert.ok(w.why.some(x => x.includes('влажная зона'))); assert.ok(w.why.some(x => x.includes('выбрали'))); });
t('UNKNOWN != NO: неизвестная гидроизоляция не считается отсутствующей и не считается готовой', () => { const {o} = bath(), f = o.surfaces.find(s => s.kind === 'floor').id;
  assert.strictEqual(SM.model.getState(o, f, 'waterproofing'), 'UNKNOWN');
  const ctx = {obj: o, room: o.geometry.rooms[0]}; assert.strictEqual(SM.rules.evalCond({state: {kind: 'floor', layer: 'waterproofing', is: 'NO'}}, ctx), 'U'); });
t('вопросы только по недостающему; по толщине стяжки спрашивает правило', () => { const {o, lib, rid} = bath(), q = SM.rules.plan(o, lib, rid).questions.map(x => x.text);
  assert.ok(q.some(x => x.includes('старая плитка') || x.includes('Старая плитка'))); assert.ok(q.some(x => x.includes('толщина'))); assert.ok(!q.some(x => x.includes('старый пол'))); });
t('эффекты: выполнение демонтажа меняет состояние и открывает следующий процесс', () => { const {o, lib, rid} = bath();
  assert.throws(() => SM.rules.complete(o, lib, rid, 'waterproof_floor'));
  SM.rules.complete(o, lib, rid, 'demolish_floor'); const f = o.surfaces.find(s => s.kind === 'floor').id;
  assert.strictEqual(SM.model.getState(o, f, 'existing_floor'), 'NO'); const P = SM.rules.plan(o, lib, rid);
  assert.strictEqual(st(P, 'demolish_floor').status, 'DONE'); assert.strictEqual(st(P, 'waterproof_floor').status, 'READY'); assert.strictEqual(st(P, 'heating_water').status, 'BLOCKED'); });
t('плитка на стенах разблокируется по цепочке, когда основание подготовлено', () => { const {o, lib, rid} = bath();
  o.surfaces.filter(s => s.kind === 'wall').forEach(s => SM.model.setState(o, s.id, 'existing_tile', 'NO'));
  assert.strictEqual(st(SM.rules.plan(o, lib, rid), 'prepare_wall_base').status, 'READY');
  SM.rules.complete(o, lib, rid, 'prepare_wall_base'); assert.strictEqual(st(SM.rules.plan(o, lib, rid), 'tile_wall').status, 'READY'); });
t('FORBID, RECOMMEND и пользовательская библиотека работают без изменений кода', () => { const {o, rid} = bath();
  const lib = {goals: {}, processes: [{id: 'x', name: 'Икс', surface: 'ceiling', effects: [{op: 'ADD', layer: 'q'}]}], rules: [
    {id: 'r1', if: {room: {key: 'type', op: 'in', value: ['bathroom', 'kitchen']}}, then: [{do: 'ADD_PROCESS', process: 'x', because: 'b'}, {do: 'FORBID', process: 'x', because: 'нельзя'}, {do: 'WARN', text: 'w', because: 'b'}]}]};
  const P = SM.rules.plan(o, lib, rid); assert.strictEqual(P.items[0].status, 'BLOCKED'); assert.ok(P.items[0].reasons[0].includes('нельзя')); assert.strictEqual(P.notes.length, 1); });
console.log('Итого проверок: ' + n);

t('смета учитывает состояние: выполненный процесс не попадает в смету, невыполненный попадает', () => { const {o, lib, rid} = bath();
  const S = {object: o, library: lib, materials: [], techs: [{id: 't', name: 'Демонтаж', processId: 'demolish_floor', params: [], ops: [{id: 'o', name: 'Снос', unit: 'м2', price: 100, qty: 'floor', mats: []}]}],
    plan: [{id: 'p', techId: 't', roomId: rid, processId: 'demolish_floor', values: {}}], fin: {}, bought: {}};
  near(SM.est.compute(S).work, 1575); assert.deepStrictEqual(SM.est.compute(S).skipped, []);
  SM.rules.complete(o, lib, rid, 'demolish_floor'); const R2 = SM.est.compute(S); near(R2.work, 0); assert.deepStrictEqual(R2.skipped, ['p']); });
console.log('Итого проверок: ' + n);

/* ---- сравнение маршрутов ---- */
require('../js/routes.js');
const rt = () => { const {o, lib, rid} = bath(), T = (id, pid, price) => ({id, name: id, processId: pid, params: [], ops: [{id: 'o' + id, name: 'Р', unit: 'м2', price, qty: 'floor', mats: []}]});
  const S = {object: o, library: lib, materials: [], fin: {}, bought: {}, techs: [T('dem', 'demolish_floor', 100), T('new', 'screed_new', 500), T('rep', 'repair_screed', 150), T('tile', 'tile_floor_lay', 1000)],
    plan: [{id: 'p', techId: 'tile', roomId: rid, processId: 'tile_floor_lay', values: {}}],
    routes: [{id: 'A', name: 'Оставить', roomId: rid, steps: [], assume: [{kind: 'floor', layer: 'existing_floor', value: 'NO'}, {kind: 'floor', layer: 'screed', value: 'YES'}]},
      {id: 'B', name: 'Ремонт', roomId: rid, steps: [{processId: 'repair_screed', techId: 'rep'}], assume: [{kind: 'floor', layer: 'existing_floor', value: 'NO'}]},
      {id: 'C', name: 'Снести и новая', roomId: rid, steps: [{processId: 'demolish_floor', techId: 'dem'}, {processId: 'screed_new', techId: 'new'}], assume: []}]}; return {S, rid}; };
t('маршруты: полная цена = шаги + нужное дальше; выбирается дешёвый', () => { const {S, rid} = rt(), C = SM.routes.compareAll(S, rid), by = id => C.results.find(x => x.route.id === id);
  near(by('A').work, 15750); near(by('B').work, 15750 + 150 * 15.75); near(by('C').work, 15750 + 600 * 15.75); assert.strictEqual(C.best, 'A'); });
t('маршруты: реальный объект не меняется; последствия видны', () => { const {S, rid} = rt(), f = S.object.surfaces.find(s => s.kind === 'floor').id, C = SM.routes.compareAll(S, rid);
  assert.strictEqual(SM.model.getState(S.object, f, 'existing_floor'), 'YES'); assert.ok(C.results.find(x => x.route.id === 'A').ready.includes('Плитка на полу')); });
t('маршруты: неизвестные данные → итог неполный, «дешевле» не объявляется', () => { const {S, rid} = rt(); S.techs[3].ops[0].qty = 'nope'; assert.strictEqual(SM.routes.compareAll(S, rid).best, null); });
t('обновление библиотеки только добавляет, не затирает правки пользователя', () => { const old = SM.seeds.library(); old.version = 1; old.processes = old.processes.filter(p => p.id !== 'repair_screed'); old.processes[0].name = 'МОЁ НАЗВАНИЕ';
  const L = SM.seeds.upgradeLibrary(old); assert.ok(L.processes.some(p => p.id === 'repair_screed')); assert.strictEqual(L.processes[0].name, 'МОЁ НАЗВАНИЕ'); assert.strictEqual(L.version, 2); });
console.log('Итого проверок: ' + n);

/* ---- выполнение и приёмка ---- */
require('../js/exec.js');
const ex = () => { const {o, lib, rid} = bath(), N = (cat, text) => ({id: 'n' + text, cat, text});
  const S = {object: o, library: lib, materials: [], fin: {}, bought: {}, techs: [{id: 'dem', name: 'Демонтаж', processId: 'demolish_floor', params: [], ops: [{id: 'o', name: 'Снос', unit: 'м2', price: 100, qty: 'floor', mats: [],
      notes: [N('accept', 'Основание очищено'), N('accept', 'Мусор вывезен'), N('cond', 'Отключить воду'), N('error', 'Повредили трубы')]}]},
    {id: 'wp', name: 'Гидроизоляция', processId: 'waterproof_floor', params: [], ops: [{id: 'o2', name: 'Обмазка', unit: 'м2', price: 50, qty: 'floor', mats: [], notes: []}]}],
    plan: [{id: 'a', techId: 'dem', roomId: rid, processId: 'demolish_floor'}, {id: 'b', techId: 'wp', roomId: rid, processId: 'waterproof_floor'}]}; return {S, o, rid}; };
t('работы: нельзя начать, пока процесс заблокирован; причина названа', () => { const {S} = ex(), b = S.plan[1], v = SM.exec.view(S, b);
  assert.ok(!v.canStart && v.waits[0].includes('Демонтаж')); assert.throws(() => SM.exec.start(S, b), /Сначала/); });
t('работы: начать → выполнить меняет состояние и открывает следующую работу', () => { const {S, o} = ex(), [a, b] = S.plan;
  SM.exec.start(S, a); assert.throws(() => SM.exec.start(S, a)); SM.exec.complete(S, a); assert.strictEqual(a.status, 'COMPLETED');
  assert.strictEqual(SM.model.getState(o, o.surfaces.find(s => s.kind === 'floor').id, 'existing_floor'), 'NO'); assert.ok(SM.exec.view(S, b).canStart); });
t('приёмка: ACCEPTED только после чек-листа; условия и ошибки видны', () => { const {S} = ex(), a = S.plan[0], v = SM.exec.view(S, a);
  assert.deepStrictEqual([v.conditions, v.errors, v.checklist.length], [['Отключить воду'], ['Повредили трубы'], 2]);
  assert.throws(() => SM.exec.accept(S, a), /только выполненную/); SM.exec.start(S, a); SM.exec.complete(S, a);
  assert.throws(() => SM.exec.accept(S, a), /Не пройдена приёмка/); SM.exec.check(a, 'nОснование очищено', true); assert.throws(() => SM.exec.accept(S, a));
  SM.exec.check(a, 'nМусор вывезен', true); SM.exec.accept(S, a); assert.strictEqual(a.status, 'ACCEPTED'); });
t('смета: выполненная работа остаётся в смете (история), запланированная при выполненном процессе — нет', () => { const {S, o, rid} = ex(), a = S.plan[0];
  SM.rules.complete(o, S.library, rid, 'demolish_floor'); assert.deepStrictEqual(SM.est.compute(S).skipped, ['a']);
  a.status = 'COMPLETED'; assert.deepStrictEqual(SM.est.compute(S).skipped, []); near(SM.est.compute(S).rows.find(r => r.item === a).work, 1575); });
console.log('Итого проверок: ' + n);
