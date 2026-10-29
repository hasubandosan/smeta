/* Связка планировщика с проектом (CAD_CONTRACT §6): принять геометрию из SM.planner → проверить → применить → согласовать поверхности. Без DOM.
   SM.geolink.apply(S, geometry) меняет S.object.geometry атомарно: при отказе проект не меняется. Точку отката и сохранение делает вызывающий (UI). */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, G = SM.geolink = {}, M = SM.model;
  const clone = x => JSON.parse(JSON.stringify(x));

  // Чем занято помещение (то, что потеряется или повиснет, если его убрать): работы в плане, маршруты, цели, состояние, наблюдения
  G.roomUse = (S, roomId) => { const o = S.object, sid = new Set(o.surfaces.filter(s => s.roomId === roomId).map(s => s.id)), mine = id => id === roomId || sid.has(id), out = [];
    const nPlan = (S.plan || []).filter(x => x.roomId === roomId).length, nRoutes = (S.routes || []).filter(x => x.roomId === roomId).length;
    const nGoals = o.goals.filter(x => mine(x.target)).length, nObs = o.observations.filter(x => mine(x.target)).length;
    const nState = Object.keys(o.state).filter(k => sid.has(k.slice(0, k.indexOf('.')))).length;
    if (nPlan) out.push('работ в плане: ' + nPlan); if (nRoutes) out.push('маршрутов: ' + nRoutes); if (nGoals) out.push('целей: ' + nGoals); if (nState) out.push('отметок состояния: ' + nState); if (nObs) out.push('наблюдений: ' + nObs);
    const nBox = o.surfaces.filter(s => s.roomId === roomId && s.kind === 'box').length; if (nBox) out.push('коробов: ' + nBox);
    const nLay = o.surfaces.filter(s => s.roomId === roomId).reduce((n, s) => n + (s.layers || []).length, 0); if (nLay) out.push('слоёв отделки: ' + nLay);
    return out; };

  // → {ok, message?, removedRooms, addedRooms, surfaces:{added,removed,orphaned}}
  G.apply = (S, g) => {
    const o = S.object, old = o.geometry, v = SM.geo.validate(g);
    if (!v.ok) { const e = v.issues.find(x => x.level === 'error'); return {ok: false, message: 'Геометрия не проходит проверку: ' + (e ? e.text : '?')}; }
    const oldIds = new Set(old.rooms.map(r => r.id)), newIds = new Set(g.rooms.map(r => r.id)), removed = [...oldIds].filter(id => !newIds.has(id)), added = [...newIds].filter(id => !oldIds.has(id));
    for (const id of removed) { const use = G.roomUse(S, id); if (use.length) { const r = old.rooms.find(x => x.id === id); return {ok: false, message: 'Помещение «' + (r.name || id) + '» нельзя убрать: у него есть данные (' + use.join(', ') + '). Сначала уберите их.'}; } }
    const ng = clone(g), pairs = SM.walls ? SM.walls.syncPairs(old, ng) : {changes: [], notes: []}; o.geometry = ng;
    o.surfaces = o.surfaces.filter(s => !removed.includes(s.roomId));      // у убранного помещения данных нет (проверено выше) — поверхности не нужны
    const sync = M.syncSurfaces(o); if (SM.walls) SM.walls.ensureTypes(S);
    return {ok: true, removedRooms: removed, addedRooms: added, surfaces: sync, pairs: pairs};
  };
  G.same = (S, g) => JSON.stringify(S.object.geometry) === JSON.stringify(g);
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = globalThis.SM;
