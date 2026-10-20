/* CAD-планировщик, интерфейс (SVG). Срез 2: просмотр. Срез 3: правка стен — вершины мышью/пальцем, длина и угол числом, разделение стены, убрать угол, новые комнаты, перегородка, отмена/повтор.
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
    '.pl-vtx{fill:var(--pl-vtxfill,#fff);stroke:var(--pl-sel,#e0301e);stroke-width:2;cursor:move}.pl-vtx.pl-sel{fill:var(--pl-sel,#e0301e)}.pl-mark{fill:var(--pl-sel,#e0301e);stroke:none;pointer-events:none}' +
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
    let history = P.createHistory(geometry), preview = null, grid = unk(opts.grid) || !(+opts.grid > 0) ? null : +opts.grid, mode = null, addOpen = false, msg = {text: '', level: ''}, created = null;
    const D = () => preview || drawing, vid = (r, i) => 'v:' + r + ':' + i, parseVid = id => { if (typeof id !== 'string' || id.slice(0, 2) !== 'v:') return null; const k = id.lastIndexOf(':'); return {roomId: id.slice(2, k), index: +id.slice(k + 1)}; };
    const validSel = id => { const v = parseVid(id); if (v) { const r = drawing.rooms.find(x => x.id === v.roomId); return !!(r && r.vertices && v.index < r.vertices.length); } return !!P.describe(geometry, id); };
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
      const s = size(), k = view.k, drawing = D(); svg.setAttribute('viewBox', '0 0 ' + s.w + ' ' + s.h);
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
          // ручки вершин (правка) и точки перегородки
      if (!readOnly) { const rs = handleRooms();
        for (const r of drawing.rooms) { if (!rs.has(r.id) || !r.vertices || !r.closed) continue;
          r.vertices.forEach((v, i) => { const c = S(P.toWorld(r, v)), id = vid(r.id, i); mk('circle', {class: 'pl-vtx' + (isSel(id) ? ' pl-sel' : ''), cx: c[0], cy: c[1], r: 8, 'data-vid': id, 'data-kind': 'vertex'}, svg); }); } }
      if (mode) { const r = drawing.rooms.find(x => x.id === mode.roomId); if (r) mode.pts.forEach(q => { const c = S(P.toWorld(r, q)); mk('circle', {class: 'pl-mark', cx: c[0], cy: c[1], r: 6}, svg); }); }
    }
    const schedule = () => { if (scheduled || dead) return; scheduled = true; raf(render); };
    function load(g) { geometry = clone(g) || {walls: [], openings: [], rooms: []}; drawing = P.fromGeometry(geometry); preview = null; sel = sel.filter(validSel);
      if (typeof opts.onIssues === 'function') opts.onIssues(SM.geo.validate(geometry).issues); }
    function zoomAt(f, cx, cy) { const k = Math.min(1e5, Math.max(0.01, view.k * f)), r = k / view.k; view.tx = cx - (cx - view.tx) * r; view.ty = cy - (cy - view.ty) * r; view.k = k; schedule(); }
    const center = () => { const s = size(); return [s.w / 2, s.h / 2]; };
    function setSel(ids, user) { sel = ids; render(); panelRender(); if (user && typeof opts.onSelect === 'function') opts.onSelect(sel.slice()); }
    function handleRooms() { const out = new Set(); sel.forEach(id => { const v = parseVid(id); if (v) { out.add(v.roomId); return; } const d = P.describe(geometry, id); if (!d) return;
      if (d.kind === 'room') out.add(id); else if (d.kind === 'wall') { const w = drawing.walls.find(x => x.id === id); if (w && w.roomId) out.add(w.roomId); } }); return out; }
    const unproject = p => ({x: (p[0] - view.tx) / view.k, y: (view.ty - p[1]) / view.k});
    function setMsg(text, level) { msg = {text: text || '', level: level || ''}; if (statusEl) { statusEl.textContent = msg.text; statusEl.style.color = msg.level === 'error' ? '#d33' : 'inherit'; } }

    // Зафиксировать правку: геометрия принимается только если SM.geo.validate даёт ok (иначе откат с понятным сообщением)
    function commit(d2, reason) {
      let g, v; try { g = P.toGeometry(d2, geometry); v = SM.geo.validate(g); } catch (e) { preview = null; setMsg(e.message, 'error'); render(); return {ok: false, message: e.message}; }
      if (!v.ok) { const e = v.issues.find(x => x.level === 'error'), m = 'Так нельзя: ' + (e ? e.text : 'геометрия не проходит проверку'); preview = null; setMsg(m, 'error'); render(); panelRender(); return {ok: false, message: m}; }
      geometry = g; history.push(g, reason); drawing = P.fromGeometry(g); preview = null; created = d2.created || null;
      if (created && created.roomId) { sel = [created.roomId]; fitted = true; fitTo(bounds()); } sel = sel.filter(validSel);
      setMsg((d2.notes || []).join('. '), ''); if (typeof opts.onChange === 'function') opts.onChange(clone(g), {reason}); if (typeof opts.onIssues === 'function') opts.onIssues(v.issues);
      chrome(); render(); panelRender(); return {ok: true, message: msg.text, created};
    }
    function edit(name, ...args) {
      if (readOnly) return {ok: false, message: 'Режим просмотра: правка отключена'};
      const f = P.ops[name]; if (!f) return {ok: false, message: 'Неизвестная операция: ' + name}; let d2; try { d2 = f(drawing, ...args); } catch (e) { setMsg(e.message, 'error'); panelRender(); return {ok: false, message: e.message}; }
      return commit(d2, name);
    }
    function jump(g, reason) { geometry = g; drawing = P.fromGeometry(g); preview = null; sel = sel.filter(validSel); mode = null; setMsg('', ''); if (typeof opts.onChange === 'function') opts.onChange(clone(g), {reason}); if (typeof opts.onIssues === 'function') opts.onIssues(SM.geo.validate(g).issues); chrome(); render(); panelRender(); }
    function undo() { if (readOnly || !history.canUndo()) return false; jump(history.undo(), 'undo'); return true; }
    function redo() { if (readOnly || !history.canRedo()) return false; jump(history.redo(), 'redo'); return true; }


    // ----- панель правки и панель инструментов (только когда readOnly = false) -----
    const H = (tag, st, txt) => { const e = doc.createElement(tag); if (st) e.style.cssText = st; if (txt != null) e.textContent = txt; return e; };
    const tool = H('div', 'position:absolute;left:8px;top:8px;display:flex;gap:6px'), panel = H('div', 'position:absolute;left:8px;right:56px;bottom:8px;max-height:45%;overflow:auto;padding:8px;background:Canvas;color:CanvasText;border:1px solid #8886;border-radius:6px;font:13px system-ui,sans-serif;touch-action:auto;user-select:text');
    let statusEl = null; wrap.tabIndex = 0; wrap.style.outline = 'none'; wrap.appendChild(tool); wrap.appendChild(panel);
    const tbtn = (txt, title, key, f) => { const b = H('button', 'min-width:38px;height:38px;font-size:17px;cursor:pointer', txt); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.setAttribute('data-act', key); b.addEventListener('click', f); tool.appendChild(b); return b; };
    const bUndo = tbtn('↶', 'Отменить', 'undo', () => { undo(); }), bRedo = tbtn('↷', 'Повторить', 'redo', () => { redo(); }), bAdd = tbtn('＋ Комната', 'Новая комната', 'add-room', () => { addOpen = !addOpen; mode = null; panelRender(); });
    function chrome() { tool.style.display = readOnly ? 'none' : 'flex'; bUndo.disabled = !history.canUndo(); bRedo.disabled = !history.canRedo(); }
    const num = v => { v = String(v).trim().replace(',', '.'); if (v === '') return null; const x = Number(v); if (!isFinite(x)) throw new Error('Введите число, например 3,5'); return x; };
    const show = v => unk(v) ? '' : String(Math.round(+v * 1000) / 1000).replace('.', ',');
    function run(f) { try { f(); } catch (e) { setMsg(e.message, 'error'); panelRender(); } }
    function sect(title) { const d = H('div', 'margin:4px 0'); if (title) d.appendChild(H('b', '', title)); panel.appendChild(d); return d; }
    function row(parent, label, value, key, btn, fn) {
      const r = H('div', 'display:flex;gap:6px;align-items:center;margin:3px 0;flex-wrap:wrap'), l = H('label', 'min-width:120px', label), i = H('input', 'width:90px;font:inherit;padding:3px'); i.type = 'text'; i.inputMode = 'decimal'; i.value = value; i.setAttribute('data-f', key);
      const go = () => run(() => fn(i.value)); i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } }); r.appendChild(l); r.appendChild(i);
      if (btn) { const b = H('button', 'font:inherit;padding:3px 8px;cursor:pointer', 'Применить'); b.type = 'button'; b.setAttribute('data-act', btn); b.addEventListener('click', go); r.appendChild(b); } parent.appendChild(r); return i; }
    function act(parent, text, key, fn) { const b = H('button', 'font:inherit;padding:3px 8px;margin:2px 6px 2px 0;cursor:pointer', text); b.type = 'button'; b.setAttribute('data-act', key); b.addEventListener('click', () => run(fn)); parent.appendChild(b); return b; }
    function choose(parent, label, key, list, val) { const r = H('div', 'margin:3px 0'), sel = H('select', 'font:inherit;padding:3px;max-width:100%'); sel.setAttribute('data-f', key); list.forEach(o => { const e = H('option', '', o[1]); e.value = o[0]; if (o[0] === val) e.selected = true; sel.appendChild(e); }); r.appendChild(H('label', 'margin-right:6px', label)); r.appendChild(sel); parent.appendChild(r); return sel; }
    function panelRender() {
      panel.textContent = ''; statusEl = null; if (readOnly) { panel.style.display = 'none'; return; } panel.style.display = 'block';
      const id = sel[0], vv = id ? parseVid(id) : null, d = id && !vv ? P.describe(geometry, id) : null;
      if (addOpen) { const f = sect('Новая комната'), kind = choose(f, 'Форма:', 'kind', [['rect', 'Прямоугольная'], ['L', 'Г-образная (вырез в правом верхнем углу)']], 'rect'), vals = {};
        [['name', 'Название', ''], ['w', 'Ширина, м', ''], ['h', 'Глубина, м', ''], ['cutW', 'Вырез: ширина, м', ''], ['cutH', 'Вырез: глубина, м', '']].forEach(x => { vals[x[0]] = row(f, x[1], x[2], x[0], null, () => {}); });
        vals.name.style.width = '150px'; act(f, 'Создать', 'create-room', () => { const b = bounds(), pos = b ? {x: b.x1 + 1, y: b.y0, rot: 0} : undefined, o = {name: vals.name.value.trim() || undefined, w: num(vals.w.value), h: num(vals.h.value), pos};
          if (kind.value === 'L') { o.cutW = num(vals.cutW.value); o.cutH = num(vals.cutH.value); } const r = edit(kind.value === 'L' ? 'addRoomL' : 'addRoomRect', o); if (r.ok) { addOpen = false; panelRender(); } });
        act(f, 'Отмена', 'cancel', () => { addOpen = false; panelRender(); }); }
      else if (mode) { const f = sect('Перегородка'); f.appendChild(H('div', '', mode.pts.length ? 'Укажите вторую точку на стене помещения (угол — точно в вершину).' : 'Укажите первую точку на стене помещения. Точная позиция: сначала «Разделить стену» числом, затем выберите углы.')); act(f, 'Отмена', 'cancel', () => { mode = null; panelRender(); render(); }); }
      else if (vv) { const r = drawing.rooms.find(x => x.id === vv.roomId); if (r && r.vertices && r.vertices[vv.index]) { const p = r.vertices[vv.index], f = sect('Угол ' + (vv.index + 1) + ' помещения «' + (r.src.name || r.id) + '»');
          row(f, 'x, м (в комнате)', show(p.x), 'vx', null, () => {}); row(f, 'y, м (в комнате)', show(p.y), 'vy', 'move-vertex', () => { const q = {x: num(panel.querySelector('[data-f=vx]').value), y: num(panel.querySelector('[data-f=vy]').value)}; if (q.x === null || q.y === null) throw new Error('Введите x и y'); edit('moveVertex', vv.roomId, vv.index, q); });
          row(f, 'Внутренний угол, °', show(P.vertexAngle(drawing, vv.roomId, vv.index)), 'angle', 'set-angle', v => edit('setVertexAngle', vv.roomId, vv.index, num(v))); act(f, 'Убрать угол (слить стены)', 'remove-vertex', () => { edit('removeVertex', vv.roomId, vv.index); }); } }
      else if (d && d.kind === 'wall') { const w = drawing.walls.find(x => x.id === id), r = w && drawing.rooms.find(x => x.id === w.roomId), i = r ? r.src.wallIds.indexOf(id) : -1, f = sect(d.title);
        if (!r || i < 0) f.appendChild(H('div', '', 'Стена не входит в помещение: править нельзя.')); else {
          const sw = row(f, 'Длина, м', show(w.src.len), 'len', 'set-len', v => edit('setWallLength', id, num(v), {anchor: panel.querySelector('[data-f=anchor]').value, mode: panel.querySelector('[data-f=mode]').value}));
          choose(f, 'Двигать:', 'anchor', [['start', 'конец стены (начало на месте)'], ['end', 'начало стены (конец на месте)']], 'start'); choose(f, 'Соседняя стена:', 'mode', [['push', 'сдвигается целиком (прямые углы сохраняются)'], ['end', 'остаётся, меняется только угол']], 'push');
          row(f, 'Толщина, м', show(w.src.thickness), 'thickness', 'set-thickness', v => edit('setWallProps', id, {thickness: num(v)})); row(f, 'Разделить на расстоянии, м', '', 'split-at', 'split', v => edit('splitWall', id, num(v)));
          f.appendChild(H('div', 'opacity:.7', 'Пустое расстояние — разделить пополам.')); const n = r.vertices.length; act(f, 'Убрать угол в конце стены', 'remove-end', () => { edit('removeVertex', r.id, (i + 1) % n); }); act(f, 'Убрать угол в начале стены', 'remove-start', () => { edit('removeVertex', r.id, i); }); } }
      else if (d && d.kind === 'room') { const r = geometry.rooms.find(x => x.id === id), f = sect(d.title); row(f, 'Название', unk(r.name) ? '' : r.name, 'name', 'set-name', v => edit('setRoomProps', id, {name: v})); row(f, 'Высота, м', show(r.height), 'height', 'set-height', v => edit('setRoomProps', id, {height: num(v)}));
        act(f, 'Перегородка…', 'partition', () => { mode = {kind: 'split', roomId: id, pts: []}; panelRender(); render(); }); act(f, 'Удалить помещение', 'remove-room', () => { edit('removeRoom', id); }); }
      else if (d) sect(d.title).appendChild(H('div', 'opacity:.7', 'Правка проёмов и предметов — в следующих срезах.'));
      else sect().appendChild(H('div', 'opacity:.7', 'Выберите помещение, стену или угол. Углы двигаются перетаскиванием.'));
      statusEl = H('div', 'margin-top:4px;min-height:1em'); statusEl.setAttribute('role', 'status'); statusEl.setAttribute('aria-live', 'polite'); panel.appendChild(statusEl); setMsg(msg.text, msg.level);
    }

    // жесты: один палец/мышь — сдвиг (без смещения — выбор), перетаскивание ручки — правка вершины, два пальца — масштаб, колесо — масштаб
    const ptr = new Map(); let down = null, pinch = null;
    const local = e => { const r = wrap.getBoundingClientRect ? wrap.getBoundingClientRect() : {left: 0, top: 0}; return [e.clientX - (r.left || 0), e.clientY - (r.top || 0)]; };
    svg.addEventListener('pointerdown', e => { const p = local(e); ptr.set(e.pointerId, p);
      if (ptr.size === 1) { const tg = e.target && e.target.closest ? e.target : null, t = tg ? tg.closest('[data-id],[data-vid]') : null, v = t && !readOnly && !mode ? parseVid(t.getAttribute('data-vid')) : null;
        down = {x: p[0], y: p[1], id: t ? (t.getAttribute('data-vid') || t.getAttribute('data-id')) : null, moved: false, tx: view.tx, ty: view.ty, vertex: v}; }
      else { down = null; preview = null; const [a, b] = [...ptr.values()]; pinch = {d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1}; }
      try { svg.setPointerCapture(e.pointerId); } catch (_) {} });
    function dragVertex(p) { const room = drawing.rooms.find(x => x.id === down.vertex.roomId); if (!room) return;
      const sn = P.snapPoint(drawing, unproject(p), {grid, tol: 10 / view.k, skip: {roomId: room.id, index: down.vertex.index}}), lp = P.toLocal(room, sn);
      try { preview = P.ops.moveVertex(drawing, room.id, down.vertex.index, lp); setMsg('', ''); } catch (err) { setMsg(err.message, 'error'); } schedule(); }
    svg.addEventListener('pointermove', e => { if (!ptr.has(e.pointerId)) return; const p = local(e); ptr.set(e.pointerId, p);
      if (ptr.size === 2 && pinch) { const [a, b] = [...ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; zoomAt(d / pinch.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch.d = d; }
      else if (down) { const dx = p[0] - down.x, dy = p[1] - down.y; if (down.moved || Math.hypot(dx, dy) > 4) { down.moved = true; if (down.vertex) dragVertex(p); else { view.tx = down.tx + dx; view.ty = down.ty + dy; schedule(); } } } });
    function modeClick(p) {
      const room = drawing.rooms.find(x => x.id === mode.roomId); if (!room) { mode = null; panelRender(); return; }
      const q = P.nearestOnContour(drawing, room.id, P.toLocal(room, unproject(p)), 10 / view.k); if (!q || q.dist * view.k > 16) { setMsg('Укажите точку на стене помещения', 'error'); return; }
      if (grid && q.vertex === null) { const i = room.src.wallIds.indexOf(q.wallId), a = room.vertices[i], b = room.vertices[(i + 1) % room.vertices.length], L = Math.hypot(b.x - a.x, b.y - a.y), at = Math.min(L, Math.max(0, Math.round(q.at / grid) * grid));
        if (at <= 1e-9) { q.x = a.x; q.y = a.y; } else if (at >= L - 1e-9) { q.x = b.x; q.y = b.y; } else { q.x = a.x + (b.x - a.x) / L * at; q.y = a.y + (b.y - a.y) / L * at; } }
      mode.pts.push({x: q.x, y: q.y}); if (mode.pts.length < 2) { setMsg('', ''); panelRender(); render(); return; }
      const m = mode; mode = null; const r = edit('splitRoom', m.roomId, m.pts[0], m.pts[1]); if (!r.ok) { panelRender(); render(); } }
    const up = e => { if (!ptr.has(e.pointerId)) return; ptr.delete(e.pointerId);
      if (down && e.type === 'pointerup') {
        if (down.vertex && down.moved) { if (preview) commit(preview, 'moveVertex'); else { render(); } }
        else if (!down.moved) { const p = local(e);
          if (mode) modeClick(p);
          else if (down.id) { const id = down.id; setSel(e.shiftKey ? (isSel(id) ? sel.filter(x => x !== id) : sel.concat(id)) : [id], true); }
          else if (sel.length) setSel([], true); } }
      else if (down && down.vertex) { preview = null; render(); }
      if (ptr.size < 2) pinch = null; if (ptr.size === 0) down = null; };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', e => { e.preventDefault(); const p = local(e); zoomAt(Math.exp(-e.deltaY * 0.0015), p[0], p[1]); }, {passive: false});
    wrap.addEventListener('keydown', e => { if (readOnly) return; const typing = e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
      if (e.key === 'Escape') { if (mode || addOpen || preview) { mode = null; addOpen = false; preview = null; setMsg('', ''); panelRender(); render(); } return; }
      if (typing || !(e.ctrlKey || e.metaKey)) return; const k = (e.key || '').toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); } });

    const fitAll = () => { fitTo(bounds()); fitted = true; render(); };
    btn('+', 'Приблизить', () => { const c = center(); zoomAt(1.4, c[0], c[1]); });
    btn('−', 'Отдалить', () => { const c = center(); zoomAt(1 / 1.4, c[0], c[1]); });
    btn('⤢', 'Показать всё', fitAll);
    load(geometry); chrome(); panelRender(); fitAll();

    return {
      setGeometry(g) { history = P.createHistory(g); mode = null; addOpen = false; setMsg('', ''); load(g); chrome(); fitted ? render() : fitAll(); panelRender(); },
      getGeometry: () => clone(geometry),
      select(ids) { setSel(ids == null ? [] : [].concat(ids).filter(validSel), false); },
      selected: () => sel.slice(),
      focus(roomId) { const r = drawing.rooms.find(x => x.id === roomId); if (!r || !r.vertices) return false; const pts = worldPts(r); fitTo({x0: Math.min(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), x1: Math.max(...pts.map(p => p.x)), y1: Math.max(...pts.map(p => p.y))}); render(); return true; },
      fit: fitAll, zoomIn() { const c = center(); zoomAt(1.4, c[0], c[1]); }, zoomOut() { const c = center(); zoomAt(1 / 1.4, c[0], c[1]); },
      setReadOnly(v) { readOnly = !!v; mode = null; addOpen = false; preview = null; chrome(); render(); panelRender(); }, isReadOnly: () => readOnly,
      edit, undo, redo, canUndo: () => !readOnly && history.canUndo(), canRedo: () => !readOnly && history.canRedo(),
      setGrid(v) { grid = unk(v) || !(+v > 0) ? null : +v; }, getGrid: () => grid, message: () => msg.text,
      view: () => Object.assign({}, view), flush: render,
      destroy() { dead = true; if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
