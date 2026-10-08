/* Перенос технологий и материалов из старого приложения (stroysmeta:v3) в новую модель. Старые данные не меняются. */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {};
  SM.legacy = {
    // old: объект старого S. Возвращает {techs, materials}; повторный вызов с existing не создаёт дублей (по legacyId).
    convert(old, existing) {
      const ex = existing || {techs: [], materials: []}, stages = old.stages || [], byId = (a, id) => (a || []).find(x => x.id === id);
      const kids = id => stages.filter(s => (s.parentId || '') === (id || '')), AUTO = ['floor', 'ceiling', 'walls', 'perimeter'];
      const materials = (old.materials || []).filter(m => !ex.materials.some(x => x.id === m.id)).map(m => ({id: m.id, name: m.name, unit: m.unit, packQty: m.packQty || null, price: m.price || null, category: m.category}));
      const flat = (comps, mult, seen) => (comps || []).flatMap(c => {
        const r = String(c.rate == null ? '' : c.rate).trim() || '0', rate = mult ? '(' + mult + ')*(' + r + ')' : r;
        if (c.refType === 'composite') { const comp = byId(old.composites, c.refId); return comp && !seen.has(c.refId) ? flat(comp.components, rate, new Set(seen).add(c.refId)) : []; }
        return [{id: SM.uid(), matId: c.refId, rate}]; });
      const toOp = s => ({id: SM.uid(), name: s.name, unit: s.unit || '', price: s.price || null, qty: s.vol || '', mats: flat(s.components, '', new Set()), notes: s.notes || []});
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
