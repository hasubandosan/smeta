/* CAD-планировщик, интерфейс (SVG). Срез 2: только просмотр — помещения, стены, проёмы, предметы, размеры, сетка, масштаб/сдвиг, выбор.
   Ничего не хранит и не обращается к localStorage/fetch; всё получает через opts (docs/CAD_CONTRACT.md, раздел 5). Мышь и касание (pointer events). */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, P = SM.planner = SM.planner || {};
  const NS = 'http://www.w3.org/2000/svg', unk = v => SM.isUnknown(v);
  const clone = x => x === undefined ? x : JSON.parse(JSON.stringify(x));
  const fmt = v => unk(v) ? '?' : String(Math.round(+v * 100) / 100).replace('.', ',');
  const STEPS = [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50, 100, 500];
  const CSS = '.pl-bg{fill:var(--pl-bg,transparent)}.pl-grid{stroke:var(--pl-grid,#d9dde3);stroke-width:1;fill:none}.pl-axis{stroke:var(--pl-axis,#aab1bb);stroke-width:1.5;fill:none}' +
    '.pl-room{fill:var(--pl-room,#eef3fb);stroke:none;cursor:pointer}.pl-room.bad{fill:none;stroke:var(--pl-warn,#c77700);stroke-dasharray:6 4;stroke-width:2}' +
    '.pl-wall{stroke:var(--pl-wall,#39424e);stroke-linecap:butt;fill:none}.pl-hit{stroke:transparent;stroke-width:14;fill:none;cursor:pointer}' +
    '.pl-open{stroke-linecap:butt;fill:none;stroke:var(--pl-open,#7a8594)}.pl-open.door{stroke:var(--pl-door,#a0642a)}.pl-open.win{stroke:var(--pl-win,#2a7fc7)}' +
    '.pl-fix{fill:var(--pl-fix,#fff);stroke:var(--pl-fixl,#5a6472);stroke-width:1.5;cursor:pointer}.pl-sel{stroke:var(--pl-sel,#e0301e)!important;stroke-width:3.5!important}.pl-room.pl-sel{fill:var(--pl-roomsel,#fde9e6)}' +
    '.pl-txt{fill:var(--pl-text,#1f2630);font:12px system-ui,sans-serif;pointer-events:none}.pl-dim{fill:var(--pl-dim,#4a5563);font:11px system-ui,sans-serif;pointer-events:none}.pl-note{fill:var(--pl-dim,#4a5563);font:11px system-ui,sans-serif}';
  const kindClass = k => /дверь|door/i.test(k || '') ? 'door' : /окно|window/i.test(k || '') ? 'win' : '';

  P.mount = function (el, opts) {
    opts = opts || {};
    const doc = el.ownerDocument, mk = (tag, a, parent) => { const e = doc.createElementNS(NS, tag); for (const k in (a || {})) e.setAttribute(k, a[k]); if (parent) parent.appendChild(e); return e; };
    const wrap = doc.createElement('div'); wrap.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;touch-action:none;user-select:none';
    const svg = mk('svg', {width: '100%', height: '100%', role: 'img', 'aria-label': 'План помещений'}); svg.style.cssText = 'display:block;width:100%;height:100%';
    const bar = doc.createElement('div'); bar.style.cssText = 'position:absolute;right:8px;top:8px;display:flex;flex-direction:column;gap:6px';
    const btn = (txt, title, f) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = txt; b.title = title; b.setAttribute('aria-label', title); b.style.cssText = 'width:38px;height:38px;font-size:18px;cursor:pointer'; b.addEventListener('click', f); bar.appendChild(b); return b; };
    wrap.appendChild(svg); wrap.appendChild(bar); el.appendChild(wrap);

    let geometry = clone(opts.geometry) || {walls: [], openings: [], rooms: []}, drawing, readOnly = opts.readOnly !== false, sel = [], view = {k: 50, tx: 0, ty: 0}, fitted = false, scheduled = false, dead = false;
    const size = () => { const r = wrap.getBoundingClientRect ? wrap.getBoundingClientRect() : {}; return {w: r.width || wrap.clientWidth || 800, h: r.height || wrap.clientHeight || 600}; };
    const raf = root.requestAnimationFrame ? f => root.requestAnimationFrame(f) : f => f();
    const worldPts = r => r.vertices.map(v => P.toWorld(r, v));

    function bounds() {
      let b = null; const add = p => { b = b ? {x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x), y1: Math.max(b.y1, p.y)} : {x0: p.x, y0: p.y, x1: p.x, y1: p.y}; };
      drawing.rooms.forEach(r => { if (r.vertices) worldPts(r).forEach(add); }); return b;
    }
    function fitTo(b) {
      const s = size(); if (!b) { view = {k: 50, tx: s.w / 2, ty: s.h / 2}; return; }
      const pad = 48, w = Math.max(b.x1 - b.x0, 0.5), h = Math.max(b.y1 - b.y0, 0.5), k = Math.min((s.w - 2 * pad) / w, (s.h - 2 * pad) / h);
      view.k = Math.max(k, 0.01); view.tx = s.w / 2 - (b.x0 + b.x1) / 2 * view.k; view.ty = s.h / 2 + (b.y0 + b.y1) / 2 * view.k;
    }
    const S = p => [p.x * view.k + view.tx, -p.y * view.k + view.ty];
    const poly = pts => pts.map(p => S(p).map(n => Math.round(n * 100) / 100).join(',')).join(' ');
    const isSel = id => sel.indexOf(id) >= 0;

    function render() {
      scheduled = false; if (dead) return;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const s = size(), k = view.k; svg.setAttribute('viewBox', '0 0 ' + s.w + ' ' + s.h);
      mk('style', {}, svg).textContent = CSS; mk('rect', {class: 'pl-bg', x: 0, y: 0, width: s.w, height: s.h}, svg);
      // сетка (только для ориентира; шаг подбирается по масштабу)
      const step = STEPS.find(x => x * k >= 24) || STEPS[STEPS.length - 1], x0 = -view.tx / k, x1 = (s.w - view.tx) / k, y1 = view.ty / k, y0 = (view.ty - s.h) / k;
      let d = ''; for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { const px = Math.round(x * k + view.tx) + 0.5; d += 'M' + px + ' 0V' + s.h; }
      for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { const py = Math.round(-y * k + view.ty) + 0.5; d += 'M0 ' + py + 'H' + s.w; }
      mk('path', {class: 'pl-grid', d}, svg);
      mk('path', {class: 'pl-axis', d: 'M' + (view.tx + 0.5) + ' 0V' + s.h + 'M0 ' + (view.ty + 0.5) + 'H' + s.w}, svg);
      mk('text', {class: 'pl-note', x: 8, y: s.h - 8}, svg).textContent = 'шаг сетки ' + fmt(step) + ' м';
      const roomOf = new Map(drawing.rooms.map(r => [r.id, r])), wallRoom = new Map(drawing.walls.map(w => [w.id, roomOf.get(w.roomId)]));
      // помещения
      for (const r of drawing.rooms) { if (!r.vertices) continue; const pts = worldPts(r);
        mk('polygon', {class: 'pl-room' + (r.closed ? '' : ' bad') + (isSel(r.id) ? ' pl-sel' : ''), points: poly(pts), 'data-id': r.id, 'data-kind': 'room'}, svg); }
      // предметы
      for (const f of drawing.fixtures) { const r = roomOf.get(f.src.roomId), q = f.src; if (!r || unk(q.x) || unk(q.y)) continue;
        const c = S(P.toWorld(r, {x: +q.x, y: +q.y}));
        if (unk(q.w) || unk(q.d)) { mk('circle', {class: 'pl-fix' + (isSel(f.id) ? ' pl-sel' : ''), cx: c[0], cy: c[1], r: 6, 'data-id': f.id, 'data-kind': 'fixture'}, svg); }
        else { const a = (+q.rot || 0) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), hw = q.w / 2, hd = q.d / 2;
          const pts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => P.toWorld(r, {x: +q.x + u * cs - v * sn, y: +q.y + u * sn + v * cs}));
          mk('polygon', {class: 'pl-fix' + (isSel(f.id) ? ' pl-sel' : ''), points: poly(pts), 'data-id': f.id, 'data-kind': 'fixture'}, svg); }
        const t = mk('text', {class: 'pl-dim', x: c[0], y: c[1] + 4, 'text-anchor': 'middle'}, svg); t.textContent = q.name || q.kind || ''; }
      // стены и размеры
      for (const w of drawing.walls) { const r = wallRoom.get(w.id); if (!w.a || !r) continue;
        const A = S(P.toWorld(r, w.a)), B = S(P.toWorld(r, w.b)), th = unk(w.src.thickness) || !(+w.src.thickness > 0) ? 2 : Math.max(2, w.src.thickness * k), at = {x1: A[0], y1: A[1], x2: B[0], y2: B[1]};
        mk('line', Object.assign({class: 'pl-wall' + (isSel(w.id) ? ' pl-sel' : ''), 'stroke-width': th}, at), svg);
        mk('line', Object.assign({class: 'pl-hit', 'data-id': w.id, 'data-kind': 'wall'}, at), svg); }
      // проёмы
      for (const o of drawing.openings) { if (!o.p1) continue; const r = wallRoom.get(o.src.wallId); if (!r) continue; const A = S(P.toWorld(r, o.p1)), B = S(P.toWorld(r, o.p2)), w = drawing.walls.find(x => x.id === o.src.wallId);
        const th = Math.max(5, w && !unk(w.src.thickness) ? w.src.thickness * k + 2 : 5), at = {x1: A[0], y1: A[1], x2: B[0], y2: B[1]};
        mk('line', Object.assign({class: 'pl-open ' + kindClass(o.src.kind) + (isSel(o.id) ? ' pl-sel' : ''), 'stroke-width': th}, at), svg);
        mk('line', Object.assign({class: 'pl-hit', 'data-id': o.id, 'data-kind': 'opening'}, at), svg); }
      // подписи длин стен (снаружи контура) и названия помещений
      for (const r of drawing.rooms) { if (!r.vertices || !r.closed) continue; const pts = worldPts(r), n = pts.length;
        const area2 = pts.reduce((a, p, i) => a + p.x * pts[(i + 1) % n].y - pts[(i + 1) % n].x * p.y, 0), ccw = area2 >= 0;
        (r.src.wallIds || []).forEach((id, i) => { const w = drawing.walls.find(x => x.id === id); if (!w) return; const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b.x - a.x, b.y - a.y); if (L * k < 30) return;
          const dx = (b.x - a.x) / L, dy = (b.y - a.y) / L, nx = ccw ? dy : -dy, ny = ccw ? -dx : dx, m = S({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});
          const t = mk('text', {class: 'pl-dim', x: m[0] + nx * 14, y: m[1] - ny * 14 + 4, 'text-anchor': 'middle'}, svg); t.textContent = fmt(w.src.len); });
        let cx = 0, cy = 0; pts.forEach(p => { cx += p.x / n; cy += p.y / n; }); const c = S({x: cx, y: cy});
        const t = mk('text', {class: 'pl-txt', x: c[0], y: c[1], 'text-anchor': 'middle'}, svg); t.textContent = r.src.name || '';
        if (r.area !== null) { const a = mk('text', {class: 'pl-dim', x: c[0], y: c[1] + 15, 'text-anchor': 'middle'}, svg); a.textContent = fmt(r.area) + ' м²'; } }
    }
    const schedule = () => { if (scheduled || dead) return; scheduled = true; raf(render); };
    function load(g) { geometry = clone(g) || {walls: [], openings: [], rooms: []}; drawing = P.fromGeometry(geometry); sel = sel.filter(id => !!P.describe(geometry, id));
      if (typeof opts.onIssues === 'function') opts.onIssues(SM.geo.validate(geometry).issues); }
    function zoomAt(f, cx, cy) { const k = Math.min(1e5, Math.max(0.01, view.k * f)), r = k / view.k; view.tx = cx - (cx - view.tx) * r; view.ty = cy - (cy - view.ty) * r; view.k = k; schedule(); }
    const center = () => { const s = size(); return [s.w / 2, s.h / 2]; };
    function setSel(ids, user) { sel = ids; render(); if (user && typeof opts.onSelect === 'function') opts.onSelect(sel.slice()); }

    // жесты: один палец/мышь — сдвиг (без смещения — выбор), два пальца — масштаб, колесо — масштаб
    const ptr = new Map(); let down = null, pinch = null;
    const local = e => { const r = wrap.getBoundingClientRect ? wrap.getBoundingClientRect() : {left: 0, top: 0}; return [e.clientX - (r.left || 0), e.clientY - (r.top || 0)]; };
    svg.addEventListener('pointerdown', e => { const p = local(e); ptr.set(e.pointerId, p);
      if (ptr.size === 1) { const t = e.target && e.target.closest ? e.target.closest('[data-id]') : null; down = {x: p[0], y: p[1], id: t ? t.getAttribute('data-id') : null, moved: false, tx: view.tx, ty: view.ty}; }
      else { down = null; const [a, b] = [...ptr.values()]; pinch = {d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1}; }
      try { svg.setPointerCapture(e.pointerId); } catch (_) {} });
    svg.addEventListener('pointermove', e => { if (!ptr.has(e.pointerId)) return; const p = local(e); ptr.set(e.pointerId, p);
      if (ptr.size === 2 && pinch) { const [a, b] = [...ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; zoomAt(d / pinch.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch.d = d; }
      else if (down) { const dx = p[0] - down.x, dy = p[1] - down.y; if (down.moved || Math.hypot(dx, dy) > 4) { down.moved = true; view.tx = down.tx + dx; view.ty = down.ty + dy; schedule(); } } });
    const up = e => { if (!ptr.has(e.pointerId)) return; ptr.delete(e.pointerId);
      if (down && !down.moved && e.type === 'pointerup') { if (down.id) { const id = down.id; setSel(e.shiftKey ? (isSel(id) ? sel.filter(x => x !== id) : sel.concat(id)) : [id], true); } else if (sel.length) setSel([], true); }
      if (ptr.size < 2) pinch = null; if (ptr.size === 0) down = null; };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', e => { e.preventDefault(); const p = local(e); zoomAt(Math.exp(-e.deltaY * 0.0015), p[0], p[1]); }, {passive: false});

    const fitAll = () => { fitTo(bounds()); fitted = true; render(); };
    btn('+', 'Приблизить', () => { const c = center(); zoomAt(1.4, c[0], c[1]); });
    btn('−', 'Отдалить', () => { const c = center(); zoomAt(1 / 1.4, c[0], c[1]); });
    btn('⤢', 'Показать всё', fitAll);
    load(geometry); fitAll();

    return {
      setGeometry(g) { load(g); fitted ? render() : fitAll(); },
      getGeometry: () => clone(geometry),
      select(ids) { setSel(ids == null ? [] : [].concat(ids).filter(id => !!P.describe(geometry, id)), false); },
      selected: () => sel.slice(),
      focus(roomId) { const r = drawing.rooms.find(x => x.id === roomId); if (!r || !r.vertices) return false; const pts = worldPts(r); fitTo({x0: Math.min(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), x1: Math.max(...pts.map(p => p.x)), y1: Math.max(...pts.map(p => p.y))}); render(); return true; },
      fit: fitAll, zoomIn() { const c = center(); zoomAt(1.4, c[0], c[1]); }, zoomOut() { const c = center(); zoomAt(1 / 1.4, c[0], c[1]); },
      setReadOnly(v) { readOnly = !!v; }, isReadOnly: () => readOnly,   // правка стен — срез 3; пока просмотр в любом режиме
      undo: () => false, redo: () => false,
      view: () => Object.assign({}, view), flush: render,
      destroy() { dead = true; if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
