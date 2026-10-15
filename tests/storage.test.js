// Тесты сохранности данных без браузера и зависимостей: node tests/storage.test.js
const assert = require('assert'), SM = require('../js/core.js');
for (const f of ['geometry', 'model', 'seeds', 'rules', 'estimate', 'exec', 'storage']) require('../js/' + f + '.js');
const St = SM.store; let n = 0;
const t = async (name, f) => { await f(); n++; console.log('OK   ' + name); };
const mk = () => { const ls = St.memStorage(); return ls; };
const withTech = S => { S.materials.push({id: 'm1', name: 'Смесь', unit: 'кг', packQty: 25, price: 700});
  S.techs.push({id: 't1', name: 'Стяжка', params: [], ops: [{id: 'o1', name: 'Залить', unit: 'м2', price: 1000, qty: 'floor', mats: [{id: 'x', matId: 'm1', rate: '5'}]},
    {id: 'o2', name: 'Неизвестное', unit: 'м2', price: 100, qty: 'нет_такой', mats: []}]});
  S.plan.push({id: 'p1', techId: 't1', roomId: S.object.geometry.rooms[0].id, values: {}}); return S; };
// фейковый Gist-сервер
const gist = () => { const db = {files: null, id: 'g1'}, calls = [];
  const f = async (url, o = {}) => { calls.push((o.method || 'GET') + ' ' + url.replace('https://api.github.com', ''));
    const ok = b => ({ok: true, status: 200, json: async () => b, text: async () => ''});
    if (o.method === 'POST') { db.files = JSON.parse(o.body).files; return ok({id: db.id}); }
    if (o.method === 'PATCH') { db.files = JSON.parse(o.body).files; return ok({}); }
    if (url.endsWith('/gists?per_page=100')) return ok(db.files ? [{id: db.id, files: db.files}] : []);
    return ok({files: db.files}); };
  return {db, calls, f}; };

