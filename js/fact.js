/* Факт выполнения и снимок утверждённой сметы. Без DOM. Смета (SM.est.compute) факт НЕ меняет: смета ≠ источник истины.
   item.fact = {ops: {opId: {qty, cost}}, mats: {matId: израсходовано}}; не указано = null (неизвестно), а не 0.
   S.approved = [{id, t, name, ...}] — неизменяемые снимки утверждённых смет (только добавляются). */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, F = SM.fact = {};
  const unk = v => v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v));
  const num = v => { if (unk(v)) return null; if (!(+v >= 0)) throw new Error('Факт не может быть отрицательным или не числом'); return +v; };
  const started = item => (item.status || 'PLANNED') !== 'PLANNED';
  const guard = item => { if (!started(item)) throw new Error('Факт вносится после начала работы'); if (item.status === 'ACCEPTED') throw new Error('Работа принята — факт закрыт'); item.fact = item.fact || {ops: {}, mats: {}}; item.fact.ops = item.fact.ops || {}; item.fact.mats = item.fact.mats || {}; };

  F.setOp = (item, opId, field, v) => { if (field !== 'qty' && field !== 'cost') throw new Error('поле факта: qty или cost'); guard(item);
    const o = item.fact.ops[opId] = item.fact.ops[opId] || {qty: null, cost: null}; o[field] = num(v); return item; };
  F.setMat = (item, matId, v) => { guard(item); item.fact.mats[matId] = num(v); return item; };

  /* План против факта по начатым работам. Итог факта считает только известное и честно говорит, чего не хватает. */
  F.report = S => {
    const R = SM.est.compute(S); let factWork = 0, planWork = 0, missing = 0, known = 0;
    const items = S.plan.filter(started).map(item => { const tech = (SM.ver ? SM.ver.resolve(S, item) : S.techs.find(t => t.id === item.techId)); if (!tech) return null;
      const f = item.fact || {ops: {}, mats: {}}, done = item.status === 'COMPLETED' || item.status === 'ACCEPTED';
      const ops = tech.ops.map(op => { const row = R.rows.find(r => r.item === item && r.op === op), pq = row ? row.q : null, pw = row ? row.work : null, fo = (f.ops || {})[op.id] || {}, fq = unk(fo.qty) ? null : fo.qty, fc = unk(fo.cost) ? null : fo.cost;
        if (pw !== null) planWork += pw; if (fc !== null) { factWork += fc; known++; } else if (done) missing++;
        return {op, planQty: pq, planWork: pw, factQty: fq, factCost: fc, dQty: pq !== null && fq !== null ? fq - pq : null, dCost: pw !== null && fc !== null ? fc - pw : null}; });
      const mats = []; for (const op of tech.ops) for (const m of op.mats || []) if (!mats.some(x => x.matId === m.matId)) {
        const need = R.rows.filter(r => r.item === item).flatMap(r => r.mats).filter(x => x.matId === m.matId); const ns = need.length && need.every(x => x.need !== null) ? need.reduce((a, x) => a + x.need, 0) : null;
        const u = (f.mats || {})[m.matId]; mats.push({matId: m.matId, mat: S.materials.find(x => x.id === m.matId), planNeed: ns, used: unk(u) ? null : u}); }
      return {item, tech, status: item.status, ops, mats}; }).filter(Boolean);
    return {items, factWork, planWork, costKnown: known, costMissing: missing, incomplete: missing > 0};
  };

  /* Закупки: куплено / израсходовано / остаток. Неизвестное остаётся null. over = израсходовано больше, чем куплено. */
  F.stock = S => { const R = SM.est.compute(S), ids = new Set(R.buy.map(b => b.id)), used = new Map();
    for (const it of S.plan) for (const [id, v] of Object.entries((it.fact || {}).mats || {})) { ids.add(id); if (!unk(v)) used.set(id, (used.get(id) || 0) + v); }
    return [...ids].map(id => { const b = R.buy.find(x => x.id === id), m = S.materials.find(x => x.id === id) || {name: '(удалён)', unit: ''}, bo = (S.bought || {})[id], have = unk(bo) ? null : +bo, u = used.has(id) ? used.get(id) : null;
      return {id, m, planned: b ? b.total : null, have, used: u, left: have !== null && u !== null ? have - u : null, over: have !== null && u !== null && u > have}; }); };

  /* Снимок утверждённой сметы: копия значений на момент утверждения; дальнейшие правки сметы его не меняют. */
  F.approve = (S, name) => { const R = SM.est.compute(S), t = Date.now();
    const snap = {id: SM.uid(), t, name: String(name || '').trim() || 'Смета от ' + new Date(t).toLocaleDateString('ru-RU'), work: R.work, mat: R.mat, grand: R.grand, incomplete: R.incomplete,
      rows: R.rows.map(r => ({techId: r.tech.id, opId: r.op.id, roomId: r.item.roomId, name: r.tech.name + ' › ' + r.op.name, unit: r.op.unit, q: r.q, work: r.work})),
      buy: R.buy.map(b => ({matId: b.id, name: b.m.name, unit: b.m.unit, total: b.total, packs: b.packs, cost: b.cost}))};
    (S.approved = S.approved || []).push(snap); return snap; };
  const key = r => r.techId + '|' + r.opId + '|' + r.roomId;
  F.compare = (S, snap) => { const R = SM.est.compute(S), cur = R.rows.map(r => ({techId: r.tech.id, opId: r.op.id, roomId: r.item.roomId, name: r.tech.name + ' › ' + r.op.name, q: r.q, work: r.work})), changes = [];
    for (const c of cur) { const o = snap.rows.find(x => key(x) === key(c)); if (!o) changes.push({kind: 'added', name: c.name, to: c.work}); else if (o.q !== c.q || o.work !== c.work) changes.push({kind: 'changed', name: c.name, fromQ: o.q, toQ: c.q, from: o.work, to: c.work}); }
    for (const o of snap.rows) if (!cur.some(c => key(c) === key(o))) changes.push({kind: 'removed', name: o.name, from: o.work});
    const d = (a, b) => (a === null || b === null || undefined === a || undefined === b ? null : b - a);
    return {dWork: d(snap.work, R.work), dMat: d(snap.mat, R.mat), dGrand: d(snap.grand, R.grand), changes, comparable: !snap.incomplete && !R.incomplete}; };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
