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

  // deriveRoom -> {closed, floor, ceiling, perimeter, wallArea, openingsArea, walls:[{id,len,height,gross,openings,net}], issues[]}; неизвестное = null
  SM.geo = {
    polygon,
    deriveRoom(model, room) {
      const issues = [], poly = polygon(model, room);
      const R = {closed: poly.ok, floor: null, ceiling: null, perimeter: null, wallArea: null, openingsArea: null, walls: [], issues};
      if (poly.walls && poly.walls.every(w => !unk(w.len))) R.perimeter = poly.walls.reduce((s, w) => s + w.len, 0);
      if (!poly.ok) { issues.push(poly.issue); }
      else { R.floor = R.ceiling = area(poly.pts); }
      let wa = 0, oa = 0, wallOk = !!poly.walls;
      for (const w of poly.walls || []) {
        const height = !unk(w.height) ? +w.height : room.height, ops = model.openings.filter(o => o.wallId === w.id);
        const row = {id: w.id, len: w.len, height: unk(height) ? null : +height, gross: null, openings: 0, net: null};
        if (row.height === null) { issues.push('не указана высота стены «' + (w.name || w.id) + '»'); wallOk = false; }
        else row.gross = w.len * row.height;
        let bad = false;
        for (const o of ops) { if (unk(o.w) || unk(o.h)) { issues.push('не указан размер проёма «' + (o.kind || o.id) + '»'); bad = true; } else row.openings += o.w * o.h; }
        if (row.gross !== null && !bad) { row.net = row.gross - row.openings; wa += row.net; oa += row.openings; } else wallOk = false;
        R.walls.push(row);
      }
      if (wallOk) { R.wallArea = wa; R.openingsArea = oa; }
      return R;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
