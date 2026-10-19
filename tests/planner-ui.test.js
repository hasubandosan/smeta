// Интерфейс CAD-планировщика (срез 2) в jsdom (npm i jsdom): node tests/planner-ui.test.js
const {JSDOM} = require('jsdom'), fs = require('fs'), assert = require('assert'), R = require('path').join(__dirname, '..') + '/';
let n = 0; const t = (name, f) => { f(); n++; console.log('OK   ' + name); };
// стенд грузится только с core/geometry/model/seeds/planner*: как с file://
const html = fs.readFileSync(R + 'planner.html', 'utf8').replace(/<script src="[^"]+"><\/script>/g, '');
const w = new JSDOM(html, {runScripts: 'outside-only', url: 'http://localhost/'}).window;
for (const f of ['core', 'geometry', 'model', 'seeds', 'planner', 'planner-ui']) w.eval(fs.readFileSync(R + 'js/' + f + '.js', 'utf8'));
const inline = html.match(/<script>([\s\S]*)<\/script>/)[1]; w.eval(inline);
const J = x => JSON.stringify(x);
const $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)], SM = w.SM;
const ev = (el, type, o) => { const e = new w.MouseEvent(type, Object.assign({bubbles: true, cancelable: true}, o)); e.pointerId = (o && o.pointerId) || 1; el.dispatchEvent(e); };
const click = el => { ev(el, 'pointerdown', {clientX: 5, clientY: 5}); ev(el, 'pointerup', {clientX: 5, clientY: 5}); };

t('стенд открывается: эталонная ванная — помещение, 6 стен, 6 подписей длин, площадь 15,75', () => {
  assert.strictEqual($$('polygon.pl-room').length, 1); assert.strictEqual($$('line.pl-wall').length, 6); assert.ok($('svg').textContent.includes('15,75 м²'));
  assert.deepStrictEqual($$('text.pl-dim').map(x => x.textContent).filter(x => /^\d/.test(x) && !x.includes('м²')).sort(), ['0,5', '0,5', '3,5', '3,5', '4', '4'].sort());
  assert.ok($('#ver').textContent.includes(SM.planner.VERSION)); });
t('проёмы эталона без привязки: в списке «без привязки», на чертеже не рисуются', () => {
  assert.strictEqual($$('#loose li').length, 3); assert.strictEqual($$('line.pl-open').length, 0); assert.ok($$('#issues li').some(x => /не привязан/.test(x.textContent))); });
t('выбор по клику: помещение, стена; панель свойств по-русски; повторный клик по фону снимает', () => {
  click($('polygon.pl-room')); assert.ok($('#info').textContent.includes('Помещение «Ванная»') && $('#info').textContent.includes('15,75 м²') && $('#info').textContent.includes('Контур замкнут'));
  assert.ok($('polygon.pl-room').getAttribute('class').includes('pl-sel'));
  click($('line.pl-hit')); assert.ok($('#info').textContent.includes('Стена «Стена 1»') && $('#info').textContent.includes('3,5 м'));
  click($('rect.pl-bg')); assert.ok($('#info').textContent.includes('Нажмите')); });
t('перетаскивание сдвигает вид и не выбирает', () => {
  const h = $('#plan'); const before = $('rect.pl-bg'); click($('rect.pl-bg')); const el = $('svg');
  ev(el, 'pointerdown', {clientX: 100, clientY: 100}); ev(el, 'pointermove', {clientX: 160, clientY: 130}); ev(el, 'pointerup', {clientX: 160, clientY: 130}); assert.ok($('#info').textContent.includes('Нажмите')); });
t('масштаб: кнопки «+», «−», «⤢»', () => { const b = $$('button').filter(x => ['Приблизить', 'Отдалить', 'Показать всё'].includes(x.title)); assert.strictEqual(b.length, 3);
  const grid0 = $('path.pl-grid').getAttribute('d'); b[0].click(); const k = () => $('line.pl-wall').getAttribute('x2'); const x1 = k(); b[2].click(); assert.notStrictEqual(x1, k()); b[1].click(); assert.ok($('svg').getAttribute('viewBox')); });
