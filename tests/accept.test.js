// Приёмка из справочника, замеры, предупреждения: node tests/accept.test.js [путь к stroysmeta-kb.json]
const assert = require('assert'), fs = require('fs'), SM = require('../js/core.js');
for (const f of ['geometry', 'model', 'seeds', 'rules', 'ver', 'estimate', 'exec', 'storage', 'fact', 'kb']) require('../js/' + f + '.js');
const K = SM.kb, X = SM.exec; let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); };
const ACC = '- **Контрольные точки:**\n    - Отсутствие трещин.\n    - Поверхность не пылит.\n\n- **Числовые допуски (по СП 29):**\n    - Просвет под 2-метровым правилом:\n        - Под паркет: **≤ 2 мм**.\n        - Под линолеум: **≤ 2 мм** (иначе наливной пол)\n    - Отклонение от горизонтали: ≤ 0.2%.\n- Отдельный пункт без группы';
const mk = () => { const S = SM.store.fresh(); S.techs.push({id: 't1', name: '2.5.6. Стяжка', params: [], ops: [{id: 'o1', name: 'Залить', unit: 'м2', price: 1, qty: 'floor', mats: [], notes: [{id: 'n1', cat: 'accept', text: 'Ровно по правилу'}]}]});
  S.plan.push({id: 'p1', techId: 't1', roomId: S.object.geometry.rooms[0].id, values: {}}); return S; };

t('разбор: группы, склейка контекста, markdown убран, замер только у «допусков»', () => { const it = K.items(ACC);
  assert.deepStrictEqual(it.map(x => [x.group, x.text, x.meas]), [['Контрольные точки', 'Отсутствие трещин.', false], ['Контрольные точки', 'Поверхность не пылит.', false],
    ['Числовые допуски (по СП 29)', 'Просвет под 2-метровым правилом: — Под паркет: ≤ 2 мм.', true], ['Числовые допуски (по СП 29)', 'Просвет под 2-метровым правилом: — Под линолеум: ≤ 2 мм (иначе наливной пол)', true],
    ['Числовые допуски (по СП 29)', 'Отклонение от горизонтали: ≤ 0.2%.', true], ['', 'Отдельный пункт без группы', false]]); });
t('разбор: пустое/мусор/нумерованные/абзацы без маркера', () => { assert.deepStrictEqual(K.items(''), []); assert.deepStrictEqual(K.items(null), []); assert.deepStrictEqual(K.items('---\n#### Заголовок'), []);
  assert.deepStrictEqual(K.items('1. Первый\n2. Второй\n   продолжение').map(x => x.text), ['Первый', 'Второй продолжение']); assert.deepStrictEqual(K.items('Просто строка').map(x => x.text), ['Просто строка']); });
t('справочник о технологии: только связанные темы, условия/ошибки целиком, приёмка разобрана', () => { const kb = K.empty(), a = K.add(kb, null, 'Стяжка', '2.5.6'), b = K.add(kb, null, 'Другая', '9');
  K.setSection(kb, a.id, 'accept', ACC); K.setSection(kb, a.id, 'cond', '- Температура +5'); K.setSection(kb, a.id, 'errors', '- Много воды\n- Нет ленты'); K.setSection(kb, b.id, 'accept', '- чужое'); K.link(kb, a.id, 't1');
  const w = K.workInfo(kb, 't1'); assert.strictEqual(w.length, 1); assert.strictEqual(w[0].accept.length, 6); assert.strictEqual(w[0].accept[0].topicId, a.id); assert.ok(w[0].cond.includes('Температура') && K.items(w[0].errors).length === 2); assert.deepStrictEqual(K.workInfo(kb, 'нет'), []); });
t('пункты приёмки работы: добавление без дублей, видны в чек-листе вместе с пунктами технологии', () => { const S = mk(), it = S.plan[0]; const kb = K.empty(), a = K.add(kb, null, 'С', '2.5.6'); K.setSection(kb, a.id, 'accept', ACC); K.link(kb, a.id, 't1');
  const add = K.workInfo(kb, 't1')[0].accept; assert.strictEqual(X.addAccept(it, add), 6); assert.strictEqual(X.addAccept(it, add), 0); assert.strictEqual(X.addAccept(it, [{text: '  ОТСТУПЫ  '}, {text: 'отступы'}, {text: ''}]), 1);
  const v = X.view(S, it); assert.strictEqual(v.checklist.length, 1 + 6 + 1); assert.strictEqual(v.checklist[0].text, 'Ровно по правилу'); assert.ok(v.checklist.slice(1).every(c => c.extra)); assert.strictEqual(v.checklist.filter(c => c.meas).length, 3); });
