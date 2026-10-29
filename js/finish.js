/* Чистовые размеры (D46): черновые размеры (длины стен, высота — как введены) минус слои отделки. Без DOM.
   Режимы: 'rough' — как введено, 'now' — слои «есть сейчас» + «сделано», 'finish' — все слои (с запланированными).
   Стены: контур сдвигается внутрь на толщину слоёв каждой стены (углы сохраняются, меняются длины стен); пол и потолок: высота уменьшается на слои пола и потолка.
   Неизвестная толщина слоя → размеры комнаты «неизвестно» (null), а не 0. Хранится только черновое; чистовое всегда выводится (D36). */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, F = SM.finish = {}, unk = v => SM.isUnknown(v) || v === '';
  F.MODES = [['rough', 'Как введено'], ['now', 'Сейчас'], ['finish', 'Финиш']];
  F.statuses = mode => (mode === 'now' ? ['existing', 'done'] : mode === 'finish' ? null : []);     // null = все статусы; [] = ничего не вычитаем
  const clone = x => JSON.parse(JSON.stringify(x));

  // Длины стен после сдвига каждой стены внутрь на d[i]: смещённые прямые соседних стен пересекаются в новых вершинах
  function offsetLens(pts, d) {
    const n = pts.length, sa = pts.reduce((s, p, i) => { const q = pts[(i + 1) % n]; return s + p.x * q.y - q.x * p.y; }, 0), sg = sa >= 0 ? 1 : -1, u = [], nr = [];
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], l = Math.hypot(q.x - p.x, q.y - p.y); if (!(l > 1e-9)) return {issue: 'у стены нулевая длина'}; u[i] = {x: (q.x - p.x) / l, y: (q.y - p.y) / l}; nr[i] = sg > 0 ? {x: -u[i].y, y: u[i].x} : {x: u[i].y, y: -u[i].x}; }
    const P = i => ({x: pts[i].x + nr[i].x * d[i], y: pts[i].y + nr[i].y * d[i]}), v = [];
    for (let k = 0; k < n; k++) { const a = (k - 1 + n) % n, pa = P(a), pb = P(k), den = u[a].x * u[k].y - u[a].y * u[k].x;
      if (Math.abs(den) < 1e-9) { if (Math.abs(d[a] - d[k]) < 1e-12) v[k] = pb; else return {issue: 'соседние стены на одной прямой с разной отделкой'}; }
      else { const t = ((pb.x - pa.x) * u[k].y - (pb.y - pa.y) * u[k].x) / den; v[k] = {x: pa.x + t * u[a].x, y: pa.y + t * u[a].y}; } }
    const lens = []; for (let i = 0; i < n; i++) { const w = v[(i + 1) % n], l = (w.x - v[i].x) * u[i].x + (w.y - v[i].y) * u[i].y; if (!(l > 1e-9)) return {issue: 'слои отделки слишком толстые для помещения'}; lens[i] = l; }
    return {lens};
  }

  // Геометрия с чистовыми размерами для режима: {geometry, rooms:{roomId:{offsets:{wallId:м|null}, floor, ceiling, issues[]}}}; rough → копия без изменений
  F.geometry = (S, mode) => {
    const g = clone(S.object.geometry), out = {geometry: g, rooms: {}}, st = F.statuses(mode); if (mode === 'rough' || !SM.layers) return out;
    const total = surf => (surf ? SM.layers.total(S, surf, st) : {sum: 0, unknown: []}), kindSurf = (r, k) => S.object.surfaces.find(s => s.roomId === r.id && s.kind === k);
    for (const r of g.rooms) {
      const info = out.rooms[r.id] = {offsets: {}, floor: 0, ceiling: 0, issues: []}, poly = SM.geo.polygon(g, r), fl = total(kindSurf(r, 'floor')), cl = total(kindSurf(r, 'ceiling'));
      info.floor = fl.unknown.length ? null : fl.sum; info.ceiling = cl.unknown.length ? null : cl.sum;
      if (!poly.ok) { info.issues.push('контур помещения не замкнут — чистовые размеры не считаются'); continue; }
      const d = [], unknownWall = [];
      poly.walls.forEach((w, i) => { const t = total(S.object.surfaces.find(s => s.kind === 'wall' && s.wallId === w.id && !s.orphan)); if (t.unknown.length) { d[i] = null; unknownWall.push(w.name || w.id); } else d[i] = t.sum; info.offsets[w.id] = d[i]; });
      // высота: слои пола и потолка
      const dh = info.floor === null || info.ceiling === null ? null : info.floor + info.ceiling; if (dh === null) info.issues.push('у слоя пола или потолка неизвестна толщина — высота неизвестна');
      if (!unk(r.height)) r.height = dh === null ? null : +r.height - dh; for (const w of poly.walls) { const gw = g.walls.find(x => x.id === w.id); if (!unk(gw.height)) gw.height = dh === null ? null : +gw.height - dh; }
      if (unknownWall.length) { info.issues.push('у слоя стены неизвестна толщина (' + unknownWall.join(', ') + ') — размеры по стенам неизвестны'); poly.walls.forEach(w => { g.walls.find(x => x.id === w.id).len = null; }); continue; }
      if (d.some(x => x > 0)) { const o = offsetLens(poly.pts, d); if (o.issue) { info.issues.push(o.issue); poly.walls.forEach(w => { g.walls.find(x => x.id === w.id).len = null; }); } else poly.walls.forEach((w, i) => { g.walls.find(x => x.id === w.id).len = o.lens[i]; }); }
    }
    return out;
  };
  F.room = (S, roomId, mode) => { const gs = F.geometry(S, mode), r = gs.geometry.rooms.find(x => x.id === roomId); if (!r) return null; const d = SM.geo.deriveRoom(gs.geometry, r), info = gs.rooms[roomId] || {offsets: {}, issues: []};
    return Object.assign({mode, height: unk(r.height) ? null : +r.height, offsets: info.offsets, issues: info.issues, heightDelta: info.floor === undefined ? 0 : (info.floor === null || info.ceiling === null ? null : info.floor + info.ceiling)}, d, {geoIssues: d.issues, issues: info.issues}); };
  F.compare = (S, roomId) => ({rough: F.room(S, roomId, 'rough'), now: F.room(S, roomId, 'now'), finish: F.room(S, roomId, 'finish')});
  // Для расчёта сметы: проект с чистовой геометрией выбранного режима (если режим не «как введено»)
  F.view = S => { const m = S.dimMode; if (!m || m === 'rough' || !SM.layers) return S; return Object.assign({}, S, {object: Object.assign({}, S.object, {geometry: F.geometry(S, m).geometry})}); };

  // Процесс выполнен → его слой (lib.layerMap[processId] = тип слоя) на поверхностях процесса становится «сделано»; если такого запланированного слоя нет — добавляется выполненный
  F.completeProcess = (S, roomId, pid) => {
    const plan = SM.rules.plan(S.object, S.library, roomId), it = plan.items.find(x => x.id === pid), p = S.library.processes.find(x => x.id === pid), scope = it && it.scope;
    SM.rules.complete(S.object, S.library, roomId, pid);
    const typeId = (S.library.layerMap || {})[pid], res = {done: 0, added: 0}; if (!typeId || !SM.layers || !SM.layers.typeOf(S, typeId) || !p) return res;
    for (const s of S.object.surfaces.filter(x => x.roomId === roomId && x.kind === p.surface && !x.orphan && (!scope || scope.includes(x.id)))) {
      if (!SM.layers.typesFor(S, s.kind).some(t => t.id === typeId)) continue;
      const ly = SM.layers.of(s).find(l => l.type === typeId && l.status === 'planned'); if (ly) { ly.status = 'done'; res.done++; } else if (!SM.layers.of(s).some(l => l.type === typeId && l.status === 'done')) { SM.layers.add(S, s.id, typeId, {status: 'done'}); res.added++; } }
    return res;
  };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = globalThis.SM;
