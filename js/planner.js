/* CAD-планировщик, чистое ядро (без DOM). Контракт: docs/CAD_CONTRACT.md. Глобал SM.planner.
   drawing = {rooms:[{id,src,vertices,closed,gap,area,perimeter,issue}], walls:[{id,roomId,src,a,b}],
              openings:[{id,src,wallId,p1,p2}], fixtures:[{id,src}]}
   src — копия исходной записи геометрии (все поля, включая неизвестные); остальное — производное, не сохраняется.
   Координаты — метры, ось Y вверх (как в SM.geo). Вершины выводятся из len/turn (D4); правка вершины = пересчёт len/turn. */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {};
  const unk = v => SM.isUnknown(v), rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const clone = x => x === undefined ? x : JSON.parse(JSON.stringify(x));
  const round9 = v => Math.round(v * 1e9) / 1e9;
  const normAngle = a => { a = ((a % 360) + 360) % 360; return a > 180 ? a - 360 : a; };   // (−180, 180]
  const EPS_LEN = 1e-9, EPS_TURN = 1e-7;

  const shoelace = pts => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0)) / 2;

  // Производные величины (вершины уже заданы): концы стен, концы проёмов, площадь, периметр
  function derive(d) {
    const wall = new Map(d.walls.map(w => [w.id, w])), room = new Map(d.rooms.map(r => [r.id, r]));
    for (const w of d.walls) { w.a = w.b = null; }
    for (const r of d.rooms) {
      r.area = r.vertices && r.closed ? shoelace(r.vertices) : null;
      const ls = (r.src.wallIds || []).map(id => wall.get(id)).filter(Boolean).map(w => w.src.len);
      r.perimeter = ls.length && ls.every(l => !unk(l)) ? ls.reduce((s, l) => s + +l, 0) : null;
      if (!r.vertices || !r.closed) continue;
      const n = r.vertices.length;
      (r.src.wallIds || []).forEach((id, i) => { const w = wall.get(id); if (w && i < n) { w.a = {x: r.vertices[i].x, y: r.vertices[i].y}; w.b = {x: r.vertices[(i + 1) % n].x, y: r.vertices[(i + 1) % n].y}; } });
    }
    for (const o of d.openings) {
      o.p1 = o.p2 = null; const w = wall.get(o.src.wallId);
      if (!w || !w.a || unk(o.src.at) || unk(o.src.w)) continue;
      const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y); if (!(L > 0)) continue;
      const ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L, s = +o.src.at, e = s + +o.src.w;
      o.p1 = {x: w.a.x + ux * s, y: w.a.y + uy * s}; o.p2 = {x: w.a.x + ux * e, y: w.a.y + uy * e};
    }
    return d;
  }

  // geometry -> drawing. Копирует всё без потерь; незамкнутые комнаты и неизвестные длины не ломают загрузку
  function fromGeometry(geometry) {
    const g = clone(geometry) || {}, W = g.walls || [], O = g.openings || [], R = g.rooms || [], F = g.fixtures || [];
    const owner = new Map();
    const rooms = R.map(r => {
      (r.wallIds || []).forEach(id => { if (!owner.has(id)) owner.set(id, r.id); });
      const p = SM.geo.polygon({walls: W, openings: O, rooms: R}, Object.assign({wallIds: []}, r));
      return {id: r.id, src: r, vertices: p.pts ? p.pts.map(q => ({x: q.x, y: q.y})) : null, closed: !!p.ok, gap: p.gap === undefined ? null : p.gap, area: null, perimeter: null, issue: p.issue || null};
    });
    return derive({rooms, walls: W.map(w => ({id: w.id, roomId: owner.get(w.id) || null, src: w, a: null, b: null})),
      openings: O.map(o => ({id: o.id, src: o, wallId: o.wallId || null, p1: null, p2: null})), fixtures: F.map(f => ({id: f.id, src: f}))});
  }

  // Вершины -> len/turn стен комнаты (в src). Значения, не изменившиеся в пределах допуска, остаются как были (round-trip без потерь)
  function syncRoom(d, r) {
    if (!r.vertices || !r.closed) return;
    const wall = new Map(d.walls.map(w => [w.id, w])), ids = r.src.wallIds || [], v = r.vertices, n = v.length;
    if (ids.length !== n) return;
    const hd = v.map((p, i) => { const q = v[(i + 1) % n]; return Math.atan2(q.y - p.y, q.x - p.x); });
    ids.forEach((id, i) => {
      const w = wall.get(id); if (!w) return; const q = v[(i + 1) % n], len = Math.hypot(q.x - v[i].x, q.y - v[i].y);
      if (unk(w.src.len) || Math.abs(len - +w.src.len) > EPS_LEN) w.src.len = round9(len);
      if (i < n - 1) {   // поворот последней стены контуром не используется (контракт, раздел 2)
        const turn = normAngle(deg(hd[i + 1] - hd[i])), old = unk(w.src.turn) ? 90 : +w.src.turn;
        if (Math.abs(normAngle(turn - old)) > EPS_TURN) w.src.turn = round9(turn);
      }
    });
  }

  // drawing -> geometry (новая копия). baseGeometry даёт неизвестные поля верхнего уровня; id сохраняются
  function toGeometry(drawing, baseGeometry) {
    const d = clone(drawing); d.rooms.forEach(r => syncRoom(d, r)); derive(d);
    const out = clone(baseGeometry) || {};
    out.walls = d.walls.map(x => x.src); out.openings = d.openings.map(x => x.src); out.rooms = d.rooms.map(x => x.src);
    if (d.fixtures.length || (baseGeometry && 'fixtures' in baseGeometry)) out.fixtures = d.fixtures.map(x => x.src);
    return out;
  }

  // Правка вершины: возвращает НОВЫЙ drawing (исходный не меняется), len/turn соседних стен пересчитаны
  function moveVertex(drawing, roomId, index, pt) {
    const d = clone(drawing), r = d.rooms.find(x => x.id === roomId);
    if (!r) throw new Error('Помещение не найдено: ' + roomId);
    if (!r.vertices || !r.closed) throw new Error('Контур помещения «' + (r.src.name || r.id) + '» не замкнут или не у всех стен известна длина: вершины править нельзя');
    if (!(index >= 0 && index < r.vertices.length)) throw new Error('Нет вершины с номером ' + index);
    if (!isFinite(pt && pt.x) || !isFinite(pt && pt.y)) throw new Error('Координаты вершины должны быть числами');
    r.vertices[index] = {x: +pt.x, y: +pt.y}; syncRoom(d, r); return derive(d);
  }

  // Положение локальной точки комнаты на общем плане (room.pos = {x, y, rot}); без pos — как есть
  function toWorld(room, p) {
    const pos = room && room.src ? room.src.pos : room && room.pos; if (!pos) return {x: p.x, y: p.y};
    const c = Math.cos(rad(+pos.rot || 0)), s = Math.sin(rad(+pos.rot || 0));
    return {x: (+pos.x || 0) + p.x * c - p.y * s, y: (+pos.y || 0) + p.x * s + p.y * c};
  }

  // Привязка точки (мировые координаты): сначала к вершине, потом к сетке. grid = шаг в м или null (не задан). Допуск — параметр интерфейса, не норма
  function snapPoint(drawing, pt, opts) {
    opts = opts || {}; const tol = unk(opts.tol) ? 0.1 : +opts.tol; let best = null;
    for (const r of drawing.rooms) { if (!r.vertices || (opts.roomId && r.id !== opts.roomId)) continue;
      r.vertices.forEach((v, i) => { const w = toWorld(r, v), dist = Math.hypot(w.x - pt.x, w.y - pt.y); if (dist <= tol && (!best || dist < best.dist)) best = {x: w.x, y: w.y, kind: 'vertex', roomId: r.id, index: i, dist}; }); }
    if (best) return best;
    if (!unk(opts.grid) && +opts.grid > 0) { const s = +opts.grid; return {x: Math.round(pt.x / s) * s, y: Math.round(pt.y / s) * s, kind: 'grid'}; }
    return {x: pt.x, y: pt.y, kind: null};
  }

  // Итог для обмена с приложением: геометрия отдаётся только если SM.geo.validate даёт ok
  function finish(drawing, baseGeometry) {
    const g = toGeometry(drawing, baseGeometry), v = SM.geo.validate(g);
    return {ok: v.ok, geometry: v.ok ? g : null, issues: v.issues};
  }

  // Размеры по помещениям (из движка, не дублируем формулы): [{id, closed, floor, perimeter}]
  function measure(geometry) {
    return ((geometry && geometry.rooms) || []).map(r => { const x = SM.geo.deriveRoom(geometry, r); return {id: r.id, closed: x.closed, floor: x.floor, perimeter: x.perimeter}; });
  }


  // Описание записи для панели свойств: {kind, title, rows:[[подпись, значение]]}. Неизвестное = «не задано» (не 0)
  function describe(geometry, id) {
    const g = geometry || {}, f = (list) => (list || []).find(x => x && x.id === id), none = 'не задано';
    const num = (v, u) => unk(v) ? none : String(Math.round(+v * 1000) / 1000).replace('.', ',') + (u ? ' ' + u : '');
    const txt = v => unk(v) ? none : String(v), wallName = wid => { const w = f2(g.walls, wid); return w ? (w.name || w.id) : none; };
    function f2(list, x) { return (list || []).find(y => y && y.id === x); }
    let x;
    if ((x = f(g.rooms))) { const m = measure(g).find(r => r.id === id) || {}; return {kind: 'room', title: 'Помещение «' + (x.name || x.id) + '»', rows: [['Тип', txt(x.type)], ['Высота', num(x.height, 'м')], ['Стен', String((x.wallIds || []).length)], ['Площадь пола', num(m.floor, 'м²')], ['Периметр', num(m.perimeter, 'м')], ['Контур замкнут', m.closed ? 'да' : 'нет']]}; }
    if ((x = f(g.walls))) return {kind: 'wall', title: 'Стена «' + (x.name || x.id) + '»', rows: [['Длина', num(x.len, 'м')], ['Поворот в конце', unk(x.turn) ? '90° (по умолчанию)' : num(x.turn, '°')], ['Высота', num(x.height, 'м')], ['Материал', txt(x.material)], ['Толщина', num(x.thickness, 'м')]]};
    if ((x = f(g.openings))) return {kind: 'opening', title: 'Проём «' + (x.kind || x.id) + '»', rows: [['Стена', x.wallId ? wallName(x.wallId) : 'не привязан к стене'], ['Ширина', num(x.w, 'м')], ['Высота', num(x.h, 'м')], ['От начала стены', num(x.at, 'м')], ['Низ от пола', num(x.sill, 'м')], ['Открывание', txt(x.swing)]]};
    if ((x = f(g.fixtures))) return {kind: 'fixture', title: 'Предмет «' + (x.name || x.kind || x.id) + '»', rows: [['Вид', txt(x.kind)], ['Центр x, y', num(x.x, 'м') + '; ' + num(x.y, 'м')], ['Поворот', num(x.rot, '°')], ['Ширина × глубина', num(x.w, 'м') + ' × ' + num(x.d, 'м')], ['Высота', num(x.h, 'м')]]};
    return null;
  }

  // Отмена/повтор: снимки геометрии, без ограничения глубины. История в проект не попадает
  function createHistory(geometry) {
    const past = [], future = []; let cur = {g: clone(geometry), reason: 'start'};
    return {
      current: () => clone(cur.g), reason: () => cur.reason,
      push(g, reason) { past.push(cur); future.length = 0; cur = {g: clone(g), reason: reason || 'edit'}; return clone(cur.g); },
      undo() { if (!past.length) return null; future.push(cur); cur = past.pop(); return clone(cur.g); },
      redo() { if (!future.length) return null; past.push(cur); cur = future.pop(); return clone(cur.g); },
      canUndo: () => past.length > 0, canRedo: () => future.length > 0
    };
  }

  SM.planner = Object.assign(SM.planner || {}, {VERSION: '0.2.0', CONTRACT: 1,
    fromGeometry, toGeometry, moveVertex, snapPoint, toWorld, finish, measure, describe, createHistory});
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
