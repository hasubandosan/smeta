// Справочник знаний без браузера: node tests/kb.test.js
const assert = require('assert'), fs = require('fs'), SM = require('../js/core.js');
for (const f of ['geometry', 'model', 'seeds', 'rules', 'ver', 'estimate', 'exec', 'storage', 'fact', 'kb']) require('../js/' + f + '.js');
const K = SM.kb, St = SM.store; let n = 0; const t = async (name, f) => { await f(); n++; console.log('OK   ' + name); };
const mk = () => { const kb = K.empty(); const a = K.add(kb, null, 'Черновые работы', '2'), b = K.add(kb, a.id, 'Стяжка пола', '2.5.6'), c = K.add(kb, b.id, 'Мокрая стяжка');
  K.setSection(kb, b.id, 'tools', '- Правило 2 м\n- Лента **демпферная**'); K.setSection(kb, b.id, 'accept', '1. Просвет ≤ 2 мм\n2. Не пылит'); return {kb, a, b, c}; };
const gist = () => { const db = {files: null, id: 'g1'}; const f = async (url, o = {}) => { const ok = b => ({ok: true, status: 200, json: async () => b, text: async () => ''});
  if (o.method === 'POST') { db.files = JSON.parse(o.body).files; return ok({id: db.id}); } if (o.method === 'PATCH') { db.files = Object.assign(db.files || {}, JSON.parse(o.body).files); return ok({}); }
  return ok({files: db.files}); }; return {db, f}; };

