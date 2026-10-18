/* Подтверждение норм (Фаза 13). Без DOM.
   Строки норм берутся из раздела «Инструменты, материалы и нормы расхода» связанных тем справочника (только показ, D27).
   В расчёты ничего не подставляется: расход и цену вводит человек в технологии, пока пусто — неизвестно (null).
   Отметка «подтверждено» хранится в проекте: S.normOk = {techId: {ключ строки: true}}. Это только отметка человека. */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, N = SM.norms = {};
  const key = text => String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const blank = v => v === null || v === undefined || String(v).trim() === '';
  N.key = key;

  /* Строки норм технологии из связанных тем справочника, без дублей. */
  N.lines = (kb, techId) => { const seen = new Set(), out = [];
    for (const w of SM.kb.forTech(kb, techId)) for (const x of SM.kb.items(w.sections.tools || '')) { const k = key(x.text); if (!k || seen.has(k)) continue; seen.add(k); out.push({key: k, topicId: w.id, group: x.group, text: x.text}); }
    return out; };

  N.isOk = (S, techId, k) => !!((S.normOk || {})[techId] || {})[k];
  N.set = (S, techId, k, on) => { S.normOk = S.normOk || {}; const m = S.normOk[techId] = S.normOk[techId] || {};
    if (on) m[k] = true; else delete m[k]; if (!Object.keys(m).length) delete S.normOk[techId]; };
  /* Подтвердить/снять все строки сразу. */
  N.setAll = (S, kb, techId, on) => { for (const l of N.lines(kb, techId)) N.set(S, techId, l.key, on); };

  /* Отчёт по технологии: строки с отметками, счётчик «подтверждено X из Y», операции с тем, что задано и что неизвестно. */
  N.report = (S, kb, tech) => { const lines = N.lines(kb, tech.id).map(l => Object.assign({ok: N.isOk(S, tech.id, l.key)}, l)), mats = new Map((S.materials || []).map(m => [m.id, m]));
    const ops = (tech.ops || []).map(op => ({id: op.id, name: op.name, unit: op.unit, priceUnknown: blank(op.price), qtyUnknown: blank(op.qty),
      mats: (op.mats || []).map(m => { const mat = mats.get(m.matId); return {id: m.id, matId: m.matId, name: mat ? mat.name : '(не выбран)', rateUnknown: blank(m.rate), priceUnknown: !mat || blank(mat.price), packUnknown: !mat || blank(mat.packQty)}; })}));
    const unknown = ops.reduce((n, o) => n + (o.priceUnknown ? 1 : 0) + o.mats.reduce((k, m) => k + (m.rateUnknown ? 1 : 0), 0), 0);
    return {lines, total: lines.length, done: lines.filter(l => l.ok).length, ops, unknown}; };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
