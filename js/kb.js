/* Справочник знаний (перенесён из Obsidian один раз; дальше правится только в приложении). Без DOM.
   Хранится ОТДЕЛЬНО от проекта: ключ localStorage `stroysmeta:kb` (+ файл `stroysmeta-kb.json` в том же приватном Gist по кнопке).
   kb = {version, updated, topics:[{id, parentId|null, order, code, title, sections:{ключ:текст}, techIds:[id технологий], ...}]}
   Справочник — справка для человека; в расчёты ничего не подставляет (нормы «не выдумываем»: формулы вводит человек). */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, K = SM.kb = {};
  K.KEY = 'stroysmeta:kb'; K.SNAPKEY = 'stroysmeta:kb:snaps'; K.GFILE = 'stroysmeta-kb.json'; K.MAX_SNAPS = 2;   // снимки тяжёлые (справочник ~1 МБ) — держим 2
  K.SECTIONS = [['text', 'Текст'], ['tools', 'Инструменты, материалы и нормы расхода'], ['cond', 'Условия проведения работ'], ['pre', 'Что должно быть сделано до (сопряжения, заделы)'],
    ['steps', 'Технология (шаги)'], ['errors', 'Частые ошибки'], ['accept', 'Приёмка и допуски'], ['protect', 'Защита результата'], ['more', 'Дополнительно, другие мнения']];
  const KEYS = K.SECTIONS.map(s => s[0]);

  K.empty = () => ({version: 1, updated: 0, topics: []});
  /* Принимает данные любой формы, не теряет неизвестные поля; чинит ссылки на несуществующих родителей и циклы. */
  K.normalize = d => {
    if (!d || typeof d !== 'object' || Array.isArray(d) || !Array.isArray(d.topics)) throw new Error('это не файл справочника');
    const kb = JSON.parse(JSON.stringify(d)), ids = new Set();
    kb.version = kb.version || 1; kb.updated = +kb.updated || 0;
    kb.topics.forEach((t, i) => {
      if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !t.id) throw new Error('в справочнике тема без id (№ ' + (i + 1) + ')');
      if (ids.has(t.id)) throw new Error('в справочнике повторяется id темы: ' + t.id); ids.add(t.id);
      t.title = String(t.title == null ? '' : t.title); t.code = String(t.code == null ? '' : t.code); t.order = isFinite(+t.order) ? +t.order : i;
      t.sections = t.sections && typeof t.sections === 'object' && !Array.isArray(t.sections) ? t.sections : {};
      for (const k of Object.keys(t.sections)) if (typeof t.sections[k] !== 'string') t.sections[k] = String(t.sections[k] == null ? '' : t.sections[k]);
      t.techIds = Array.isArray(t.techIds) ? t.techIds.filter(x => typeof x === 'string') : []; t.parentId = t.parentId || null;
    });
    const by = new Map(kb.topics.map(t => [t.id, t]));
    for (const t of kb.topics) { if (t.parentId && !by.has(t.parentId)) t.parentId = null; let p = t.parentId, n = 0; while (p && n++ < 10000) { if (p === t.id) { t.parentId = null; break; } p = (by.get(p) || {}).parentId; } }
    return kb;
  };
  K.parse = text => { let d; try { d = JSON.parse(text); } catch (e) { throw new Error('файл повреждён или это не JSON'); } return K.normalize(d); };
  K.toJson = kb => JSON.stringify(kb);

  const by = (kb, id) => kb.topics.find(t => t.id === id) || null;
  K.byId = by;
  K.children = (kb, id) => kb.topics.map((t, i) => [t, i]).filter(([t]) => (t.parentId || null) === (id || null)).sort((a, b) => a[0].order - b[0].order || a[1] - b[1]).map(x => x[0]);
  K.path = (kb, id) => { const out = []; let t = by(kb, id), n = 0; while (t && n++ < 1000) { out.unshift(t); t = t.parentId ? by(kb, t.parentId) : null; } return out; };
  K.label = t => (t.code ? t.code + ' ' : '') + (t.title || 'Без названия');
  K.size = kb => kb.topics.reduce((a, t) => a + Object.values(t.sections).reduce((s, x) => s + x.length, 0), 0);
  const subtree = (kb, id) => { const out = [id]; for (const c of K.children(kb, id)) out.push(...subtree(kb, c.id)); return out; };

  /* --- правка --- */
  K.add = (kb, parentId, title, code) => { if (parentId && !by(kb, parentId)) throw new Error('родительская тема не найдена');
    const sib = K.children(kb, parentId || null), t = {id: SM.uid(), parentId: parentId || null, order: sib.length ? sib[sib.length - 1].order + 1 : 0, code: code || '', title: title || 'Новая тема', sections: {}, techIds: []};
    kb.topics.push(t); return t; };
  K.update = (kb, id, patch) => { const t = by(kb, id); if (!t) throw new Error('тема не найдена'); for (const f of ['title', 'code']) if (f in patch) t[f] = String(patch[f]); return t; };
  K.setSection = (kb, id, key, text) => { const t = by(kb, id); if (!t) throw new Error('тема не найдена'); if (!KEYS.includes(key)) throw new Error('неизвестный раздел: ' + key);
    const s = String(text == null ? '' : text); if (s.trim()) t.sections[key] = s; else delete t.sections[key]; return t; };
  K.remove = (kb, id) => { if (!by(kb, id)) throw new Error('тема не найдена'); const ids = new Set(subtree(kb, id)); kb.topics = kb.topics.filter(t => !ids.has(t.id)); return ids.size; };
  K.move = (kb, id, newParentId) => { const t = by(kb, id); if (!t) throw new Error('тема не найдена'); if (newParentId && !by(kb, newParentId)) throw new Error('родительская тема не найдена');
    if (newParentId && subtree(kb, id).includes(newParentId)) throw new Error('нельзя перенести тему внутрь самой себя');
    const sib = K.children(kb, newParentId || null).filter(x => x.id !== id); t.parentId = newParentId || null; t.order = sib.length ? sib[sib.length - 1].order + 1 : 0; return t; };

  /* --- связь тем с технологиями проекта (хранится в справочнике, технологии/версии не трогает) --- */
  K.link = (kb, topicId, techId) => { const t = by(kb, topicId); if (!t) throw new Error('тема не найдена'); if (!t.techIds.includes(techId)) t.techIds.push(techId); return t; };
  K.unlink = (kb, topicId, techId) => { const t = by(kb, topicId); if (t) t.techIds = t.techIds.filter(x => x !== techId); return t; };
  K.forTech = (kb, techId) => kb.topics.filter(t => t.techIds.includes(techId));
  /* Автосвязь: у старых технологий в названии есть номер этапа («… › 2.5.6. Устройство стяжки …»). Берём самый глубокий номер и ищем тему с таким кодом. */
  K.autoLink = (kb, techs) => { let linked = 0; const byCode = new Map(); for (const t of kb.topics) if (t.code && !byCode.has(t.code)) byCode.set(t.code, t);
    for (const tech of techs) { let code = null; for (const seg of String(tech.name || '').split('›')) { const m = /^\s*(\d+(?:\.(?:\d+|[Xx]))*)\.?\s/.exec(seg); if (m) code = m[1]; }
      const topic = code && byCode.get(code); if (topic && !topic.techIds.includes(tech.id)) { topic.techIds.push(tech.id); linked++; } }
    return linked; };

  /* --- поиск: все слова запроса должны встретиться в названии или тексте темы --- */
  K.search = (kb, q, limit) => { const w = String(q || '').toLowerCase().split(/\s+/).filter(Boolean); if (!w.length) return [];
    const res = []; for (const t of kb.topics) { const title = K.label(t).toLowerCase(), where = [], all = [title]; let snippet = '';
      for (const [k] of K.SECTIONS) { const s = t.sections[k]; if (!s) continue; const l = s.toLowerCase(); all.push(l); if (w.some(x => l.includes(x))) { where.push(k); if (!snippet) { const i = l.indexOf(w.find(x => l.includes(x))); snippet = s.slice(Math.max(0, i - 40), i + 90).replace(/\s+/g, ' '); } } }
      const hay = all.join('\n'); if (w.every(x => hay.includes(x))) res.push({topic: t, inTitle: w.some(x => title.includes(x)), where, snippet}); }
    res.sort((a, b) => (b.inTitle - a.inTitle)); return res.slice(0, limit || 50); };

  /* --- разбор раздела на пункты (приёмка, ошибки, условия) ---
     Берутся «листья» маркированных/нумерованных списков; вложенный контекст склеивается через « — », верхний уровень с вложенными пунктами = группа
     (например «Контрольные точки», «Числовые допуски (по СП …)»). meas=true для групп про допуски: к такому пункту в работе добавляется поле «замер».
     Допуск из текста НЕ разбирается и не сравнивается автоматически (диапазоны, «на 1 м», несколько условий в строке — ненадёжно): оценивает человек. */
  const plain = s => String(s).replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  K.items = text => { const tree = [], stack = [];
    for (const l of String(text || '').replace(/\r/g, '').replace(/\t/g, '    ').split('\n')) { const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(l);
      if (m) { const n = {ind: m[1].length, text: plain(m[3]), kids: []}; while (stack.length && stack[stack.length - 1].ind >= n.ind) stack.pop(); (stack.length ? stack[stack.length - 1].kids : tree).push(n); stack.push(n); }
      else if (l.trim() && !/^\s*-{3,}\s*$/.test(l) && !/^\s*#/.test(l)) { if (stack.length) stack[stack.length - 1].text += ' ' + plain(l); else tree.push({ind: -1, text: plain(l), kids: []}); } }
    const out = [], leaves = (n, path, group) => { const p = path.concat(n.text); if (!n.kids.length) out.push({group, text: p.join(' — '), meas: /допуск/i.test(group)}); n.kids.forEach(k => leaves(k, p, group)); };
    for (const top of tree) { if (top.kids.length) { const g = top.text.replace(/:\s*$/, ''); top.kids.forEach(k => leaves(k, [], g)); } else out.push({group: '', text: top.text, meas: false}); }
    return out.filter(x => x.text); };
  /* Что справочник знает о технологии: по связанным темам — условия и ошибки (текст целиком) и пункты приёмки (разобранные). */
  K.workInfo = (kb, techId) => K.forTech(kb, techId).map(t => ({topic: t, cond: t.sections.cond || '', errors: t.sections.errors || '', accept: K.items(t.sections.accept || '').map(x => Object.assign({topicId: t.id}, x))}));

  /* --- безопасный показ текста заметок: всё экранируется, поддерживаются заголовки, списки (вложенные), таблицы, **жирный**, _курсив_, `код`, ссылки --- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const fmt = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const inline = s => String(s).split(/(https?:\/\/[^\s<>"]+)/).map((p, i) => i % 2 ? '<a href="' + esc(p) + '" target="_blank" rel="noopener">' + esc(p) + '</a>' : fmt(p)).join('');
  K.html = text => {
    const lines = String(text || '').replace(/\r/g, '').replace(/\t/g, '    ').split('\n'), out = []; let stack = [], para = [];
    const closeLists = () => { while (stack.length) out.push('</li></' + stack.pop().tag + '>'); };
    const flush = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
    for (let i = 0; i < lines.length; i++) { const raw = lines[i], line = raw.replace(/\s+$/, ''); let m;
      if (!line.trim()) { flush(); closeLists(); continue; }
      if ((m = /^\s*(#{1,6})\s+(.*)$/.exec(line))) { flush(); closeLists(); out.push('<h4>' + inline(m[2]) + '</h4>'); continue; }
      if (/^\s*-{3,}\s*$/.test(line)) { flush(); closeLists(); out.push('<hr>'); continue; }
      if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) { flush(); closeLists(); const rows = []; let j = i; while (j < lines.length && /^\s*\|/.test(lines[j])) rows.push(lines[j++]); i = j - 1;
        const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        out.push('<table class=kbt><tr>' + cells(rows[0]).map(c => '<th>' + inline(c) + '</th>').join('') + '</tr>' + rows.slice(2).map(r => '<tr>' + cells(r).map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</table>'); continue; }
      if ((m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line))) { flush(); const ind = m[1].length, tag = /\d/.test(m[2]) ? 'ol' : 'ul';
        while (stack.length && ind < stack[stack.length - 1].ind) out.push('</li></' + stack.pop().tag + '>');
        if (stack.length && ind === stack[stack.length - 1].ind) out.push('</li><li>'); else { out.push('<' + tag + '><li>'); stack.push({ind, tag}); }
        out.push(inline(m[3])); continue; }
      if (stack.length && /^\s/.test(raw)) { out.push('<br>' + inline(line.trim())); continue; }
      closeLists(); para.push(line.trim()); }
    flush(); closeLists(); return out.join('');
  };

  /* --- хранение (отдельно от проекта) --- */
  K.load = ls => { const raw = ls.getItem(K.KEY); return raw ? K.parse(raw) : K.empty(); };   // при повреждении бросает ошибку, данные не тронуты
  K.save = (ls, kb, o = {}) => { if (!o.keepStamp) kb.updated = Date.now(); try { ls.setItem(K.KEY, JSON.stringify(kb)); return {ok: true}; } catch (e) { return {ok: false, error: e.message}; } };
  K.snaps = ls => { try { const a = JSON.parse(ls.getItem(K.SNAPKEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  /* Копия перед разрушающим действием (замена из файла/облака, удаление ветки). При нехватке места старые копии выбрасываются, а не данные. */
  K.snap = (ls, kb, now = Date.now()) => { if (!kb.topics.length) return false; const arr = K.snaps(ls); arr.push({t: now, d: JSON.stringify(kb)}); while (arr.length > K.MAX_SNAPS) arr.shift();
    while (arr.length) { try { ls.setItem(K.SNAPKEY, JSON.stringify(arr)); return true; } catch (e) { arr.shift(); } } return false; };
  K.snapData = (ls, i) => { const x = K.snaps(ls)[i]; if (!x) throw new Error('копия справочника не найдена'); return K.parse(x.d); };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
