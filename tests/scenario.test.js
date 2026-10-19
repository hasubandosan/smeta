// Сквозной сценарий ванной: состояние → технологии → справочник → нормы → смета → паузы → выполнение → приёмка.
// Без аргументов — вымышленный справочник; с реальным: node tests/scenario.test.js путь\к\stroysmeta-kb.json
const assert = require('assert'), fs = require('fs'), SM = require('../js/core.js');
for (const f of ['geometry', 'model', 'seeds', 'rules', 'ver', 'estimate', 'pauses', 'routes', 'exec', 'storage', 'fact', 'kb', 'norms']) require('../js/' + f + '.js');
const K = SM.kb, X = SM.exec; let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' != ' + b);
const real = process.argv[2];
function fakeKb() { const kb = K.empty(), T = [['2.5.6', 'Стяжка'], ['3.2.1', 'Гидроизоляция'], ['3.2.2', 'Плитка']];
  for (const [c, title] of T) { const a = K.add(kb, null, title, c); K.setSection(kb, a.id, 'tools', '- Расход: см. упаковку\n- Инструмент: правило 2 м'); K.setSection(kb, a.id, 'accept', '- **Контрольные точки:**\n    - Нет трещин\n- **Числовые допуски:**\n    - Просвет под правилом: тест\n    - Отклонение от горизонтали: тест'); K.setSection(kb, a.id, 'pre', '- до: тест'); } return kb; }
const kb = real ? K.parse(fs.readFileSync(real, 'utf8')) : fakeKb();
const S = SM.store.fresh(), room = S.object.geometry.rooms[0], pl = id => S.plan.find(x => x.id === id);
const fl = l => S.object.surfaces.filter(x => x.roomId === room.id && x.kind === 'floor').map(x => SM.model.getState(S.object, x.id, l));
S.materials.push({id: 'm_mix', name: 'Смесь', unit: 'кг', packQty: null, price: null}); // данные вымышленные, только для теста
const T = (id, name, pid, mat) => ({id, name, processId: pid, params: [], ops: [{id: 'o_' + id, name: 'Работа', unit: 'м2', price: null, qty: 'floor', mats: mat ? [{id: 'x_' + id, matId: mat, rate: ''}] : [], notes: []}]});
S.techs.push(T('t_screed', '2.5.6. Стяжка пола', 'screed_new', 'm_mix'), T('t_wp', '3.2.1. Гидроизоляция влажных зон', 'waterproof_floor'), T('t_tile', '3.2.2. Облицовка плиткой', 'tile_floor_lay'));
for (const [tid, pid] of [['t_screed', 'screed_new'], ['t_wp', 'waterproof_floor'], ['t_tile', 'tile_floor_lay']]) { const it = {id: 'p_' + tid, techId: tid, roomId: room.id, processId: pid, values: {}}; S.plan.push(it); SM.ver.pin(S, it); }

t('справочник связывается с технологиями по номеру этапа', () => assert.strictEqual(K.autoLink(kb, S.techs), 3));
t('у каждой технологии есть нормы, пункты приёмки и замеры; ничего не подтверждено, значения неизвестны', () => { for (const tc of S.techs) { const r = SM.norms.report(S, kb, tc), w = K.workInfo(kb, tc.id);
  assert.ok(r.total > 0 && r.done === 0 && r.unknown > 0, tc.name); assert.ok(w.reduce((a, x) => a + x.accept.length, 0) > 0 && w.some(x => x.accept.some(a => a.meas)), tc.name); } });
t('смета без данных неполная; закупка и остаток не показывают неизвестное нулём (D3)', () => { const E = SM.est.compute(S); assert.ok(E.incomplete); assert.ok(E.rows.every(r => r.work === null && r.priceUnknown), 'неизвестная цена работы — не 0 ₽'); const b = E.buy.find(x => x.id === 'm_mix'); assert.ok(b.incomplete);
  assert.strictEqual(SM.fact.stock(S).find(x => x.id === 'm_mix').planned, null); });
