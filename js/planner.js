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
  function syncRoom(d, r, doRebase) {
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
    if (doRebase) rebase(d, r);
  }

  // Локальная система комнаты всегда начинается с первой вершины вдоль +X (форма «черепашкой», D4);
  // чтобы комната не прыгала на плане, разворот и сдвиг уходят в room.pos
  function rebase(d, r) {
    const v = r.vertices, p0 = v[0], h0 = Math.atan2(v[1].y - p0.y, v[1].x - p0.x);
    if (Math.abs(h0) < 1e-9 && Math.hypot(p0.x, p0.y) < 1e-9) return;
    const org = toWorld(r, p0), pos = r.src.pos || {}, c = Math.cos(h0), s = Math.sin(h0);
    r.vertices = v.map(p => { const dx = p.x - p0.x, dy = p.y - p0.y; return {x: dx * c + dy * s, y: -dx * s + dy * c}; });
    for (const f of d.fixtures) if (f.src.roomId === r.id && !unk(f.src.x) && !unk(f.src.y)) {   // предметы остаются на месте в плане
      const dx = f.src.x - p0.x, dy = f.src.y - p0.y; f.src.x = round9(dx * c + dy * s); f.src.y = round9(-dx * s + dy * c); if (!unk(f.src.rot)) f.src.rot = round9(normAngle(+f.src.rot - deg(h0))); }
    r.src.pos = Object.assign({}, pos, {x: round9(org.x), y: round9(org.y), rot: round9(normAngle((+pos.rot || 0) + deg(h0)))});
  }

  // drawing -> geometry (новая копия). baseGeometry даёт неизвестные поля верхнего уровня; id сохраняются
  function toGeometry(drawing, baseGeometry) {
    const d = clone(drawing); d.rooms.forEach(r => syncRoom(d, r, true)); derive(d);
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

  // Обратное к toWorld: мировая точка -> локальные координаты комнаты
  function toLocal(room, p) {
    const pos = room && room.src ? room.src.pos : room && room.pos; if (!pos) return {x: p.x, y: p.y};
    const c = Math.cos(rad(+pos.rot || 0)), s = Math.sin(rad(+pos.rot || 0)), dx = p.x - (+pos.x || 0), dy = p.y - (+pos.y || 0);
    return {x: dx * c + dy * s, y: -dx * s + dy * c};
  }

  // Привязка точки (мировые координаты): сначала к вершине, потом к сетке. grid = шаг в м или null (не задан). Допуск — параметр интерфейса, не норма
  function snapPoint(drawing, pt, opts) {
    opts = opts || {}; const tol = unk(opts.tol) ? 0.1 : +opts.tol; let best = null;
    for (const r of drawing.rooms) { if (!r.vertices || (opts.roomId && r.id !== opts.roomId)) continue;
      r.vertices.forEach((v, i) => { if (opts.skip && opts.skip.roomId === r.id && opts.skip.index === i) return; const w = toWorld(r, v), dist = Math.hypot(w.x - pt.x, w.y - pt.y); if (dist <= tol && (!best || dist < best.dist)) best = {x: w.x, y: w.y, kind: 'vertex', roomId: r.id, index: i, dist}; }); }
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


  // ===== Правка (срез 3). Все операции принимают drawing и возвращают НОВЫЙ drawing (вход не меняется), при ошибке бросают Error по-русски.
  // Доп. поля результата (не сохраняются): notes — предупреждения по-русски, created — id созданного.
  const EPS = 1e-9, fmtM = v => String(Math.round(+v * 1000) / 1000).replace('.', ',');
  const posNum = (v, msg) => { if (unk(v) || !isFinite(+v) || !(+v > 0)) throw new Error(msg); return +v; };
  const signedArea = pts => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;
  function edit(d, fn) {
    const c = clone(d); c.notes = []; delete c.created; fn(c);
    c.rooms.forEach(r => syncRoom(c, r)); return derive(c);
  }
  function roomEd(c, id) {
    const r = c.rooms.find(x => x.id === id); if (!r) throw new Error('Помещение не найдено: ' + id);
    if (!r.vertices || !r.closed) throw new Error('Контур помещения «' + (r.src.name || r.id) + '» не замкнут или не у всех стен известна длина: править нельзя');
    return r;
  }
  function wallCtx(c, wallId) {
    const w = c.walls.find(x => x.id === wallId); if (!w) throw new Error('Стена не найдена: ' + wallId);
    const r = c.rooms.find(x => x.id === w.roomId); if (!r) throw new Error('Стена не принадлежит помещению');
    roomEd(c, r.id); return {w, r, i: r.src.wallIds.indexOf(wallId)};
  }
  function clearShared(c, w, notes) {   // связь общей стены рвётся при изменении формы одной из пары
    if (unk(w.src.shared)) return; const other = c.walls.find(x => x.id === w.src.shared);
    if (other) delete other.src.shared; delete w.src.shared; notes.push('Связь общей стены «' + (w.src.name || w.id) + '» с соседней снята: проверьте обе стены');
  }
  const segDist = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0, q = {x: a.x + t * dx, y: a.y + t * dy}; return {dist: Math.hypot(p.x - q.x, p.y - q.y), t, q}; };
  const inPoly = (pts, p) => { let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) ins = !ins; } return ins; };
  const orient = (a, b, p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const cross = (a, b, c, d) => { const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b); return o1 * o2 < -1e-12 && o3 * o4 < -1e-12; };

  // Внутренний угол в вершине k (градусы, 0…360): 90 — прямой, больше 180 — внутренний угол Г-образной комнаты
  function vertexAngle(drawing, roomId, k) {
    const r = drawing.rooms.find(x => x.id === roomId); if (!r || !r.vertices || !r.closed) return null; const v = r.vertices, n = v.length; if (!(k >= 0 && k < n)) return null;
    const p = v[(k - 1 + n) % n], q = v[k], x = v[(k + 1) % n], t = normAngle(deg(Math.atan2(x.y - q.y, x.x - q.x) - Math.atan2(q.y - p.y, q.x - p.x)));
    return round9(180 - (signedArea(v) >= 0 ? 1 : -1) * t);
  }

  // Длина стены числом. anchor: 'start' (по умолчанию) — неподвижно начало, двигается конец; 'end' — наоборот.
  // mode: 'push' (по умолчанию) — вместе с концом сдвигается соседняя стена целиком (прямоугольные комнаты остаются прямоугольными); 'end' — двигается только угол
  function setWallLength(d, wallId, len, opts) {
    opts = opts || {}; len = posNum(len, 'Длина стены должна быть положительным числом');
    return edit(d, c => { const {w, r, i} = wallCtx(c, wallId), v = r.vertices, n = v.length, back = opts.anchor === 'end', s = back ? (i + 1) % n : i, e = back ? i : (i + 1) % n;
      const L = Math.hypot(v[e].x - v[s].x, v[e].y - v[s].y); if (!(L > 0)) throw new Error('У стены нулевая длина: направление неизвестно, сначала сдвиньте угол');
      const dx = (v[e].x - v[s].x) / L * (len - L), dy = (v[e].y - v[s].y) / L * (len - L), mv = j => { v[j] = {x: v[j].x + dx, y: v[j].y + dy}; };
      mv(e); if (opts.mode !== 'end') mv(back ? (i - 1 + n) % n : (i + 2) % n); clearShared(c, w, c.notes); });
  }

  // Внутренний угол в вершине k числом: поворачивается следующая стена вокруг вершины, её длина сохраняется
  function setVertexAngle(d, roomId, k, interior) {
    if (unk(interior) || !isFinite(+interior) || !(+interior > 0 && +interior < 360)) throw new Error('Угол должен быть больше 0° и меньше 360°');
    return edit(d, c => { const r = roomEd(c, roomId), v = r.vertices, n = v.length; if (!(k >= 0 && k < n)) throw new Error('Нет вершины с номером ' + k);
      const cur = vertexAngle(c, roomId, k), q = v[k], x = v[(k + 1) % n]; if (!(Math.hypot(x.x - q.x, x.y - q.y) > 0)) throw new Error('Следующая стена нулевой длины: угол не определён');
      const s = signedArea(v) >= 0 ? 1 : -1, a = rad(-s * (+interior - cur)), cs = Math.cos(a), sn = Math.sin(a), dx = x.x - q.x, dy = x.y - q.y;
      v[(k + 1) % n] = {x: q.x + dx * cs - dy * sn, y: q.y + dx * sn + dy * cs}; });
  }

  // Разделение стены в точке at (м от начала; пусто = пополам). Первая часть сохраняет id, вторая получает новый. Проёмы переезжают на свою часть
  function splitWallIn(c, wallId, at) {
    const {w, r, i} = wallCtx(c, wallId), v = r.vertices, n = v.length, a = v[i], b = v[(i + 1) % n], L = Math.hypot(b.x - a.x, b.y - a.y), pos = unk(at) ? L / 2 : +at;
    if (!isFinite(pos) || !(pos > EPS && pos < L - EPS)) throw new Error('Точка разделения должна быть внутри стены (больше 0 и меньше ' + fmtM(L) + ' м)');
    const id = SM.uid(), nw = {id, roomId: r.id, src: clone(w.src), a: null, b: null};
    for (const o of c.openings) { if (o.src.wallId !== wallId || unk(o.src.at) || unk(o.src.w)) continue; const s = +o.src.at, e = s + +o.src.w;
      if (e <= pos + EPS) continue; if (s >= pos - EPS) { o.src.wallId = id; o.wallId = id; o.src.at = round9(s - pos); continue; }
      throw new Error('Проём «' + (o.src.kind || o.id) + '» лежит на месте разреза: выберите другую точку или сначала сдвиньте проём'); }
    clearShared(c, w, c.notes); delete nw.src.shared;
    nw.src.id = id; nw.src.len = round9(L - pos); w.src.len = round9(pos); w.src.turn = 0; if (!unk(w.src.name)) nw.src.name = w.src.name + ' (продолжение)';
    r.vertices.splice(i + 1, 0, {x: a.x + (b.x - a.x) / L * pos, y: a.y + (b.y - a.y) / L * pos}); r.src.wallIds.splice(i + 1, 0, id); c.walls.splice(c.walls.indexOf(w) + 1, 0, nw);
    c.created = {wallId: id, vertexIndex: i + 1}; return i + 1;
  }
  const splitWall = (d, wallId, at) => edit(d, c => { splitWallIn(c, wallId, at); });

  // Убрать угол (вершину) k: две стены при ней сливаются в одну (остаётся стена, что приходит в угол; id и свойства сохраняются)
  function removeVertex(d, roomId, k) {
    return edit(d, c => { const r = roomEd(c, roomId), n = r.vertices.length; if (!(k >= 0 && k < n)) throw new Error('Нет вершины с номером ' + k);
      if (n <= 3) throw new Error('В помещении должно остаться не меньше трёх стен');
      const keepId = r.src.wallIds[(k - 1 + n) % n], dropId = r.src.wallIds[k], keep = c.walls.find(x => x.id === keepId), drop = c.walls.find(x => x.id === dropId);
      for (const o of c.openings) if (o.src.wallId === dropId) { o.src.wallId = null; o.wallId = null; delete o.src.at; c.notes.push('Проём «' + (o.src.kind || o.id) + '» остался без стены: привяжите его заново'); }
      clearShared(c, keep, c.notes); clearShared(c, drop, c.notes);
      if (!unk(drop.src.turn)) keep.src.turn = drop.src.turn; else keep.src.turn = null;
      r.vertices.splice(k, 1); r.src.wallIds.splice(k, 1); c.walls.splice(c.walls.indexOf(drop), 1); });
  }

  // Свойства стены/комнаты, которые вводит человек. Пусто = неизвестно (null), не 0
  function setWallProps(d, wallId, props) {
    return edit(d, c => { const w = c.walls.find(x => x.id === wallId); if (!w) throw new Error('Стена не найдена: ' + wallId);
      for (const k of Object.keys(props || {})) { const v = props[k];
        if (k === 'thickness' || k === 'height') w.src[k] = unk(v) || v === '' ? null : posNum(v, (k === 'thickness' ? 'Толщина' : 'Высота') + ' должна быть положительным числом или пустой (не задано)');
        else if (k === 'name' || k === 'material') { if (unk(v) || v === '') delete w.src[k]; else w.src[k] = String(v); }
        else throw new Error('Это свойство стены здесь не правится: ' + k); } });
  }
  function setRoomProps(d, roomId, props) {
    return edit(d, c => { const r = c.rooms.find(x => x.id === roomId); if (!r) throw new Error('Помещение не найдено: ' + roomId);
      for (const k of Object.keys(props || {})) { const v = props[k];
        if (k === 'height') r.src.height = unk(v) || v === '' ? null : posNum(v, 'Высота должна быть положительным числом или пустой (не задано)');
        else if (k === 'name' || k === 'type') { if (unk(v) || v === '') delete r.src[k]; else r.src[k] = String(v); }
        else throw new Error('Это свойство помещения здесь не правится: ' + k); } });
  }

  // Новая комната по точкам (локальные координаты, обход в любую сторону). Высота и прочее неизвестное = null
  function addRoomFromPoints(d, pts, props) {
    props = props || {}; if (!Array.isArray(pts) || pts.length < 3) throw new Error('Для помещения нужно не меньше трёх углов');
    if (pts.some(p => !isFinite(p && p.x) || !isFinite(p && p.y))) throw new Error('Координаты углов должны быть числами');
    if (!(Math.abs(signedArea(pts)) > EPS)) throw new Error('Площадь помещения нулевая: углы лежат на одной прямой');
    return edit(d, c => { const n = pts.length, rid = SM.uid(), ids = pts.map(() => SM.uid());
      ids.forEach((id, i) => c.walls.push({id, roomId: rid, src: {id, name: 'Стена ' + (i + 1), len: null, turn: i < n - 1 ? 90 : null}, a: null, b: null}));
      const src = {id: rid, name: props.name ? String(props.name) : 'Помещение ' + (c.rooms.length + 1), height: unk(props.height) ? null : posNum(props.height, 'Высота должна быть положительным числом'), wallIds: ids};
      if (props.pos) src.pos = {x: +props.pos.x || 0, y: +props.pos.y || 0, rot: +props.pos.rot || 0};
      c.rooms.push({id: rid, src, vertices: pts.map(p => ({x: +p.x, y: +p.y})), closed: true, gap: 0, area: null, perimeter: null, issue: null}); c.created = {roomId: rid, wallIds: ids}; });
  }
  function addRoomRect(d, o) { o = o || {}; const w = posNum(o.w, 'Ширина должна быть положительным числом'), h = posNum(o.h, 'Глубина должна быть положительным числом');
    return addRoomFromPoints(d, [{x: 0, y: 0}, {x: w, y: 0}, {x: w, y: h}, {x: 0, y: h}], o); }
  // Г-образная: прямоугольник w×h с вырезом cutW×cutH в правом верхнем углу
  function addRoomL(d, o) { o = o || {}; const w = posNum(o.w, 'Ширина должна быть положительным числом'), h = posNum(o.h, 'Глубина должна быть положительным числом'),
      cw = posNum(o.cutW, 'Ширина выреза должна быть положительным числом'), ch = posNum(o.cutH, 'Глубина выреза должна быть положительным числом');
    if (cw >= w || ch >= h) throw new Error('Вырез должен быть меньше комнаты');
    return addRoomFromPoints(d, [{x: 0, y: 0}, {x: w, y: 0}, {x: w, y: h - ch}, {x: w - cw, y: h - ch}, {x: w - cw, y: h}, {x: 0, y: h}], o); }

  // Удалить помещение со стенами. Проёмы его стен остаются без привязки, предметы помещения удаляются (об этом — в notes)
  function removeRoom(d, roomId) {
    return edit(d, c => { const r = c.rooms.find(x => x.id === roomId); if (!r) throw new Error('Помещение не найдено: ' + roomId); const ids = new Set(r.src.wallIds || []);
      c.walls.filter(w => ids.has(w.id)).forEach(w => clearShared(c, w, c.notes));
      let loose = 0; for (const o of c.openings) if (ids.has(o.src.wallId)) { o.src.wallId = null; o.wallId = null; delete o.src.at; loose++; }
      const fx = c.fixtures.filter(f => f.src.roomId === roomId).length;
      if (loose) c.notes.push('Проёмов без стены: ' + loose); if (fx) c.notes.push('Удалено предметов: ' + fx);
      c.walls = c.walls.filter(w => !ids.has(w.id)); c.fixtures = c.fixtures.filter(f => f.src.roomId !== roomId); c.rooms = c.rooms.filter(x => x !== r); });
  }

  // Ближайшая точка контура комнаты: {x, y, wallId, at, dist, vertex}. vertex — номер вершины, если точка ближе vtol к ней (м)
  function nearestOnContour(drawing, roomId, pt, vtol) {
    const r = drawing.rooms.find(x => x.id === roomId); if (!r || !r.vertices || !r.closed) return null; const v = r.vertices, n = v.length; let best = null;
    for (let i = 0; i < n; i++) { const a = v[i], b = v[(i + 1) % n], q = segDist(pt, a, b); if (!best || q.dist < best.dist) best = {x: q.q.x, y: q.q.y, wallId: r.src.wallIds[i], at: q.t * Math.hypot(b.x - a.x, b.y - a.y), dist: q.dist, vertex: null, i}; }
    if (!best) return null; const tol = unk(vtol) ? 0 : +vtol;
    for (let k = 0; k < n; k++) if (Math.hypot(v[k].x - best.x, v[k].y - best.y) <= tol) { best.x = v[k].x; best.y = v[k].y; best.vertex = k; best.dist = Math.hypot(v[k].x - pt.x, v[k].y - pt.y); break; }
    delete best.i; return best;
  }

  // Перегородка: комната режется хордой между двумя точками контура (локальные координаты точек на контуре). Большая часть сохраняет id и название.
  // В каждой комнате хорда — своя стена (общая стена = две записи, связанные shared). opts: {names:[для сохранившей id, для новой], thickness}
  function splitRoom(d, roomId, pA, pB, opts) {
    opts = opts || {};
    return edit(d, c => { const r = roomEd(c, roomId);
      const put = pt => { const q = nearestOnContour(c, roomId, pt, 1e-6); if (!q || q.dist > 1e-6) throw new Error('Точка перегородки должна лежать на стене помещения'); if (q.vertex !== null) return {index: q.vertex, ins: false};
        const w = c.walls.find(x => x.id === q.wallId), L = Math.hypot(r.vertices[(r.src.wallIds.indexOf(q.wallId) + 1) % r.vertices.length].x - r.vertices[r.src.wallIds.indexOf(q.wallId)].x, r.vertices[(r.src.wallIds.indexOf(q.wallId) + 1) % r.vertices.length].y - r.vertices[r.src.wallIds.indexOf(q.wallId)].y);
        return {index: splitWallIn(c, q.wallId, q.at), ins: true, L, w}; };
      let a = put(pA).index; const bb = put(pB); let b = bb.index; if (bb.ins && b <= a) a++;
      const v = r.vertices, n = v.length; if (a === b) throw new Error('Начало и конец перегородки совпадают');
      if (Math.abs(a - b) === 1 || Math.abs(a - b) === n - 1) throw new Error('Перегородка совпадает с существующей стеной');
      const i1 = Math.min(a, b), i2 = Math.max(a, b), P1 = v[i1], P2 = v[i2], mid = {x: (P1.x + P2.x) / 2, y: (P1.y + P2.y) / 2};
      if (!inPoly(v, mid)) throw new Error('Перегородка проходит вне помещения');
      for (let j = 0; j < n; j++) { const e1 = j, e2 = (j + 1) % n; if (e1 === i1 || e1 === i2 || e2 === i1 || e2 === i2) continue; if (cross(P1, P2, v[e1], v[e2])) throw new Error('Перегородка пересекает стены помещения'); }
      const ids = r.src.wallIds.slice(), vA = v.slice(i1, i2 + 1), idsA = ids.slice(i1, i2), vB = v.slice(i2).concat(v.slice(0, i1 + 1)), idsB = ids.slice(i2).concat(ids.slice(0, i1));
      const keepA = Math.abs(signedArea(vA)) >= Math.abs(signedArea(vB)), keepV = keepA ? vA : vB, keepIds = keepA ? idsA : idsB, newV = keepA ? vB : vA, newIds = keepA ? idsB : idsA;
      const chK = SM.uid(), chN = SM.uid(), rid = SM.uid(), th = unk(opts.thickness) ? null : posNum(opts.thickness, 'Толщина должна быть положительным числом');
      const mkw = (id, other, owner) => { const src = {id, name: 'Перегородка', len: null, turn: null, shared: other}; if (th !== null) src.thickness = th; return {id, roomId: owner, src, a: null, b: null}; };
      const names = opts.names || [], src2 = clone(r.src); src2.id = rid; src2.wallIds = newIds.concat(chN); src2.name = names[1] || (unk(r.src.name) ? 'Помещение ' + (c.rooms.length + 1) : r.src.name + ' (2)');
      if (names[0]) r.src.name = names[0];
      r.vertices = keepV; r.src.wallIds = keepIds.concat(chK); c.walls.push(mkw(chK, chN, roomId), mkw(chN, chK, rid));
      c.walls.forEach(w => { if (newIds.indexOf(w.id) >= 0) w.roomId = rid; }); c.rooms.splice(c.rooms.indexOf(r) + 1, 0, {id: rid, src: src2, vertices: newV, closed: true, gap: 0, area: null, perimeter: null, issue: null});
      for (const f of c.fixtures) if (f.src.roomId === roomId && !unk(f.src.x) && !unk(f.src.y) && inPoly(newV, {x: +f.src.x, y: +f.src.y})) f.src.roomId = rid;
      c.created = {roomId: rid, wallIds: [chK, chN]}; });
  }


  // ===== Проёмы (срез 4). Те же правила: вход не меняется, ошибки по-русски; notes — предупреждения (выход за стену, пересечение проёмов), created = {openingId}
  const SWINGS = ['in', 'out', 'sliding'];
  const optNum = (v, label, strict) => { if (unk(v) || v === '') return null; if (!isFinite(+v) || (strict ? !(+v > 0) : +v < 0)) throw new Error(label + ' должна быть ' + (strict ? 'положительным' : 'неотрицательным') + ' числом или пустой (не задано)'); return +v; };
  const atNum = v => { if (unk(v) || v === '' || !isFinite(+v) || +v < 0) throw new Error('Расстояние от начала стены должно быть числом, не меньше 0'); return round9(+v); };
  const swingVal = v => { if (unk(v) || v === '') return null; if (SWINGS.indexOf(v) < 0) throw new Error('Открывание: in (внутрь), out (наружу), sliding (раздвижное) или пусто'); return v; };
  const openEd = (c, id) => { const o = c.openings.find(x => x.id === id); if (!o) throw new Error('Проём не найден: ' + id); return o; };
  const wallOf = (c, id) => { const w = c.walls.find(x => x.id === id); if (!w) throw new Error('Стена не найдена: ' + id); if (!w.roomId) throw new Error('Стена не принадлежит помещению'); return w; };
  function openingNotes(c, o) {
    const out = [], w = c.walls.find(x => x.id === o.src.wallId); if (!w || unk(o.src.at) || unk(o.src.w)) return out;
    const s = +o.src.at, e = s + +o.src.w, nm = '«' + (o.src.kind || o.id) + '»';
    if (!unk(w.src.len) && e > +w.src.len + EPS) out.push('Проём ' + nm + ' выходит за край стены (до ' + fmtM(e) + ' м при длине ' + fmtM(w.src.len) + ' м)');
    for (const q of c.openings) { if (q === o || q.src.wallId !== w.id || unk(q.src.at) || unk(q.src.w)) continue; const s2 = +q.src.at, e2 = s2 + +q.src.w; if (s < e2 - EPS && s2 < e - EPS) out.push('Проём ' + nm + ' пересекается с проёмом «' + (q.src.kind || q.id) + '»'); }
    return out;
  }
  // По центру стены, если расстояние не задано и известны длина стены и ширина проёма (удобство интерфейса, не норма)
  function centerAt(w, ow) { if (unk(w.src.len) || unk(ow)) throw new Error('Укажите расстояние от начала стены: по центру не поставить, пока неизвестна длина стены или ширина проёма'); return round9(Math.max(0, (+w.src.len - +ow) / 2)); }
  function addOpening(d, wallId, props) {
    props = props || {};
    return edit(d, c => { const w = wallOf(c, wallId), ww = optNum(props.w, 'Ширина проёма', true); if (ww === null) throw new Error('Ширина проёма должна быть положительным числом');
      const at = unk(props.at) || props.at === '' ? centerAt(w, ww) : atNum(props.at), id = SM.uid();
      const src = {id, roomId: w.roomId, wallId, kind: unk(props.kind) || props.kind === '' ? 'проём' : String(props.kind), w: ww, h: optNum(props.h, 'Высота проёма', true), at, sill: optNum(props.sill, 'Низ от пола', false), swing: swingVal(props.swing)};
      const o = {id, src, wallId, p1: null, p2: null}; c.openings.push(o); c.created = {openingId: id}; c.notes.push(...openingNotes(c, o)); });
  }
  function setOpeningProps(d, id, props) {
    return edit(d, c => { const o = openEd(c, id);
      for (const k of Object.keys(props || {})) { const v = props[k];
        if (k === 'kind') { if (unk(v) || v === '') delete o.src.kind; else o.src.kind = String(v); }
        else if (k === 'w') o.src.w = optNum(v, 'Ширина проёма', true);
        else if (k === 'h') o.src.h = optNum(v, 'Высота проёма', true);
        else if (k === 'sill') o.src.sill = optNum(v, 'Низ от пола', false);
        else if (k === 'swing') o.src.swing = swingVal(v);
        else if (k === 'at') { if (!o.src.wallId) throw new Error('Сначала привяжите проём к стене'); o.src.at = atNum(v); }
        else throw new Error('Это свойство проёма здесь не правится: ' + k); }
      c.notes.push(...openingNotes(c, o)); });
  }
  const moveOpening = (d, id, at) => setOpeningProps(d, id, {at});
  // Привязать к стене: wallId + расстояние at от начала стены (пусто — по центру). Проём переходит в помещение этой стены
  function attachOpening(d, id, wallId, at) {
    return edit(d, c => { const o = openEd(c, id), w = wallOf(c, wallId), a = unk(at) || at === '' ? centerAt(w, o.src.w) : atNum(at);
      if (o.src.roomId && o.src.roomId !== w.roomId) c.notes.push('Проём перенесён в помещение «' + ((c.rooms.find(r => r.id === w.roomId) || {src: {}}).src.name || w.roomId) + '»');
      o.src.wallId = wallId; o.wallId = wallId; o.src.roomId = w.roomId; o.src.at = a; c.notes.push(...openingNotes(c, o)); });
  }
  const detachOpening = (d, id) => edit(d, c => { const o = openEd(c, id); o.src.wallId = null; o.wallId = null; delete o.src.at; });
  const removeOpening = (d, id) => edit(d, c => { const o = openEd(c, id); c.openings = c.openings.filter(x => x !== o); });


  // ===== Несколько помещений на плане (срез 5). Положение комнаты — только room.pos (P9): стены, проёмы и предметы в локальных координатах не трогаются
  const meanPt = pts => ({x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length});
  const worldRoom = r => r.vertices ? r.vertices.map(v => toWorld(r, v)) : null;
  const worldEdges = d => { const out = []; for (const w of d.walls) { const r = d.rooms.find(x => x.id === w.roomId); if (r && w.a && w.b) out.push({roomId: r.id, wallId: w.id, a: toWorld(r, w.a), b: toWorld(r, w.b)}); } return out; };
  // Как лежат два отрезка: параллельны (sin угла ≤ angTol), оба конца e2 не дальше tol от прямой e1; overlap — длина общего куска вдоль e1; off — смещение e2 от e1 (знак — сторона)
  function touch(e1, e2, tol, angTol) {
    const L1 = Math.hypot(e1.b.x - e1.a.x, e1.b.y - e1.a.y), L2 = Math.hypot(e2.b.x - e2.a.x, e2.b.y - e2.a.y); if (!(L1 > 0) || !(L2 > 0)) return null;
    const ux = (e1.b.x - e1.a.x) / L1, uy = (e1.b.y - e1.a.y) / L1, vx = (e2.b.x - e2.a.x) / L2, vy = (e2.b.y - e2.a.y) / L2; if (Math.abs(ux * vy - uy * vx) > angTol) return null;
    const off = p => ux * (p.y - e1.a.y) - uy * (p.x - e1.a.x), o1 = off(e2.a), o2 = off(e2.b); if (Math.abs(o1) > tol || Math.abs(o2) > tol) return null;
    const t1 = (e2.a.x - e1.a.x) * ux + (e2.a.y - e1.a.y) * uy, t2 = (e2.b.x - e1.a.x) * ux + (e2.b.y - e1.a.y) * uy;
    return {overlap: Math.min(L1, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2)), off: (o1 + o2) / 2, nx: -uy, ny: ux, L1, L2};
  }
  const MOVE_TOL = 0.05, ANG_TOL = 0.01;   // допуски интерфейса (P19), не нормы

  // Привязка при переносе комнаты на (dx, dy): сначала угол к углу соседней комнаты, затем стена вплотную к параллельной стене. -> {dx, dy, kind: 'vertex'|'wall'|null}
  function snapRoomMove(d, roomId, dx, dy, opts) {
    opts = opts || {}; const tol = unk(opts.tol) ? MOVE_TOL : +opts.tol, r = d.rooms.find(x => x.id === roomId); if (!r || !r.vertices) return {dx, dy, kind: null};
    const mine = worldRoom(r).map(p => ({x: p.x + dx, y: p.y + dy})); let best = null;
    for (const o of d.rooms) { if (o.id === roomId || !o.vertices) continue; for (const q of worldRoom(o)) for (const p of mine) { const dist = Math.hypot(q.x - p.x, q.y - p.y); if (dist <= tol && (!best || dist < best.dist)) best = {dist, dx: dx + q.x - p.x, dy: dy + q.y - p.y}; } }
    if (best) return {dx: best.dx, dy: best.dy, kind: 'vertex'};
    const me = worldEdges(d).filter(e => e.roomId === roomId).map(e => ({a: {x: e.a.x + dx, y: e.a.y + dy}, b: {x: e.b.x + dx, y: e.b.y + dy}})), others = worldEdges(d).filter(e => e.roomId !== roomId);
    for (const e of others) for (const m of me) { const t = touch(e, m, tol, ANG_TOL); if (t && t.overlap > 1e-6 && (!best || Math.abs(t.off) < best.dist)) best = {dist: Math.abs(t.off), dx: dx - t.off * t.nx, dy: dy - t.off * t.ny}; }
    return best ? {dx: best.dx, dy: best.dy, kind: 'wall'} : {dx, dy, kind: null};
  }

  const setPos = (r, x, y, rot) => { const pos = Object.assign({}, r.src.pos, {x: round9(x), y: round9(y), rot: round9(normAngle(rot))}); if (Math.abs(pos.x) < 1e-9 && Math.abs(pos.y) < 1e-9 && Math.abs(pos.rot) < 1e-9 && Object.keys(pos).length === 3) delete r.src.pos; else r.src.pos = pos; };
  const posOf = r => Object.assign({x: 0, y: 0, rot: 0}, r.src.pos), finiteN = (v, msg) => { if (unk(v) || v === '' || !isFinite(+v)) throw new Error(msg); return +v; };
  const roomAny = (c, id) => { const r = c.rooms.find(x => x.id === id); if (!r) throw new Error('Помещение не найдено: ' + id); return r; };
  // Сдвинуть комнату на (dx, dy) м по плану
  function moveRoom(d, roomId, dx, dy) {
    dx = finiteN(dx, 'Сдвиг должен быть числом'); dy = finiteN(dy, 'Сдвиг должен быть числом');
    return edit(d, c => { const r = roomAny(c, roomId), p = posOf(r); setPos(r, p.x + dx, p.y + dy, p.rot); });
  }
  // Повернуть комнату на deg° (против часовой — плюс) вокруг точки about (мировые координаты; по умолчанию — середина углов)
  function rotateRoom(d, roomId, deg, about) {
    deg = finiteN(deg, 'Угол поворота должен быть числом');
    return edit(d, c => { const r = roomEd(c, roomId), p = posOf(r), ctr = about || meanPt(worldRoom(r)), a = rad(deg), cs = Math.cos(a), sn = Math.sin(a), ox = p.x - ctr.x, oy = p.y - ctr.y;
      setPos(r, ctr.x + ox * cs - oy * sn, ctr.y + ox * sn + oy * cs, p.rot + deg); });
  }
  function linkIn(c, aId, bId) {
    const a = c.walls.find(x => x.id === aId), b = c.walls.find(x => x.id === bId); if (!a || !b) throw new Error('Стена не найдена');
    if (!a.roomId || !b.roomId || a.roomId === b.roomId) throw new Error('Общая стена — это две стены разных помещений');
    if (!(a.src.shared === bId && b.src.shared === aId)) { clearShared(c, a, c.notes); clearShared(c, b, c.notes); a.src.shared = bId; b.src.shared = aId; }
    if (!unk(a.src.len) && !unk(b.src.len) && Math.abs(a.src.len - b.src.len) > 1e-6) c.notes.push('Длины связанных стен различаются (' + fmtM(a.src.len) + ' и ' + fmtM(b.src.len) + ' м): общая только часть стены');
    if (a.a && b.a) { const ra = c.rooms.find(x => x.id === a.roomId), rb = c.rooms.find(x => x.id === b.roomId), t = touch({a: toWorld(ra, a.a), b: toWorld(ra, a.b)}, {a: toWorld(rb, b.a), b: toWorld(rb, b.b)}, MOVE_TOL, ANG_TOL);
      if (!t || !(t.overlap > 1e-6)) c.notes.push('На плане эти стены не лежат рядом: сдвиньте комнату или «Прижать к другой стене»'); }
  }
  const linkWalls = (d, aId, bId) => edit(d, c => { linkIn(c, aId, bId); });
  const unlinkWall = (d, wallId) => edit(d, c => { const w = c.walls.find(x => x.id === wallId); if (!w) throw new Error('Стена не найдена: ' + wallId); if (unk(w.src.shared)) throw new Error('У стены нет общей стены');
    const o = c.walls.find(x => x.id === w.src.shared); if (o) delete o.src.shared; delete w.src.shared; });
  // Прижать комнату стены wallId к стене targetId другой комнаты: комната поворачивается и сдвигается так, чтобы стены легли вплотную (внутренности по разные стороны),
  // начало одной совпало с концом другой (угол к углу; дальше — перетаскиванием). opts.link (по умолчанию да) — связать стены как общие
  function alignRoomToWall(d, wallId, targetId, opts) {
    opts = opts || {};
    return edit(d, c => { const w = c.walls.find(x => x.id === wallId), t = c.walls.find(x => x.id === targetId); if (!w || !t) throw new Error('Стена не найдена');
      if (!w.roomId || !t.roomId || w.roomId === t.roomId) throw new Error('Выберите стену другого помещения'); const r = roomEd(c, w.roomId), tr = roomEd(c, t.roomId);
      const wa = toWorld(r, w.a), wb = toWorld(r, w.b), ta = toWorld(tr, t.a), tb = toWorld(tr, t.b), same = (signedArea(r.vertices) >= 0) === (signedArea(tr.vertices) >= 0);
      const hm = Math.atan2(wb.y - wa.y, wb.x - wa.x), ht = Math.atan2(tb.y - ta.y, tb.x - ta.x) + (same ? Math.PI : 0), th = normAngle(deg(ht - hm)), a = rad(th), cs = Math.cos(a), sn = Math.sin(a), p = posOf(r), ox = p.x - wa.x, oy = p.y - wa.y;
      const anchor = same ? tb : ta; setPos(r, wa.x + ox * cs - oy * sn + (anchor.x - wa.x), wa.y + ox * sn + oy * cs + (anchor.y - wa.y), p.rot + th);
      if (opts.link !== false) linkIn(c, wallId, targetId); });
  }
  // Предложения общих стен: пары стен разных помещений, лежащие на плане рядом (параллельны, зазор ≤ tol, есть общий кусок), ещё не связанные. opts: {tol (0.05 м), roomId}
  function findSharedWalls(d, opts) {
    opts = opts || {}; const tol = unk(opts.tol) ? MOVE_TOL : +opts.tol, E = worldEdges(d), out = [];
    for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) { const e = E[i], f = E[j]; if (e.roomId === f.roomId) continue; if (opts.roomId && e.roomId !== opts.roomId && f.roomId !== opts.roomId) continue;
      const we = d.walls.find(x => x.id === e.wallId), wf = d.walls.find(x => x.id === f.wallId); if (we.src.shared === f.wallId && wf.src.shared === e.wallId) continue;
      const t = touch(e, f, tol, ANG_TOL); if (t && t.overlap > Math.max(tol, 1e-6)) out.push({a: e.wallId, b: f.wallId, overlap: round9(t.overlap), lenA: we.src.len, lenB: wf.src.len, gap: round9(Math.abs(t.off))}); }
    return out.sort((x, y) => y.overlap - x.overlap);
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

  SM.planner = Object.assign(SM.planner || {}, {VERSION: '0.5.0', CONTRACT: 1,
    fromGeometry, toGeometry, moveVertex, snapPoint, toWorld, toLocal, finish, measure, describe, createHistory, vertexAngle, nearestOnContour, snapRoomMove, findSharedWalls,
    ops: {moveVertex, setWallLength, setVertexAngle, splitWall, removeVertex, setWallProps, setRoomProps, addRoomFromPoints, addRoomRect, addRoomL, removeRoom, splitRoom, addOpening, moveOpening, setOpeningProps, attachOpening, detachOpening, removeOpening, moveRoom, rotateRoom, linkWalls, unlinkWall, alignRoomToWall}});
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
