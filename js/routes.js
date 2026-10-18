/* Сравнение маршрутов: полный путь решения задачи, а не локальная цена. Без DOM.
   route = {id, name, roomId, steps:[{processId, techId?}], assume:[{kind, layer, value}], note?}
   Шаги и допущения применяются к КОПИИ объекта (реальное состояние не меняется); затем считается цена шагов + цена
   оставшихся пунктов плана, которые после маршрута ещё нужны. Порядок шагов и паузы между процессами (`SM.pauses`, `S.pauses`) учитываются в `time`; время самих работ в данных не хранится. */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, M = SM.model, R = SM.routes = {};
  const apply = (o, roomId, kind, layer, value) => o.surfaces.filter(s => s.roomId === roomId && s.kind === kind).forEach(s => M.setState(o, s.id, layer, value));

  R.compare = (S, route) => {
    const lib = S.library, rid = route.roomId, clone = JSON.parse(JSON.stringify(S.object)), items = [];
    (route.steps || []).forEach((st, i) => { const p = lib.processes.find(x => x.id === st.processId); if (!p) return;
      for (const e of p.effects) apply(clone, rid, p.surface, e.layer, SM.rules.effVal(e));
      if (st.techId) items.push({id: 'route:' + i, techId: st.techId, roomId: rid, processId: st.processId, values: {}}); });
    for (const a of route.assume || []) if (a.layer) apply(clone, rid, a.kind, a.layer, a.value);
    const after = SM.rules.plan(clone, lib, rid), status = new Map(after.items.map(i => [i.id, i.status]));
    const covered = new Set((route.steps || []).map(s => s.processId));
    const down = S.plan.filter(p => p.roomId === rid && !(p.processId && (covered.has(p.processId) || status.get(p.processId) === 'DONE')));
    const E = SM.est.compute(Object.assign({}, S, {plan: items.concat(down)}));
    return {route, work: E.work, mat: E.mat, grand: E.grand, incomplete: E.incomplete, steps: (route.steps || []).length,
      ready: after.items.filter(i => i.status === 'READY').map(i => i.name), blocked: after.items.filter(i => i.status === 'BLOCKED').length,
      questions: after.questions.length, time: SM.pauses ? SM.pauses.schedule(S, route.steps) : null};
  };
  // compareAll -> результаты по маршрутам помещения; best — самый дешёвый среди полностью посчитанных (иначе null)
  R.compareAll = (S, roomId) => {
    const res = (S.routes || []).filter(r => r.roomId === roomId).map(r => R.compare(S, r)), full = res.filter(x => !x.incomplete);
    const best = full.length > 1 ? full.reduce((a, b) => (b.grand < a.grand ? b : a)) : null;
    return {results: res, best: best ? best.route.id : null};
  };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