t('исходные статусы: старый пол — демонтаж готов, стяжка и плитка заблокированы; начать стяжку нельзя (сначала демонтаж и тёплый пол)', () => { const P = SM.rules.plan(S.object, S.library, room.id), st = id => P.items.find(i => i.id === id).status;
  assert.strictEqual(st('demolish_floor'), 'READY'); assert.strictEqual(st('screed_new'), 'BLOCKED'); assert.strictEqual(st('tile_floor_lay'), 'BLOCKED'); assert.throws(() => X.start(S, pl('p_t_screed')), /Сначала/); });
t('человек вводит расход и цены → смета считается (площадь пола 15,75 м² из геометрии)', () => { S.techs[0].ops[0].price = 100; S.techs[0].ops[0].mats[0].rate = '1.9'; Object.assign(S.materials[0], {packQty: 25, price: 500});
  assert.ok(SM.ver.state(S, pl('p_t_screed')).canUpdate); /* пункт плана на старой версии, пока не нажато «Обновить до текущей» */ SM.ver.update(S, pl('p_t_screed'));
  const E = SM.est.compute(S), b = E.buy.find(x => x.id === 'm_mix'); close(b.base, 1.9 * 15.75); assert.strictEqual(b.packs, 2); assert.strictEqual(b.cost, 1000); assert.ok(!b.incomplete); assert.ok(E.incomplete); /* у других работ цены нет */ });
t('паузы: пока дни не введены — время неизвестно; после ввода — от…до и порядок', () => { S.pauses.push({id: 'z', afterId: 'screed_new', beforeId: 'tile_floor_lay', minDays: null, maxDays: null, note: ''});
  const route = {id: 'r', name: 'тест', roomId: room.id, steps: [{processId: 'screed_new'}, {processId: 'tile_floor_lay'}], assume: []};
  assert.strictEqual(SM.routes.compare(S, route).time.minDays, null); S.pauses[0].minDays = 7; S.pauses[0].maxDays = 10; const tm = SM.routes.compare(S, route).time; assert.strictEqual(tm.minDays, 7); assert.strictEqual(tm.maxDays, 10);
  assert.strictEqual(SM.pauses.schedule(S, route.steps.slice().reverse()).warnings.length, 1); });
t('выполнение по порядку библиотеки (демонтаж → тёплый пол → стяжка → гидроизоляция → плитка): приёмка не пускает без отметок, замеры пишутся, состояние меняется', () => {
  SM.rules.complete(S.object, S.library, room.id, 'demolish_floor'); SM.rules.complete(S.object, S.library, room.id, 'heating_water');
  const a = pl('p_t_screed'); X.start(S, a); SM.fact.setMat(a, 'm_mix', 100); assert.ok(X.addAccept(a, K.workInfo(kb, 't_screed').flatMap(w => w.accept)) > 0); X.complete(S, a);
  assert.throws(() => X.accept(S, a), /приёмка/i); const v = X.view(S, a); for (const c of v.checklist) { X.check(a, c.id, true); if (c.meas) X.setMeasure(a, c.id, '1 мм (тест)'); }
  X.accept(S, a); assert.strictEqual(a.status, 'ACCEPTED'); assert.deepStrictEqual(fl('screed'), ['YES']); assert.throws(() => X.setMeasure(a, v.checklist.find(c => c.meas).id, '0'));
  const tl = pl('p_t_tile'); assert.throws(() => X.start(S, tl), /Сначала/); /* плитка — только после гидроизоляции по стяжке */ X.start(S, pl('p_t_wp')); X.complete(S, pl('p_t_wp')); assert.deepStrictEqual(fl('waterproofing'), ['YES']); X.start(S, tl); X.complete(S, tl); assert.deepStrictEqual(fl('tile'), ['YES']); });
t('остаток: израсходовано известно, куплено неизвестно → остаток неизвестен (не 0)', () => { const k = SM.fact.stock(S).find(x => x.id === 'm_mix'); assert.strictEqual(k.used, 100); assert.strictEqual(k.left, null); S.bought = {m_mix: 120}; assert.strictEqual(SM.fact.stock(S).find(x => x.id === 'm_mix').left, 20); });
t('проект переживает сохранение и загрузку целиком', () => { const Q = SM.store.parse(SM.store.toJson(S)); assert.strictEqual(Q.plan.length, 3); assert.strictEqual(Q.pauses.length, 1); assert.strictEqual(Q.plan[0].status, 'ACCEPTED'); });
console.log('Итого проверок: ' + n);
