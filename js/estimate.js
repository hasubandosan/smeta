/* Расчёт: план работ → операции → объёмы, работа, материалы (потребность), закупка. Без DOM.
   S = {object, techs:[{id,name,params:[{key,def}],ops:[{id,name,unit,price,qty,mats:[{id,matId,rate}]}]}],
        materials:[{id,name,unit,packQty,price}], plan:[{id,techId,roomId,values}], fin:{waste,reserve}, bought:{matId:qty}} */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, num = v => (SM.isUnknown(v) ? 0 : +v);
  const E = SM.est = {};
  E.vars = (S, item, tech) => {
    const o = S.object, room = o.geometry.rooms.find(r => r.id === item.roomId), V = {};
    if (room) { const d = SM.geo.deriveRoom(o.geometry, room); Object.assign(V, {floor: d.floor, ceiling: d.ceiling, perimeter: d.perimeter, walls: d.wallArea, height: room.height});
      V.box = o.surfaces.filter(s => s.kind === 'box' && s.roomId === room.id).reduce((a, s) => a + 2 * (s.w + s.l) * s.h, 0) || null; }
    for (const p of tech.params || []) V[p.key] = p.def;
    return Object.assign(V, item.values || {});
  };
  E.compute = S => {
    const rows = [], need = new Map(), f = S.fin || {};
    for (const item of S.plan) { const tech = S.techs.find(t => t.id === item.techId); if (!tech) continue; const V = E.vars(S, item, tech);
      for (const op of tech.ops) {
        const q = SM.evalExpr(op.qty, V), row = {item, tech, op, q: q.ok ? q.value : null, missing: q.unknown || [], error: q.error, work: null, mats: []};
        if (q.ok) row.work = q.value * num(op.price);
        for (const m of op.mats || []) { const r = SM.evalExpr(m.rate, V), n = q.ok && r.ok ? q.value * r.value : null;
          row.mats.push({matId: m.matId, need: n, missing: (r.unknown || []).concat(q.unknown || []), error: r.error});
          if (!need.has(m.matId)) need.set(m.matId, {base: 0, unknown: false}); const a = need.get(m.matId); if (n === null) a.unknown = true; else a.base += n; }
        rows.push(row);
      } }
    const buy = [...need].map(([id, a]) => { const m = S.materials.find(x => x.id === id) || {name: '(удалён)', unit: ''};
      const waste = a.base * num(f.waste) / 100, reserve = (a.base + waste) * num(f.reserve) / 100, total = a.base + waste + reserve, have = num((S.bought || {})[id]), rest = Math.max(0, total - have);
      const packs = +m.packQty > 0 ? SM.packs(rest, m.packQty) : null;
      return {id, m, base: a.base, waste, reserve, total, have, rest, packs, cost: packs !== null && !SM.isUnknown(m.price) ? packs * m.price : null, incomplete: a.unknown}; });
    const work = rows.reduce((s, r) => s + (r.work || 0), 0), mat = buy.reduce((s, b) => s + (b.cost || 0), 0);
    const sub = work + mat, overhead = sub * num(f.overhead) / 100, afterOv = sub + overhead, discount = afterOv * num(f.discount) / 100, vat = (afterOv - discount) * num(f.vat) / 100;
    return {rows, buy, work, mat, total: sub, sub, overhead, discount, vat, grand: afterOv - discount + vat, incomplete: rows.some(r => r.q === null) || buy.some(b => b.incomplete || b.cost === null)};
  };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