(async () => {
await t('сохранение и загрузка: данные те же, копия :backup создана, штамп времени ставится', () => { const ls = mk(), S = withTech(St.fresh());
  assert.ok(St.save(ls, S).ok); assert.ok(S.updated > 0); const r = St.load(ls); assert.strictEqual(r.isNew, false);
  assert.strictEqual(r.S.techs[0].name, 'Стяжка'); assert.ok(ls.getItem(St.KEY + ':backup')); });
await t('первый запуск: пустое хранилище → свежий проект, ничего не записано', () => { const ls = mk(), r = St.load(ls); assert.ok(r.isNew && r.S.object); assert.strictEqual(ls.getItem(St.KEY), null); });
await t('повреждённые данные: ошибка, исходный текст не тронут', () => { const ls = mk(); ls.setItem(St.KEY, '{oops'); assert.throws(() => St.load(ls), /повреждён/); assert.strictEqual(ls.getItem(St.KEY), '{oops'); });
await t('схема из будущего: отказ, данные не тронуты', () => { const ls = mk(), S = St.fresh(); S.object.schemaVersion = 999; const raw = JSON.stringify(S); ls.setItem(St.KEY, raw);
  assert.throws(() => St.load(ls)); assert.strictEqual(ls.getItem(St.KEY), raw); });
await t('неизвестные поля проекта и объекта сохраняются при загрузке', () => { const ls = mk(), S = St.fresh(); S.extra = {a: 1}; S.object.futureField = 7; St.save(ls, S);
  const r = St.load(ls).S; assert.deepStrictEqual(r.extra, {a: 1}); assert.strictEqual(r.object.futureField, 7); });
await t('импорт мусора отклоняется', () => { assert.throws(() => St.parse('[]'), /не файл проекта/); assert.throws(() => St.parse('{"a":1}'), /не файл проекта/); assert.throws(() => St.parse('не json'), /JSON/); });
await t('точки отката: не чаще раза в 5 минут, максимум 10, force обходит паузу', () => { const ls = mk(), S = St.fresh(); const t0 = 1e12;
  assert.ok(St.snap(ls, S, false, t0)); assert.ok(!St.snap(ls, S, false, t0 + 60e3)); assert.ok(St.snap(ls, S, false, t0 + 6 * 60e3));
  for (let i = 0; i < 15; i++) St.snap(ls, S, true, t0 + 1e7 + i); assert.strictEqual(St.snaps(ls).length, St.MAX_SNAPS); });
await t('точки отката при нехватке места: старые выбрасываются, главные данные целы', () => { const ls = mk(), S = withTech(St.fresh()); St.save(ls, S); const main = ls.getItem(St.KEY);
  const lim = {getItem: ls.getItem, removeItem: ls.removeItem, setItem: (k, v) => { if (k === St.SNAPKEY && v.length > 2.5 * main.length) throw new Error('quota'); ls.setItem(k, v); }};
  for (let i = 0; i < 6; i++) St.snap(lim, S, true, 1e12 + i); assert.ok(St.snaps(ls).length >= 1 && St.snaps(ls).length < 6); assert.strictEqual(ls.getItem(St.KEY), main); });
await t('сохранение при нехватке места не бросает ошибку, а сообщает', () => { const ls = {getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem() {}}; const r = St.save(ls, St.fresh()); assert.deepStrictEqual([r.ok, r.error], [false, 'quota']); });
await t('замена данных (откат/файл/облако) сначала делает точку отката текущих', () => { const ls = mk(), cur = withTech(St.fresh()), next = St.fresh(); St.save(ls, cur);
  St.replace(ls, cur, next); assert.strictEqual(St.load(ls).S.techs.length, 0); assert.strictEqual(St.snapData(ls, St.snaps(ls).length - 1).techs[0].name, 'Стяжка'); });
await t('решение по облаку: матрица same/push/pull/conflict', () => { const d = St.decide;
  assert.strictEqual(d({updated: 5}, null, {}), 'push'); assert.strictEqual(d({updated: 5}, {updated: 5}, {lastSync: 5}), 'same');
  assert.strictEqual(d({updated: 9}, {updated: 5}, {lastSync: 5}), 'push'); assert.strictEqual(d({updated: 5}, {updated: 9}, {lastSync: 5}), 'pull');
  assert.strictEqual(d({updated: 8}, {updated: 9}, {lastSync: 5}), 'conflict'); assert.strictEqual(d({updated: 8}, {updated: 9}, {}), 'conflict'); });
await t('облако: первое подключение при уже существующих облачных данных — конфликт, ничего не перезаписано', async () => {
  const g = gist(), ls1 = mk(), A = withTech(St.fresh()); A.updated = 100; St.setCfg(ls1, {token: 'tk'}); await St.cloud(ls1, g.f).push(A);
  const ls2 = mk(), B = St.fresh(); B.updated = 200; St.setCfg(ls2, {token: 'tk'}); const before = g.db.files[St.GFILE].content;
  const r = await St.cloud(ls2, g.f).check(B); assert.strictEqual(r.action, 'conflict'); assert.strictEqual(g.db.files[St.GFILE].content, before);
  assert.ok(!g.calls.some(c => c.startsWith('PATCH'))); });
await t('облако: «взять облако» делает точку отката локальных и запоминает синхронизацию', async () => {
  const g = gist(), ls1 = mk(), A = withTech(St.fresh()); A.updated = 100; St.setCfg(ls1, {token: 'tk'}); await St.cloud(ls1, g.f).push(A);
  const ls2 = mk(), B = St.fresh(); B.updated = 200; St.save(ls2, B, {keepStamp: true}); St.setCfg(ls2, {token: 'tk'}); const cl = St.cloud(ls2, g.f), r = await cl.check(B);
  const S = cl.adopt(B, r.remote); assert.strictEqual(S.techs[0].name, 'Стяжка'); assert.strictEqual(St.cfg(ls2).lastSync, 100);
  assert.strictEqual(St.snapData(ls2, 0).techs.length, 0); assert.strictEqual(St.load(ls2).S.techs.length, 1); });
await t('облако: перезапись запрещена, если в облаке более новые данные (без force)', async () => {
  const g = gist(), ls1 = mk(), A = St.fresh(); A.updated = 100; St.setCfg(ls1, {token: 'tk'}); const c1 = St.cloud(ls1, g.f); await c1.push(A);
  const ls2 = mk(); St.setCfg(ls2, {token: 'tk', gistId: 'g1', lastSync: 100}); const L = St.fresh(); L.updated = 150;
  A.updated = 300; A.techs.push({id: 'z', name: 'Чужая', ops: []}); await c1.push(A);       // другое устройство изменило облако
  await assert.rejects(St.cloud(ls2, g.f).push(L), e => e.conflict); assert.ok(JSON.parse(g.db.files[St.GFILE].content).techs.length === 1); });
await t('облако: облако не менялось, локально новее → отправляется само', async () => {
  const g = gist(), ls = mk(), A = St.fresh(); A.updated = 100; St.setCfg(ls, {token: 'tk'}); const cl = St.cloud(ls, g.f); await cl.push(A);
  A.updated = 150; assert.strictEqual((await cl.check(A)).action, 'pushed'); assert.strictEqual(JSON.parse(g.db.files[St.GFILE].content).updated, 150); });
await t('токен облака не попадает в проект и JSON-экспорт', () => { const ls = mk(), S = St.fresh(); St.setCfg(ls, {token: 'SECRET'}); St.save(ls, S);
  assert.ok(!St.toJson(S).includes('SECRET') && !ls.getItem(St.KEY).includes('SECRET')); });
await t('Excel: листы, неизвестное — пустая ячейка (не 0), неполный итог помечен', () => { const S = withTech(St.fresh()), sh = St.sheets(S), by = k => sh.find(x => x.name === k).rows;
  assert.deepStrictEqual(sh.map(x => x.name), ['Смета', 'Закупка', 'Помещения', 'Работы']);
  const known = by('Смета').find(r => r[1] === 'Стяжка › Залить'), unk = by('Смета').find(r => r[1] === 'Стяжка › Неизвестное');
  assert.strictEqual(known[3], 15.75); assert.strictEqual(known[5], 15750); assert.strictEqual(unk[3], ''); assert.strictEqual(unk[5], ''); assert.ok(unk[6].includes('нет_такой'));
  assert.ok(by('Смета').some(r => String(r[1]).includes('Итог неполный')));
  const b = by('Закупка')[1]; assert.deepStrictEqual([b[0], b[2], b[8], b[9]], ['Смесь', 78.75, 4, 2800]); assert.strictEqual(by('Помещения')[1][2], 15.75); });
console.log('Итого проверок: ' + n);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
