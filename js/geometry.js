/* Геометрия: помещение = замкнутый контур из N стен (длина + поворот в конце стены). Всё производное — считается, не хранится.
   model = {walls:[{id,len,turn?,height?,name?,material?}], openings:[{id,wallId,kind,w,h}], rooms:[{id,name,height,wallIds:[...]}]}
   turn — поворот в конце стены в градусах: +90 влево (против часовой), −90 вправо; по умолчанию 90. Неизвестное значение = null. */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {};
  const rad = d => d * Math.PI / 180, unk = v => SM.isUnknown(v);

  function polygon(model, room) {
    const walls = room.wallIds.map(id => model.walls.find(w => w.id === id));
    if (walls.some(w => !w)) return {ok: false, issue: 'в помещении есть ссылка на несуществующую стену'};
    if (walls.length < 3) return {ok: false, issue: 'нужно минимум 3 стены'};
    if (walls.some(w => unk(w.len))) return {ok: false, issue: 'не у всех стен известна длина'};
    let x = 0, y = 0, h = 0; const pts = [{x, y}];
    walls.forEach((w, i) => {
      x += w.len * Math.cos(rad(h)); y += w.len * Math.sin(rad(h)); pts.push({x, y});
      if (i < walls.length - 1) h += unk(w.turn) ? 90 : +w.turn;
    });
    const gap = Math.hypot(x, y);
    return {ok: gap < 1e-6, pts: pts.slice(0, -1), gap, walls, issue: gap < 1e-6 ? null : 'контур не замкнут: зазор ' + (Math.round(gap * 1000) / 1000) + ' м (проверьте длины и углы)'};
  }
  const area = pts => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0)) / 2;

  // deriveRoom -> {closed, floor, ceiling, perimeter, wallArea, openingsArea, reveals, walls:[{id,len,height,gross,openings,net}], issues[]}; неизвестное = null
  // reveals — площадь откосов проёмов, м² (D43): полный периметр проёма × толщина его стены; нет проёмов → 0; нет стены/размера/толщины → null
  // Пересечение отрезков (без касания в общих вершинах): для проверки самопересечения контура
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const segX = (p1, p2, p3, p4) => { const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4), e = 1e-9;
    return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e)); };
  const selfX = pts => { const n = pts.length; for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (segX(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true; } return false; };

  // validate(model) -> {ok, issues:[{level:'error'|'warn'|'info', code, text, id}]}. ok = нет ошибок. Единый валидатор геометрии для UI, импорта и CAD-модуля (docs/CAD_CONTRACT.md).
  // Неизвестное (null) — не ошибка. Ошибка = данные нельзя использовать (битые ссылки, повтор id, длина ≤ 0, замкнутый контур не сходится).
  function validate(model) { const out = [], add = (level, code, text, id) => out.push({level, code, text, id: id || null});
    model = model || {}; const W = model.walls || [], O = model.openings || [], Rm = model.rooms || [];
    for (const [list, what] of [[W, 'стены'], [O, 'проёма'], [Rm, 'помещения']]) { const seen = new Set(); for (const x of list) { if (!x || !x.id) add('error', 'no_id', 'У ' + what + ' нет id'); else if (seen.has(x.id)) add('error', 'dup_id', 'Повторяется id ' + what + ': ' + x.id, x.id); else seen.add(x.id); } }
    const wall = new Map(W.map(w => [w.id, w])), roomIds = new Set(Rm.map(r => r.id));
    for (const w of W) { if (!unk(w.len) && !(+w.len > 0)) add('error', 'bad_len', 'Длина стены «' + (w.name || w.id) + '» должна быть больше 0', w.id); if (!unk(w.turn) && !isFinite(+w.turn)) add('error', 'bad_turn', 'Поворот стены «' + (w.name || w.id) + '» не число', w.id); }
    for (const o of O) { if (o.wallId && !wall.has(o.wallId)) add('error', 'opening_wall', 'Проём «' + (o.kind || o.id) + '» ссылается на несуществующую стену', o.id);
      if (o.roomId && !roomIds.has(o.roomId)) add('error', 'opening_room', 'Проём «' + (o.kind || o.id) + '» ссылается на несуществующее помещение', o.id);
      if (!o.wallId) add('info', 'opening_loose', 'Проём «' + (o.kind || o.id) + '» не привязан к стене', o.id);
      const w = wall.get(o.wallId); if (w && !unk(w.len) && !unk(o.at) && !unk(o.w) && +o.at + +o.w > +w.len + 1e-9) add('warn', 'opening_out', 'Проём «' + (o.kind || o.id) + '» выходит за край стены', o.id); }
    for (const r of Rm) { const p = polygon(model, r), name = r.name || r.id;
      if (!p.ok) { const unknownLen = r.wallIds.some(id => wall.has(id) && unk(wall.get(id).len)); add(unknownLen ? 'warn' : 'error', unknownLen ? 'unknown_len' : 'not_closed', 'Помещение «' + name + '»: ' + p.issue, r.id); continue; }
      if (selfX(p.pts)) add('warn', 'self_intersect', 'Контур помещения «' + name + '» пересекает сам себя', r.id); }
    return {ok: !out.some(x => x.level === 'error'), issues: out}; }

  SM.geo = {
    polygon, validate,
    deriveRoom(model, room) {
      const issues = [], poly = polygon(model, room);
      const R = {closed: poly.ok, floor: null, ceiling: null, perimeter: null, wallArea: null, openingsArea: null, reveals: null, walls: [], issues};
      if (poly.walls && poly.walls.every(w => !unk(w.len))) R.perimeter = poly.walls.reduce((s, w) => s + w.len, 0);
      if (!poly.ok) { issues.push(poly.issue); }
      else { R.floor = R.ceiling = area(poly.pts); }
      let wa = 0, oa = 0, wallOk = !!poly.walls;
      for (const w of poly.walls || []) {
        const height = !unk(w.height) ? +w.height : room.height, ops = (model.openings || []).filter(o => o.wallId === w.id);
        const row = {id: w.id, len: w.len, height: unk(height) ? null : +height, gross: null, openings: 0, net: null};
        if (row.height === null) { issues.push('не указана высота стены «' + (w.name || w.id) + '»'); wallOk = false; }
        else row.gross = w.len * row.height;
        let bad = false;
        for (const o of ops) { if (unk(o.w) || unk(o.h)) { issues.push('не указан размер проёма «' + (o.kind || o.id) + '»'); bad = true; } else row.openings += o.w * o.h; }
        if (row.gross !== null && !bad) { row.net = row.gross - row.openings; wa += row.net; oa += row.openings; } else wallOk = false;
        R.walls.push(row);
      }
      // проёмы без привязки к стене (wallId пуст, но roomId = это помещение): на площадь стен в целом влияют так же
      let loose = 0, looseBad = false;
      for (const o of model.openings || []) if (!o.wallId && o.roomId === room.id) {
        if (!unk(o.area)) loose += +o.area; else if (unk(o.w) || unk(o.h)) { issues.push('не указан размер проёма «' + (o.kind || o.id) + '»'); looseBad = true; } else loose += o.w * o.h;
      }
      if (loose) issues.push('есть проёмы без привязки к стене: общая площадь стен верна, по отдельным стенам — нет');
      if (wallOk && !looseBad) { R.wallArea = wa - loose; R.openingsArea = oa + loose; }
      if (poly.walls) { let rv = 0, rvOk = true; const ids = new Set(poly.walls.map(w => w.id));
        for (const o of model.openings || []) { const mine = o.wallId ? ids.has(o.wallId) : o.roomId === room.id; if (!mine) continue;
          const wall = o.wallId ? poly.walls.find(w => w.id === o.wallId) : null;
          if (!wall || unk(o.w) || unk(o.h) || unk(wall.thickness)) { rvOk = false; continue; } rv += 2 * (+o.w + +o.h) * +wall.thickness; }
        R.reveals = rvOk ? rv : null; }
      return R;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
