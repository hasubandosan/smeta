/* Расчёт: план работ → операции → объёмы, работа, материалы (потребность), закупка. Без DOM.
   S = {object, techs:[{id,name,params:[{key,def}],ops:[{id,name,unit,price,qty,mats:[{id,matId,rate}]}]}],
        materials:[{id,name,unit,packQty,price}], plan:[{id,techId,roomId,values}], fin:{waste,reserve}, bought:{matId:qty}} */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, num = v => (SM.isUnknown(v) ? 0 : +v);
  const E = SM.est = {};
  // scopeIds — поверхности, на которые направлен процесс (из плана правил); null = всё помещение
  E.vars = (S, item, tech, scopeIds, mods) => {
    const o = S.object, room = o.geometry.rooms.find(r => r.id === item.roomId), V = {};
    if (room) { const d = SM.geo.deriveRoom(o.geometry, room); Object.assign(V, {floor: d.floor, ceiling: d.ceiling, perimeter: d.perimeter, walls: d.wallArea, height: room.height});
      V.box = o.surfaces.filter(s => s.kind === 'box' && s.roomId === room.id).reduce((a, s) => a + 2 * (s.w + s.l) * s.h, 0) || null; }
    // Работа на части стен: площадь только выбранных стен (net из геометрии). Проём без привязки к стене = неизвестно, на какую стену он приходится → площадь неизвестна, не угадывается.
    if (room && scopeIds) { const ws = o.surfaces.filter(s => s.roomId === room.id && s.kind === 'wall' && !s.orphan), pick = ws.filter(s => scopeIds.includes(s.id));
      if (pick.length && pick.length < ws.length) { const d = SM.geo.deriveRoom(o.geometry, room), loose = o.geometry.openings.some(x => !x.wallId && x.roomId === room.id);
        const nets = pick.map(s => (d.walls.find(w => w.id === s.wallId) || {}).net); V.walls = loose || nets.some(x => x === null || x === undefined) ? null : nets.reduce((a, b) => a + b, 0); } }
    for (const p of tech.params || []) V[p.key] = p.def;
    for (const m of mods || []) if (m.do === 'SET_VALUE') V[m.key] = SM.isUnknown(m.value) ? null : m.value;   // правило сильнее значения по умолчанию, но слабее явного ввода пользователя
    return Object.assign(V, item.values || {});
  };
  E.compute = S => {
    const rows = [], need = new Map(), f = S.fin || {}, skipped = [], cache = {};
    const planErrors = [], roomPlan = rid => { if (!S.library || !SM.rules) return null; if (rid in cache) return cache[rid];   // ошибка в данных правил не прячется: расчёт идёт без правил, но итог помечается неполным и ошибка показывается
      try { return (cache[rid] = SM.rules.plan(S.object, S.library, rid)); } catch (e) { cache[rid] = null; planErrors.push(e.message); return null; } };
    const planOf = item => { if (!item.processId) return null; const P = roomPlan(item.roomId); return P ? P.items.find(x => x.id === item.processId) || null : null; };
    const modsOf = item => { const P = roomPlan(item.roomId); return P ? P.modifiers.filter(m => m.process === null || m.process === item.processId) : []; };
    const isDone = item => { if (item.status && item.status !== 'PLANNED') return false; const it = planOf(item); return !!it && it.status === 'DONE'; };
    for (const item of S.plan) { const tech = (SM.ver ? SM.ver.resolve(S, item) : S.techs.find(t => t.id === item.techId)); if (!tech) continue; if (isDone(item)) { skipped.push(item.id); continue; } const mods = modsOf(item), V = E.vars(S, item, tech, (planOf(item) || {}).scope, mods);
      for (const op of tech.ops) {
        if ((item.skipOps || {})[op.id]) continue;      // операция не входит в этот пункт плана (перенос из старого приложения: часть шагов не выбрана)
        const qo = (item.opQty || {})[op.id], q = SM.evalExpr(qo !== undefined && qo !== '' ? qo : op.qty, V), missing = (q.unknown || []).slice(), applied = mods.filter(m => m.do === 'SET_VALUE').map(m => m.key + ' = ' + (SM.isUnknown(m.value) ? '?' : m.value) + ' — ' + m.because);
        let qv = q.ok ? q.value : null;   // правила MODIFY_QUANTITY: объём × k или + d; value неизвестно → объём неизвестен
        for (const m of mods.filter(x => x.do === 'MODIFY_QUANTITY')) { applied.push('объём ' + (m.mode === 'add' ? '+ ' : '× ') + (SM.isUnknown(m.value) ? '?' : m.value) + ' — ' + m.because);
          if (qv !== null) { if (SM.isUnknown(m.value)) { qv = null; missing.push('значение правила «' + m.because + '»'); } else qv = m.mode === 'add' ? qv + +m.value : qv * +m.value; } }
        const row = {item, tech, op, q: qv, missing, error: q.error, work: null, mats: [], applied};
        row.priceUnknown = qv !== null && qv !== 0 && SM.isUnknown(op.price); if (qv !== null) row.work = SM.isUnknown(op.price) ? (qv === 0 ? 0 : null) : qv * +op.price;   // неизвестная цена работы = неизвестно, не 0 (D3)
        for (const m of op.mats || []) { const r = SM.evalExpr(m.rate, V); let coef = 1, cmiss = [];
          for (const k of mods.filter(x => x.do === 'MODIFY_COEFFICIENT' && (!x.matId || x.matId === m.matId))) { applied.push('расход ' + ((S.materials.find(x => x.id === m.matId) || {}).name || '') + ' × ' + (SM.isUnknown(k.value) ? '?' : k.value) + ' — ' + k.because); if (SM.isUnknown(k.value)) cmiss.push('значение правила «' + k.because + '»'); else coef *= +k.value; }
          const n = qv !== null && r.ok && !cmiss.length ? qv * r.value * coef : null;
          row.mats.push({matId: m.matId, need: n, missing: (r.unknown || []).concat(missing, cmiss), error: r.error});
          if (!need.has(m.matId)) need.set(m.matId, {base: 0, unknown: false}); const a = need.get(m.matId); if (n === null) a.unknown = true; else a.base += n; }
        rows.push(row);
      } }
    const buy = [...need].map(([id, a]) => { const m = S.materials.find(x => x.id === id) || {name: '(удалён)', unit: ''};
      const waste = a.base * num(f.waste) / 100, reserve = (a.base + waste) * num(f.reserve) / 100, total = a.base + waste + reserve, have = num((S.bought || {})[id]), rest = Math.max(0, total - have);
      const packs = +m.packQty > 0 ? SM.packs(rest, m.packQty) : null;
      return {id, m, base: a.base, waste, reserve, total, have, rest, packs, cost: !a.unknown && packs !== null && !SM.isUnknown(m.price) ? packs * m.price : null, incomplete: a.unknown}; });
    const work = rows.reduce((s, r) => s + (r.work || 0), 0), mat = buy.reduce((s, b) => s + (b.cost || 0), 0);
    const sub = work + mat, overhead = sub * num(f.overhead) / 100, afterOv = sub + overhead, discount = afterOv * num(f.discount) / 100, vat = (afterOv - discount) * num(f.vat) / 100;
    return {planErrors, skipped, rows, buy, work, mat, total: sub, sub, overhead, discount, vat, grand: afterOv - discount + vat, incomplete: planErrors.length > 0 || rows.some(r => r.q === null || r.priceUnknown) || buy.some(b => b.incomplete || b.cost === null)};
  };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
