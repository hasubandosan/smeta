/* Паузы между процессами (Фаза 13). Без DOM.
   pause = {id, afterId, beforeId, minDays, maxDays, note}: процесс beforeId — не раньше чем через minDays и не позже чем через maxDays после afterId.
   Числа вводит человек; из текста справочника они не берутся (D27, D32). Пустое = неизвестно (null), а не 0. */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, P = SM.pauses = {};
  const num = v => { if (v === null || v === undefined || String(v).trim() === '') return null; const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) && n >= 0 ? n : null; };
  P.num = num;
  P.forProcess = (S, pid) => (S.pauses || []).filter(p => p.beforeId === pid || p.afterId === pid);

  /* Время и порядок шагов маршрута (steps в порядке выполнения). Время работ в данных пока не хранится: считаются только паузы.
     Возвращает {steps:[{i, processId, earliest, latest}], minDays, maxDays, warnings, unknown}.
     earliest/latest — день от старта первого шага; null = неизвестно (у нужной паузы не заполнены дни). */
  P.schedule = (S, steps) => { const list = (steps || []).filter(s => s.processId), pauses = S.pauses || [], out = [], warnings = [], unknown = [];
    const idx = new Map(); list.forEach((s, i) => { if (!idx.has(s.processId)) idx.set(s.processId, i); });
    const name = id => { const p = ((S.library || {}).processes || []).find(x => x.id === id); return p ? p.name : id; };
    list.forEach((s, i) => { let lo = 0, hi = 0, loU = false, hiU = false;
      for (const p of pauses) { if (p.beforeId !== s.processId || !idx.has(p.afterId)) continue; const j = idx.get(p.afterId);
        if (j >= i) { warnings.push('«' + name(s.processId) + '» стоит раньше «' + name(p.afterId) + '», а должен идти после'); continue; }
        const a = out[j], mn = num(p.minDays), mx = num(p.maxDays);
        if (mn === null) { loU = true; unknown.push(name(p.afterId) + ' → ' + name(s.processId)); } else if (a.earliest !== null) lo = Math.max(lo, a.earliest + mn); else loU = true;
        if (mx === null || a.latest === null) hiU = true; else hi = Math.max(hi, a.latest + mx); }
      out.push({i, processId: s.processId, earliest: loU ? null : lo, latest: hiU ? null : hi}); });
    const last = out.length ? out[out.length - 1] : null;
    return {steps: out, minDays: last ? last.earliest : 0, maxDays: last ? last.latest : 0, warnings: [...new Set(warnings)], unknown: [...new Set(unknown)]}; };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