t('вымышленный пример: 3 помещения, толщина стен, дверь и окно на стенах, предметы, pos; без ошибок валидации', () => {
  const s = $('#data'); s.value = 'demo'; s.dispatchEvent(new w.Event('change'));
  assert.strictEqual($$('polygon.pl-room').length, 3);
  assert.strictEqual($$('line.pl-open.door').length, 1); assert.strictEqual($$('line.pl-open.win').length, 1);
  assert.ok($$('line.pl-wall').some(x => +x.getAttribute('stroke-width') > 2), 'толстые стены, где толщина известна'); assert.ok($$('line.pl-wall').some(x => +x.getAttribute('stroke-width') === 2), 'тонкие, где толщина неизвестна');
  assert.strictEqual($$('polygon.pl-fix').length, 1); assert.strictEqual($$('circle.pl-fix').length, 1, 'размер не задан — маркер, не выдуманный габарит');
  assert.strictEqual($$('#loose li button').length, 1); assert.ok(!$$('#issues li').some(x => x.className === 'lvl-error')); });
t('выбор проёма и предмета; focus по помещению', () => {
  click($('line.pl-hit[data-kind=opening]')); assert.ok($('#info').textContent.includes('Проём «дверь»') && $('#info').textContent.includes('0,9 м'));
  click($('polygon.pl-fix')); assert.ok($('#info').textContent.includes('Бокс') && $('#info').textContent.includes('0,6 м × 0,4 м'));
  $$('#rooms li button')[1].click(); assert.ok($('#info').textContent.includes('Комната B')); });
t('пустая геометрия и API mount: setGeometry/getGeometry/select/focus/undo/destroy', () => {
  const host = w.document.createElement('div'); w.document.body.appendChild(host); let issues = null, picked = null;
  const g = SM.seeds.bathroom().geometry, h = SM.planner.mount(host, {geometry: {walls: [], openings: [], rooms: []}, onIssues: i => issues = i, onSelect: i => picked = i});
  assert.strictEqual(J(issues), '[]'); assert.ok(h.isReadOnly()); h.setGeometry(g); assert.strictEqual(host.querySelectorAll('polygon.pl-room').length, 1); assert.strictEqual(J(h.getGeometry()), J(g));
  h.select(g.rooms[0].id); assert.strictEqual(J(h.selected()), J([g.rooms[0].id])); assert.strictEqual(picked, null, 'программный select не вызывает onSelect');
  h.select('нет такого'); assert.strictEqual(J(h.selected()), '[]'); assert.strictEqual(h.focus('нет'), false); assert.strictEqual(h.focus(g.rooms[0].id), true);
  assert.strictEqual(h.undo(), false); assert.strictEqual(h.redo(), false); const copy = h.getGeometry(); copy.walls[0].len = 99; assert.notStrictEqual(h.getGeometry().walls[0].len, 99);
  h.destroy(); assert.strictEqual(host.querySelectorAll('svg').length, 0); });
t('незамкнутая комната и неизвестная длина: рисуется пунктиром/не рисуется, без падений', () => {
  const host = w.document.createElement('div'); w.document.body.appendChild(host), g = SM.seeds.bathroom().geometry; g.walls[0].len = 3.7;
  const h = SM.planner.mount(host, {geometry: g}); assert.strictEqual(host.querySelectorAll('polygon.pl-room.bad').length, 1);
  const g2 = SM.seeds.bathroom().geometry; g2.walls[2].len = null; h.setGeometry(g2); assert.strictEqual(host.querySelectorAll('polygon.pl-room').length, 0); assert.strictEqual(host.querySelectorAll('line.pl-wall').length, 0); h.destroy(); });
t('описание записей: «не задано» вместо нуля', () => { const g = SM.seeds.bathroom().geometry, d = SM.planner.describe(g, g.walls[0].id); assert.ok(d.rows.some(r => r[0] === 'Толщина' && r[1] === 'не задано'));
  assert.ok(SM.planner.describe(g, g.openings[0].id).rows.some(r => r[1] === 'не привязан к стене')); assert.strictEqual(SM.planner.describe(g, 'нет'), null); });
console.log('Итого проверок: ' + n);