(async () => {
await t('дерево: порядок, дети, путь, подпись', () => { const {kb, a, b, c} = mk(); assert.deepStrictEqual(K.children(kb, null).map(x => x.id), [a.id]); assert.deepStrictEqual(K.path(kb, c.id).map(x => x.id), [a.id, b.id, c.id]); assert.strictEqual(K.label(b), '2.5.6 Стяжка пола'); });
await t('разделы: пустой текст удаляет раздел; неизвестный раздел отклоняется', () => { const {kb, b} = mk(); K.setSection(kb, b.id, 'tools', '  '); assert.ok(!('tools' in b.sections)); assert.throws(() => K.setSection(kb, b.id, 'нет', 'x'), /неизвестный раздел/); });
await t('удаление ветки убирает тему и всех потомков', () => { const {kb, a, b, c} = mk(); assert.strictEqual(K.remove(kb, b.id), 2); assert.deepStrictEqual(kb.topics.map(x => x.id), [a.id]); assert.ok(!K.byId(kb, c.id)); });
await t('перенос: нельзя внутрь себя; порядок среди соседей', () => { const {kb, a, b, c} = mk(); assert.throws(() => K.move(kb, a.id, c.id), /внутрь самой себя/); K.move(kb, c.id, a.id); assert.strictEqual(c.parentId, a.id); assert.deepStrictEqual(K.children(kb, a.id).map(x => x.id), [b.id, c.id]); });
await t('поиск: все слова, название выше, фрагмент текста', () => { const {kb, b} = mk(); const r = K.search(kb, 'демпферная лента'); assert.strictEqual(r.length, 1); assert.strictEqual(r[0].topic.id, b.id); assert.ok(r[0].snippet.includes('демпферная'));
  assert.strictEqual(K.search(kb, 'стяжка')[0].inTitle, true); assert.strictEqual(K.search(kb, 'нетакогослова').length, 0); assert.deepStrictEqual(K.search(kb, ''), []); });
await t('показ текста: экранирование (нет XSS), списки, жирный, таблица, ссылки', () => { const h = K.html('<script>alert(1)</script>\n\n- пункт **важно**\n    - вложенный\n- второй\n\n| A | B |\n|---|---|\n| 1 | <b>2</b> |\n\nhttps://example.com/a?b=1&c=2');
  assert.ok(!/<script/i.test(h) && !h.includes('<b>2</b>')); assert.ok(h.includes('&lt;script&gt;') && h.includes('<b>важно</b>') && h.includes('<ul><li>пункт') && /<ul><li>вложенный/.test(h) && h.includes('<table class=kbt>') && h.includes('<th>A</th>') && h.includes('<td>1</td>'));
  assert.ok(h.includes('href="https://example.com/a?b=1&amp;c=2"')); });
await t('показ: нумерованный список и заголовок', () => { const h = K.html('#### Раздел\n1. один\n2. два'); assert.ok(h.includes('<h4>Раздел</h4>') && h.includes('<ol><li>один</li><li>два</li></ol>')); });
await t('связь с технологиями: ручная, автосвязь по номеру этапа в названии, без дублей', () => { const {kb, b} = mk(); K.link(kb, b.id, 'T1'); K.link(kb, b.id, 'T1'); assert.deepStrictEqual(b.techIds, ['T1']); assert.deepStrictEqual(K.forTech(kb, 'T1').map(x => x.id), [b.id]);
  const techs = [{id: 'T2', name: '2. Работы › 2.5. Черновая › 2.5.6. Устройство стяжки › Полусухая'}, {id: 'T1', name: '2.5.6. Стяжка'}, {id: 'T3', name: 'Без номера'}, {id: 'T4', name: '9.9. Нет такой темы'}];
  assert.strictEqual(K.autoLink(kb, techs), 1); assert.deepStrictEqual(b.techIds, ['T1', 'T2']); assert.strictEqual(K.autoLink(kb, techs), 0); K.unlink(kb, b.id, 'T1'); assert.deepStrictEqual(b.techIds, ['T2']); });
await t('нормализация: сирота, цикл, повтор id, мусор', () => { const d = {topics: [{id: 'a', parentId: 'zzz', title: 'A', sections: {tools: 5}, extra: 1}, {id: 'b', parentId: 'c', title: 'B'}, {id: 'c', parentId: 'b', title: 'C'}]}; const kb = K.normalize(d);
  assert.strictEqual(kb.topics[0].parentId, null); assert.strictEqual(kb.topics[0].sections.tools, '5'); assert.strictEqual(kb.topics[0].extra, 1); assert.ok(kb.topics.some(x => x.parentId === null && (x.id === 'b' || x.id === 'c')));
  assert.throws(() => K.normalize({topics: [{id: 'a'}, {id: 'a'}]}), /повторяется/); assert.throws(() => K.normalize([]), /не файл справочника/); assert.throws(() => K.parse('{не json'), /повреждён/); assert.throws(() => K.normalize({topics: [{title: 'x'}]}), /без id/); });
await t('хранение: сохранение/загрузка; повреждённое не трогаем; проект не затрагивается', () => { const ls = St.memStorage(), {kb} = mk(); St.save(ls, St.fresh()); const proj = ls.getItem(St.KEY); assert.ok(K.save(ls, kb).ok);
  assert.strictEqual(K.load(ls).topics.length, 3); assert.strictEqual(ls.getItem(St.KEY), proj); ls.setItem(K.KEY, '{oops'); assert.throws(() => K.load(ls), /повреждён/); assert.strictEqual(ls.getItem(K.KEY), '{oops'); assert.strictEqual(K.load(St.memStorage()).topics.length, 0); });
await t('копии перед разрушающими действиями: максимум 2, при нехватке места — выбрасываются старые', () => { const ls = St.memStorage(), {kb} = mk(); for (let i = 0; i < 5; i++) K.snap(ls, kb, 1e12 + i); assert.strictEqual(K.snaps(ls).length, 2); assert.strictEqual(K.snapData(ls, 1).topics.length, 3);
  assert.strictEqual(K.snap(ls, K.empty()), false); const lim = {getItem: ls.getItem, removeItem: ls.removeItem, setItem: (k, v) => { if (k === K.SNAPKEY && v.length > 5) throw new Error('quota'); ls.setItem(k, v); }}; assert.strictEqual(K.snap(lim, kb), false); assert.ok(K.load(ls)); });
await t('сохранение при нехватке места не бросает ошибку', () => { const r = K.save({setItem() { throw new Error('quota'); }}, mk().kb); assert.deepStrictEqual([r.ok, r.error], [false, 'quota']); });
await t('облако: справочник — отдельный файл в том же Gist, файл проекта не затронут', async () => { const g = gist(), ls = St.memStorage(), S = St.fresh(); S.updated = 100; St.setCfg(ls, {token: 'tk'}); const cl = St.cloud(ls, g.f); await cl.push(S);
  const {kb} = mk(); await cl.putFile(K.GFILE, K.toJson(kb)); assert.ok(g.db.files[St.GFILE] && g.db.files[K.GFILE]); assert.strictEqual(K.parse(await cl.getFile(K.GFILE)).topics.length, 3); assert.strictEqual(await cl.getFile('нет.json'), null);
  assert.strictEqual(JSON.parse(g.db.files[St.GFILE].content).updated, 100); const ls2 = St.memStorage(); await assert.rejects(St.cloud(ls2, g.f).putFile('x', '1'), /не подключено/); });
await t('справочник не попадает в проект, JSON-копию и облачный файл проекта', () => { const S = St.fresh(); mk(); assert.ok(!('kb' in S) && !St.toJson(S).includes('Стяжка пола')); });
// реальные данные, если лежат рядом (в репозиторий не входят): node tests/kb.test.js путь\к\stroysmeta-kb.json
const real = process.argv[2] || process.env.KB_FILE; if (real && fs.existsSync(real)) await t('реальный файл справочника проходит проверку', () => { const kb = K.parse(fs.readFileSync(real, 'utf8')); assert.ok(kb.topics.length > 100);
  const roots = K.children(kb, null); assert.ok(roots.length >= 4); assert.ok(!kb.topics.some(x => /\\text|!\[\[/.test(Object.values(x.sections).join('')))); assert.ok(K.search(kb, 'демпферная лента').length > 0); K.html(kb.topics.map(x => Object.values(x.sections).join('\n\n')).join('\n\n')); });
console.log('Итого проверок: ' + n);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