t('приёмка невозможна, пока не отмечены и пункты из справочника; замер записывается только там, где он предусмотрен', () => { const S = mk(), it = S.plan[0]; X.start(S, it); X.addAccept(it, K.items(ACC));
  const ids = X.view(S, it).checklist; X.complete(S, it); X.check(it, ids[0].id, true); assert.throws(() => X.accept(S, it), /Не пройдена приёмка/);
  const m = ids.find(c => c.meas), plainPt = ids.find(c => c.extra && !c.meas); X.setMeasure(it, m.id, ' 1,5 мм '); assert.strictEqual(X.view(S, it).checklist.find(c => c.id === m.id).measure, '1,5 мм');
  assert.throws(() => X.setMeasure(it, plainPt.id, '1'), /не предусмотрен/); assert.throws(() => X.setMeasure(it, ids[0].id, '1'), /не предусмотрен/); X.setMeasure(it, m.id, ''); assert.strictEqual(X.view(S, it).checklist.find(c => c.id === m.id).measure, '');
  ids.forEach(c => X.check(it, c.id, true)); X.accept(S, it); assert.strictEqual(it.status, 'ACCEPTED'); });
t('после приёмки пункты и замеры закрыты', () => { const S = mk(), it = S.plan[0]; X.start(S, it); X.addAccept(it, K.items(ACC)); X.complete(S, it); X.view(S, it).checklist.forEach(c => X.check(it, c.id, true)); X.accept(S, it);
  assert.throws(() => X.addAccept(it, [{text: 'ещё'}]), /приёмка закрыта/); assert.throws(() => X.removeAccept(it, it.accept[0].id), /закрыта/); assert.throws(() => X.setMeasure(it, it.accept[2].id, '1'), /закрыта/); });
t('удаление пункта убирает отметку и замер', () => { const S = mk(), it = S.plan[0]; X.start(S, it); X.addAccept(it, K.items(ACC)); const m = X.view(S, it).checklist.find(c => c.meas); X.check(it, m.id, true); X.setMeasure(it, m.id, '2 мм');
  X.removeAccept(it, m.id); assert.ok(!(m.id in (it.checks || {})) && !(m.id in (it.measure || {})) && !it.accept.some(a => a.id === m.id)); });
t('пропущенные операции пункта плана не дают пунктов приёмки', () => { const S = mk(), it = S.plan[0]; it.skipOps = {o1: true}; assert.strictEqual(X.view(S, it).checklist.length, 0); X.addAccept(it, [{text: 'свой'}]); assert.strictEqual(X.view(S, it).checklist.length, 1); });
t('Excel: лист «Приёмка» с отметками и замерами', () => { const S = mk(), it = S.plan[0]; X.start(S, it); X.addAccept(it, K.items(ACC)); const m = X.view(S, it).checklist.find(c => c.meas); X.check(it, m.id, true); X.setMeasure(it, m.id, '1,5 мм');
  const rows = SM.store.sheets(S).find(s => s.name === 'Приёмка').rows; assert.deepStrictEqual(rows[0], ['Помещение', 'Технология', 'Группа', 'Пункт приёмки', 'Отмечено', 'Замер']); const r = rows.find(x => x[3] === m.text); assert.deepStrictEqual([r[4], r[5]], ['да', '1,5 мм']); assert.ok(rows.some(x => x[3] === 'Ровно по правилу' && x[4] === 'нет')); });
t('хранение: пункты и замеры переживают сохранение/загрузку', () => { const S = mk(), it = S.plan[0]; X.start(S, it); X.addAccept(it, K.items(ACC)); const m = X.view(S, it).checklist.find(c => c.meas); X.setMeasure(it, m.id, '3 мм');
  const R = SM.store.parse(SM.store.toJson(S)); assert.strictEqual(R.plan[0].accept.length, 6); assert.strictEqual(R.plan[0].measure[m.id], '3 мм'); });
const real = process.argv[2] || process.env.KB_FILE; if (real && fs.existsSync(real)) t('реальный справочник: пункты приёмки, замеры, ошибки разбираются', () => { const kb = K.parse(fs.readFileSync(real, 'utf8')); let acc = 0, meas = 0, topics = 0, errs = 0;
  for (const tp of kb.topics) { const a = K.items(tp.sections.accept || ''); if (a.length) topics++; acc += a.length; meas += a.filter(x => x.meas).length; errs += K.items(tp.sections.errors || '').length; assert.ok(a.every(x => x.text.length > 3 && !/[*_`]/.test(x.text))); }
  assert.ok(topics > 60 && acc > 350 && meas > 100 && errs > 200, [topics, acc, meas, errs].join('/')); console.log('     (тем с приёмкой ' + topics + ', пунктов ' + acc + ', из них с замером ' + meas + ', ошибок ' + errs + ')'); });
console.log('Итого проверок: ' + n);
