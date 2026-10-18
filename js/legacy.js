/* Перенос технологий и материалов из старого приложения (stroysmeta:v3) в новую модель. Старые данные не меняются. */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {};
  // состав (материалы и композиты) → плоский список материалов с формулой расхода
  const flatOf = (old, comps, mult, seen) => (comps || []).flatMap(c => {
    const r = String(c.rate == null ? '' : c.rate).trim() || '0', rate = mult ? '(' + mult + ')*(' + r + ')' : r;
    if (c.refType === 'composite') { const comp = (old.composites || []).find(x => x.id === c.refId); return comp && !seen.has(c.refId) ? flatOf(old, comp.components, rate, new Set(seen).add(c.refId)) : []; }
    return [{id: SM.uid(), matId: c.refId, rate}]; });
  const pnum = v => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) && x > 0 ? x : null; };   // 0 / пусто в старом приложении = «не задано» → null (неизвестно)
  const AUTO = ['floor', 'ceiling', 'walls', 'perimeter'];
  SM.legacy = {
    // Список объектов старого приложения для показа: что в них есть.
    objects(old) { return (old.objects || []).map(o => ({id: o.id, name: o.name || 'Без названия', rooms: (o.rooms || []).length, stages: Object.keys(o.sel || {}).length, extras: (o.extra || []).length})); },

    /* Перенос одного объекта старого приложения в ТЕКУЩИЙ проект (добавляет, ничего не удаляет и не меняет у существующих данных).
       Помещения → геометрия (прямоугольник из 4 стен) + поверхности; выбранные этапы → пункты плана по помещениям (с учётом «выбранных помещений»,
       ручного объёма и невыбранных шагов); доп. позиции → отдельная технология. Повторный перенос того же объекта ничего не дублирует.
       Возвращает отчёт {rooms, items, techs, materials, skipped:[{name, reason}], notes:[]}. */
    importObject(old, oo, S) {
      const rep = {rooms: 0, items: 0, techs: 0, materials: 0, skipped: [], notes: []}, uid = SM.uid;
      const stages = old.stages || [], byId = id => stages.find(s => s.id === id), kids = id => stages.filter(s => (s.parentId || '') === (id || ''));
      const cv = SM.legacy.convert(old, S); S.materials.push(...cv.materials); S.techs.push(...cv.techs); rep.techs = cv.techs.length; rep.materials = cv.materials.length;

      // --- помещения ---
      const g = S.object.geometry, oldRooms = oo.rooms || [], noRooms = !oldRooms.length, rmap = new Map();
      const surf = (nr, kind, name, wallId) => S.object.surfaces.push({id: uid(), roomId: nr.id, kind, name, wallId: wallId || null});
      if (noRooms) { let nr = g.rooms.find(x => x.legacyId === 'obj:' + oo.id);
        if (!nr) { nr = {id: uid(), name: 'Объект целиком: ' + (oo.name || ''), height: null, wallIds: [], legacyId: 'obj:' + oo.id, legacyObjectId: oo.id}; g.rooms.push(nr); rep.rooms++;
          rep.notes.push('В старом объекте нет помещений: создано одно «помещение» без стен, площади берутся из значений объекта. Заполните геометрию, когда будут размеры.'); }
        rmap.set('*', nr); }
      for (const r of oldRooms) { let nr = g.rooms.find(x => x.legacyId === r.id);
        if (!nr) { const l = pnum(r.l), w = pnum(r.w), h = pnum(r.h);
          const ws = [[l, 'Стена 1'], [w, 'Стена 2'], [l, 'Стена 3'], [w, 'Стена 4']].map(([len, name]) => ({id: uid(), name, len, turn: 90, material: ''}));
          g.walls.push(...ws); nr = {id: uid(), name: r.name || 'Помещение', height: h, wallIds: ws.map(x => x.id), legacyId: r.id, legacyObjectId: oo.id}; g.rooms.push(nr);
          const op = pnum(r.open); if (op) g.openings.push({id: uid(), roomId: nr.id, wallId: null, kind: 'проёмы (общая площадь из старого приложения)', w: null, h: null, area: op});
          surf(nr, 'floor', 'Пол'); surf(nr, 'ceiling', 'Потолок'); ws.forEach(w => surf(nr, 'wall', w.name, w.id)); rep.rooms++;
          if (!l || !w || !h) rep.notes.push('«' + nr.name + '»: не заданы длина/ширина/высота — в новом приложении они «неизвестно», площади не считаются.'); }
        rmap.set(r.id, nr); }

      // --- выбранные этапы → пункты плана ---
      const sel = oo.sel || {}, pick = oo.pick || {}, inc = [];
      const walk = pid => { const parent = pid ? byId(pid) : null; let list = kids(pid); if (parent && parent.mode === 'choice') list = list.filter(x => x.id === pick[pid]);
        for (const s of list) { if (!sel[s.id]) continue; inc.push(s); walk(s.id); } };
      walk('');
      const techOf = s => S.techs.find(t => t.legacyId === s.id) || S.techs.find(t => t.legacyId === s.parentId);
      const opOf = (t, s) => t.ops.find(o => o.legacyId === s.id) || t.ops.find(o => o.name === s.name);
      const groups = new Map();
      for (const s of inc) { if (!s.unit) continue;
        if (kids(s.id).length) { rep.skipped.push({name: s.name, reason: 'этап с вложенными шагами и своей единицей: в новой модели берутся только шаги'}); continue; }
        const t = techOf(s), op = t && opOf(t, s); if (!t || !op) { rep.skipped.push({name: s.name, reason: 'для этапа нет технологии в новом приложении'}); continue; }
        const ids = ((sel[s.id] || {}).rooms || []).filter(i => rmap.has(i)), q = (sel[s.id] || {}).q, gr = groups.get(t.id) || {tech: t, ops: []};
        gr.ops.push({op, rooms: ids.length ? new Set(ids) : null, q: q !== undefined && String(q).trim() !== '' ? String(q).trim() : null}); groups.set(t.id, gr); }
      const exists = (techId, roomId) => S.plan.some(p => p.techId === techId && p.roomId === roomId && p.legacyObjectId === oo.id);
      const mkItem = (tech, nr, skip, opQty, values) => { const it = {id: uid(), techId: tech.id, roomId: nr.id, values, legacyObjectId: oo.id};
        if (Object.keys(skip).length) it.skipOps = skip; if (Object.keys(opQty).length) it.opQty = opQty;
        S.plan.push(it); if (SM.ver) SM.ver.pin(S, it); rep.items++; return it; };
      const rooms = noRooms ? ['*'] : oldRooms.map(r => r.id), ov = oo.values || {};
      for (const {tech, ops} of groups.values()) { const qUsed = new Set();
        const values = {}; for (const p of tech.params || []) { const v = ov[p.key]; if (v !== undefined && String(v).trim() !== '' && isFinite(parseFloat(String(v).replace(',', '.')))) values[p.key] = parseFloat(String(v).replace(',', '.')); }
        if (noRooms) for (const k of AUTO) if (ov[k] !== undefined && String(ov[k]).trim() !== '') values[k] = parseFloat(String(ov[k]).replace(',', '.'));
        for (const rid of rooms) { const apps = ops.filter(a => !a.rooms || a.rooms.has(rid)); if (!apps.length) continue; const nr = rmap.get(rid); if (exists(tech.id, nr.id)) continue;
          const skip = {}, opQty = {};
          for (const op of tech.ops) { const a = apps.find(x => x.op === op); if (!a) { skip[op.id] = true; continue; }
            if (a.q !== null) { if (qUsed.has(op.id)) skip[op.id] = true; else { opQty[op.id] = a.q; qUsed.add(op.id); } } }
          mkItem(tech, nr, skip, opQty, Object.assign({}, values)); } }

      // --- дополнительные позиции объекта ---
      const ex = oo.extra || [], first = rmap.get(rooms[0]);
      if (ex.length && first && !S.techs.some(t => t.legacyId === 'extra:' + oo.id)) {
        const ops = [], oneOf = (name, unit, price, qty, mats) => ops.push({id: uid(), name, unit: unit || '', price, qty: String(qty == null ? '' : qty), mats: mats || [], notes: []});
        for (const e of ex) { const qty = e.qty, hasVar = /[\p{L}_]/u.test(String(qty == null ? '' : qty));
          if (hasVar) rep.notes.push('Доп. позиция «' + (e.name || '?') + '»: объём — формула; в новом приложении считается по первому помещению.');
          if (e.type === 'custom') { const price = e.price === '' || e.price == null ? null : +e.price;
            if (e.category === 'labor') oneOf(e.name, e.unit, price, qty);
            else { const m = {id: uid(), name: e.name, unit: e.unit || '', packQty: 1, price, category: e.category}; S.materials.push(m); rep.materials++; oneOf(e.name, e.unit, null, qty, [{id: uid(), matId: m.id, rate: '1'}]);
              rep.notes.push('Доп. материал «' + e.name + '»: цена за единицу перенесена как цена упаковки 1 шт — закупка округляется вверх до целых.'); } }
          else if (e.type === 'material') { const m = S.materials.find(x => x.id === e.refId); if (!m) { rep.skipped.push({name: '(материал удалён)', reason: 'доп. позиция ссылается на отсутствующий материал'}); continue; } oneOf(m.name, m.unit, null, qty, [{id: uid(), matId: m.id, rate: '1'}]); }
          else if (e.type === 'composite') { const c = (old.composites || []).find(x => x.id === e.refId); if (!c) { rep.skipped.push({name: '(композит удалён)', reason: 'доп. позиция ссылается на отсутствующий композит'}); continue; } oneOf(c.name, c.unit, null, qty, flatOf(old, c.components, '', new Set([c.id]))); }
          else rep.skipped.push({name: e.name || '?', reason: 'неизвестный тип дополнительной позиции'}); }
        if (ops.length) { const t = {id: uid(), legacyId: 'extra:' + oo.id, name: 'Дополнительно: ' + (oo.name || 'объект'), params: [], ops}; S.techs.push(t); rep.techs++; mkItem(t, first, {}, {}, {}); } }

      // --- накладные, скидка, НДС, запас ---
      const f = oo.fin || {}, want = ['reserve', 'overhead', 'discount', 'vat'].filter(k => +f[k]);
      if (want.length) { S.fin = S.fin || {}; const empty = ['reserve', 'overhead', 'discount', 'vat'].every(k => !+S.fin[k]);
        if (empty) want.forEach(k => { S.fin[k] = +f[k]; }); else rep.notes.push('Проценты из старого объекта (' + want.map(k => k + ' ' + f[k] + '%').join(', ') + ') не перенесены: в проекте уже заданы свои.'); }
      return rep;
    },

    // old: объект старого S. Возвращает {techs, materials}; повторный вызов с existing не создаёт дублей (по legacyId).
    convert(old, existing) {
      const ex = existing || {techs: [], materials: []}, stages = old.stages || [], byId = (a, id) => (a || []).find(x => x.id === id);
      const kids = id => stages.filter(s => (s.parentId || '') === (id || '')), AUTO = ['floor', 'ceiling', 'walls', 'perimeter'];
      const materials = (old.materials || []).filter(m => !ex.materials.some(x => x.id === m.id)).map(m => ({id: m.id, name: m.name, unit: m.unit, packQty: m.packQty || null, price: m.price || null, category: m.category}));
      const flat = (comps, mult, seen) => flatOf(old, comps, mult, seen);
      const toOp = s => ({id: SM.uid(), legacyId: s.id, name: s.name, unit: s.unit || '', price: s.price || null, qty: s.vol || '', mats: flat(s.components, '', new Set()), notes: s.notes || []});
      const techs = [], add = (node, names, ops) => {
        if (!ops.length || ex.techs.some(t => t.legacyId === node.id) || techs.some(t => t.legacyId === node.id)) return;
        const txt = ops.map(o => o.qty + ' ' + o.mats.map(m => m.rate).join(' ')).join(' ');
        techs.push({id: SM.uid(), legacyId: node.id, name: names.join(' › '),
          params: (old.params || []).filter(p => !AUTO.includes(p.key) && new RegExp('(^|[^\\p{L}\\d_])' + p.key + '([^\\p{L}\\d_]|$)', 'u').test(txt)).map(p => ({key: p.key, def: p.def})), ops});
      };
      const walk = (node, names) => {
        const ks = kids(node.id), leaves = ks.filter(k => !kids(k.id).length), inner = ks.filter(k => kids(k.id).length);
        if (!ks.length) { if (node.unit) add(node, names, [toOp(node)]); return; }
        if (node.mode === 'choice') leaves.forEach(l => l.unit && add(l, names.concat(l.name), [toOp(l)]));   // варианты — отдельные технологии
        else add(node, names, leaves.filter(l => l.unit).map(toOp));
        inner.forEach(k => walk(k, names.concat(k.name)));
      };
      kids('').forEach(r => walk(r, [r.name]));
      return {techs, materials};
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
