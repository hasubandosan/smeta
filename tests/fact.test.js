// Факт выполнения и снимки смет без браузера: node tests/fact.test.js
const assert = require('assert'), SM = require('../js/core.js');
for (const f of ['geometry', 'model', 'seeds', 'rules', 'ver', 'estimate', 'exec', 'storage', 'fact']) require('../js/' + f + '.js');
const F = SM.fact; let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); };
const mk = () => { const S = SM.store.fresh(); S.materials.push({id: 'm1', name: 'Смесь', unit: 'кг', packQty: 25, price: 700});
  S.techs.push({id: 't1', name: 'Стяжка', params: [], ops: [{id: 'o1', name: 'Залить', unit: 'м2', price: 1000, qty: 'floor', mats: [{id: 'x', matId: 'm1', rate: '5'}]}, {id: 'o2', name: 'Затереть', unit: 'м2', price: 100, qty: 'floor', mats: []}]});
  S.plan.push({id: 'p1', techId: 't1', roomId: S.object.geometry.rooms[0].id, values: {}}); return S; };
const run = S => { const it = S.plan[0]; SM.exec.start(S, it); return it; };

t('факт вносится только после начала работы; отрицательное и «не число» отклоняются', () => { const S = mk(), it = S.plan[0];
  assert.throws(() => F.setOp(it, 'o1', 'qty', 10), /после начала/); run(S); assert.throws(() => F.setOp(it, 'o1', 'qty', -1), /отрицательным/); assert.throws(() => F.setOp(it, 'o1', 'qty', 'abc'));
  assert.throws(() => F.setOp(it, 'o1', 'price', 1), /qty или cost/); F.setOp(it, 'o1', 'qty', '16,5'.replace(',', '.')); assert.strictEqual(it.fact.ops.o1.qty, 16.5); });
t('пустое значение = неизвестно (null), а не 0', () => { const S = mk(), it = run(S); F.setOp(it, 'o1', 'cost', 15000); F.setOp(it, 'o1', 'cost', ''); assert.strictEqual(it.fact.ops.o1.cost, null);
  assert.strictEqual(F.report(S).items[0].ops[0].factCost, null); });
t('отчёт: план против факта, отклонения, итог считает только известное и помечает неполноту', () => { const S = mk(), it = run(S); F.setOp(it, 'o1', 'qty', 17); F.setOp(it, 'o1', 'cost', 18000);
  let r = F.report(S), o = r.items[0].ops[0]; assert.deepStrictEqual([o.planQty, o.factQty, o.dQty, o.planWork, o.factCost, o.dCost].map(x => Math.round(x * 100) / 100), [15.75, 17, 1.25, 15750, 18000, 2250]);
  assert.strictEqual(r.items[0].ops[1].factCost, null); assert.strictEqual(r.factWork, 18000); assert.strictEqual(r.incomplete, false);   // работа ещё идёт — пустое не считается пропуском
  SM.exec.complete(S, it); r = F.report(S); assert.ok(r.incomplete && r.costMissing === 1); assert.strictEqual(r.factWork, 18000); });
t('закупка: куплено / израсходовано / остаток; неизвестное остаётся null; перерасход помечается', () => { const S = mk(), it = run(S); S.bought = {m1: 100};
  let s = F.stock(S)[0]; assert.deepStrictEqual([s.have, s.used, s.left, s.over], [100, null, null, false]);
  F.setMat(it, 'm1', 30); s = F.stock(S)[0]; assert.deepStrictEqual([s.used, s.left, s.over], [30, 70, false]);
  F.setMat(it, 'm1', 130); s = F.stock(S)[0]; assert.deepStrictEqual([s.left, s.over], [-30, true]);
  delete S.bought.m1; s = F.stock(S)[0]; assert.deepStrictEqual([s.have, s.left, s.over], [null, null, false]); });
t('факт не меняет смету (смета ≠ источник истины)', () => { const S = mk(), it = run(S), g = SM.est.compute(S).grand; F.setOp(it, 'o1', 'cost', 999999); F.setMat(it, 'm1', 5); F.setOp(it, 'o1', 'qty', 99);
  assert.strictEqual(SM.est.compute(S).grand, g); });
t('принятая работа: факт закрыт', () => { const S = mk(), it = run(S); SM.exec.complete(S, it); SM.exec.accept(S, it); assert.throws(() => F.setOp(it, 'o1', 'qty', 1), /закрыт/); assert.throws(() => F.setMat(it, 'm1', 1), /закрыт/); });
t('снимок утверждённой сметы не меняется от правок сметы; сравнение показывает разницу', () => { const S = mk(), snap = F.approve(S, 'Первая'); assert.strictEqual(snap.grand, SM.est.compute(S).grand); const g0 = snap.grand;
  S.techs[0].ops[0].price = 1200; assert.strictEqual(S.approved[0].grand, g0); assert.ok(Math.abs(S.approved[0].rows[0].work - 15750) < 1e-6);
  const c = F.compare(S, snap); assert.ok(c.dGrand > 0 && Math.abs(c.dWork - 3150) < 1e-6 && c.changes.length === 1 && c.changes[0].kind === 'changed' && c.comparable); });
t('сравнение: добавленные и убранные операции; неполные данные → comparable=false', () => { const S = mk(), snap = F.approve(S, ''); assert.ok(snap.name.startsWith('Смета от '));
  S.techs[0].ops.pop(); S.techs[0].ops.push({id: 'o3', name: 'Новая', unit: 'м2', price: 1, qty: 'нет_такой', mats: []});
  const c = F.compare(S, snap), k = c.changes.map(x => x.kind).sort(); assert.deepStrictEqual(k, ['added', 'removed']); assert.strictEqual(c.comparable, false); });
t('хранение: факт и снимки переживают сохранение/загрузку; старые проекты без approved работают', () => { const S = mk(), it = run(S); F.setOp(it, 'o1', 'qty', 17); F.approve(S, 'A');
  const r = SM.store.parse(SM.store.toJson(S)); assert.strictEqual(r.plan[0].fact.ops.o1.qty, 17); assert.strictEqual(r.approved.length, 1);
  const old = JSON.parse(SM.store.toJson(mk())); delete old.approved; assert.deepStrictEqual(SM.store.normalize(old).approved, []); });
console.log('Итого проверок: ' + n);
