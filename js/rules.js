/* Правила, эффекты, «что можно делать сейчас». Без DOM. Всё поведение — в данных библиотеки (lib), не в коде.
   lib = {layers:{kind:[[layer,подпись]]}, goalNames:{result:имя}, goals:{result:[processId]},
          processes:[{id,name,surface:kind,after?:[id],needed?:cond,requires?:cond,ask?:текст,blockedText?,effects:[{op:'ADD'|'REMOVE'|'SET',layer,value?} | {geo:'CREATE_OPENING',kind?,w?,h?} | {geo:'DESTROY_OPENING',kind?} | {geo:'SET_WALL',key:len|height|thickness|material,value} | {geo:'SET_ROOM',key:height|type,value}]}],
          rules:[{id,name,if:cond,ask?:текст,then:[{do:'REQUIRE'|'ADD_PROCESS'|'FORBID'|'RECOMMEND'|'WARN',process?,text?,because}]}]}
   cond = {all:[]}|{any:[]}|{not:c}|{room:{key,op,value}}|{state:{kind,layer,is|in,quant:'all'|'any'}}|{goal:result}|{param:{goal,key,op,value}}
   Логика трёхзначная: T / F / U (неизвестно). UNKNOWN != NO. */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, M = SM.model, R = SM.rules = {}, T = 'T', F = 'F', U = 'U';
  const cmp = (a, op, b) => {
    if (SM.isUnknown(a)) return U; let r;
    switch (op) { case '==': r = a == b; break; case '!=': r = a != b; break; case '>': r = +a > +b; break; case '<': r = +a < +b; break;
      case '>=': r = +a >= +b; break; case '<=': r = +a <= +b; break; case 'in': r = Array.isArray(b) && b.includes(a); break; default: throw new Error('неизвестная операция ' + op); }
    return r ? T : F;
  };
  // Поверхности вида kind в помещении. Устаревшие (orphan: стена удалена из геометрии) не участвуют. Если задана область процесса (ctx.scope) — только её поверхности этого вида.
  const surfaces = (ctx, kind) => ctx.obj.surfaces.filter(s => s.roomId === ctx.room.id && s.kind === kind && !s.orphan && !(ctx.scope && ctx.scopeKind === kind && !ctx.scope.has(s.id)));
  const mkCtx = (obj, room) => { const sid = new Set(obj.surfaces.filter(s => s.roomId === room.id && !s.orphan).map(s => s.id));
    return {obj, room, goals: obj.goals.filter(g => g.target === room.id || sid.has(g.target))}; };
  const effVal = e => (e.op === 'ADD' ? 'YES' : e.op === 'REMOVE' ? 'NO' : e.value);

  R.effVal = effVal;
  const WALL_KEYS = ['len', 'height', 'thickness', 'material'], ROOM_KEYS = ['height', 'type'];
  R.GEO_EFFECTS = ['CREATE_OPENING', 'DESTROY_OPENING', 'SET_WALL', 'SET_ROOM'];
  // Стены (записи геометрии), на которые направлен процесс: поверхности «стена» помещения в области процесса (для процесса не на стены — все стены помещения)
  const targetWalls = (obj, roomId, p, scopeIds) => obj.surfaces.filter(s => s.roomId === roomId && s.kind === 'wall' && !s.orphan && (p.surface !== 'wall' || !scopeIds || scopeIds.includes(s.id)))
    .map(s => obj.geometry.walls.find(w => w.id === s.wallId)).filter(Boolean);
  // Применить эффекты процесса к объекту (состояние слоёв и геометрия). Атомарно: при ошибке или недопустимой геометрии объект не меняется, бросается понятная ошибка.
  R.applyEffects = (obj, roomId, p, scopeIds) => {
    const before = new Set(SM.geo.validate(obj.geometry).issues.filter(x => x.level === 'error').map(x => x.code + '|' + x.id));   // старые ошибки геометрии (например, исходный зазор контура) не мешают; отказ — только за НОВЫЕ ошибки от этого действия
    const o = JSON.parse(JSON.stringify(obj)), g = o.geometry, room = g.rooms.find(r => r.id === roomId), walls = targetWalls(o, roomId, p, scopeIds), ids = new Set(walls.map(w => w.id));
    const surf = o.surfaces.filter(x => x.roomId === roomId && x.kind === p.surface && !x.orphan && (!scopeIds || scopeIds.includes(x.id)));
    for (const e of p.effects) {
      if (!e.geo) { surf.forEach(s => M.setState(o, s.id, e.layer, effVal(e))); continue; }
      if (e.geo === 'CREATE_OPENING') { for (const w of walls) if (!g.openings.some(x => x.wallId === w.id && (!e.kind || x.kind === e.kind))) g.openings.push({id: SM.uid(), wallId: w.id, roomId, kind: e.kind || 'проём', w: SM.isUnknown(e.w) ? null : +e.w, h: SM.isUnknown(e.h) ? null : +e.h}); }
      else if (e.geo === 'DESTROY_OPENING') g.openings = g.openings.filter(x => !(ids.has(x.wallId) && (!e.kind || x.kind === e.kind)));
      else if (e.geo === 'SET_WALL') { if (!WALL_KEYS.includes(e.key)) throw new Error('SET_WALL: свойство «' + e.key + '» менять нельзя'); walls.forEach(w => { w[e.key] = SM.isUnknown(e.value) ? null : e.value; }); }
      else if (e.geo === 'SET_ROOM') { if (!ROOM_KEYS.includes(e.key)) throw new Error('SET_ROOM: свойство «' + e.key + '» менять нельзя'); room[e.key] = SM.isUnknown(e.value) ? null : e.value; }
      else throw new Error('неизвестный эффект геометрии ' + e.geo);
    }
    M.syncSurfaces(o); const v = SM.geo.validate(g);
    const bad = v.issues.filter(x => x.level === 'error' && !before.has(x.code + '|' + x.id));
    if (bad.length) throw new Error('Геометрия после этого действия была бы некорректной: ' + bad.map(x => x.text).join('; '));
    Object.assign(obj, o); return obj;
  };

  // evalCond(cond, ctx, unk) -> 'T'|'F'|'U'; в unk попадают названия неизвестного
  R.evalCond = (c, ctx, unk) => {
    unk = unk || [];
    if (!c) return T;
    if (c.all || c.any) { const all = !!c.all, L = c.all || c.any; let r = all ? T : F;
      for (const x of L) { const v = R.evalCond(x, ctx, unk); if (v === (all ? F : T)) return v; if (v === U) r = U; } return r; }
    if (c.not) { const v = R.evalCond(c.not, ctx, unk); return v === T ? F : v === F ? T : U; }
    if (c.room) { const v = cmp(ctx.room[c.room.key], c.room.op, c.room.value); if (v === U) unk.push('помещение.' + c.room.key); return v; }
    if (c.geo) { // числовые величины геометрии помещения: floor, ceiling, perimeter, wallArea, openingsArea, height; неизвестное → U
      const key = c.geo.key; let v; if (key === 'height') v = ctx.room.height; else { ctx.derived = ctx.derived || SM.geo.deriveRoom(ctx.obj.geometry, ctx.room); v = ctx.derived[key]; }
      const r = cmp(v, c.geo.op, c.geo.value); if (r === U) unk.push('геометрия.' + key); return r; }
    if (c.goal) return ctx.goals.some(g => g.result === c.goal) ? T : F;
    if (c.param) { const g = ctx.goals.find(x => x.result === c.param.goal); if (!g) return F;
      const v = cmp((g.params || {})[c.param.key], c.param.op, c.param.value); if (v === U) unk.push(c.param.key); return v; }
    if (c.state) { const s = c.state, S = surfaces(ctx, s.kind);
      if (!S.length) { unk.push('поверхность ' + s.kind); return U; }
      const vs = S.map(x => { const val = M.getState(ctx.obj, x.id, s.layer), ok = s.in ? s.in.includes(val) : val === s.is;
        return ok ? T : (val === 'UNKNOWN' && s.is !== 'UNKNOWN' ? U : F); });
      if (vs.includes(U)) unk.push(s.kind + ':' + s.layer);
      if (s.quant === 'any') return vs.includes(T) ? T : vs.includes(U) ? U : F;
      return vs.includes(F) ? F : vs.includes(U) ? U : T; }
    throw new Error('неизвестное условие');
  };

  // plan(obj, lib, roomId) -> {items:[{id,name,status,reasons,why,scope}], notes, questions, modifiers}
  // modifiers — действия SET_VALUE / MODIFY_QUANTITY / MODIFY_COEFFICIENT сработавших правил; применяет смета (SM.est.compute) и показывает «почему». value:null = неизвестно → результат неизвестен.
  // scope: массив id поверхностей, на которые направлен процесс (цель указывает на конкретную поверхность), или null = все поверхности этого вида в помещении
  // status: DONE | READY | NEEDS_INFO | BLOCKED
  R.plan = (obj, lib, roomId) => {
    const room = obj.geometry.rooms.find(r => r.id === roomId), ctx = mkCtx(obj, room), route = new Map(), forbid = new Map(), notes = [], questions = [], modifiers = [];
    const add = (pid, why) => { if (!route.has(pid)) route.set(pid, []); if (why && !route.get(pid).includes(why)) route.get(pid).push(why); };
    const scope = new Map(), addScope = (pid, ids) => { if (ids === null) scope.set(pid, null); else if (scope.get(pid) !== null) { const c = scope.get(pid) || new Set(); ids.forEach(x => c.add(x)); scope.set(pid, c); } };
    for (const g of ctx.goals) { const tgt = obj.surfaces.find(s => s.id === g.target);
      for (const pid of (lib.goals || {})[g.result] || []) { add(pid, 'цель: ' + ((lib.goalNames || {})[g.result] || g.result) + (tgt ? ' (' + tgt.name + ')' : ''));
        const pr = lib.processes.find(x => x.id === pid); addScope(pid, tgt && pr && tgt.kind === pr.surface ? new Set([tgt.id]) : null); } }
    for (const rule of lib.rules || []) {
      const v = R.evalCond(rule.if, ctx);
      if (v === U) { if (rule.ask) questions.push({text: rule.ask, why: rule.name || rule.id}); continue; }
      if (v !== T) continue;
      for (const a of rule.then) {
        if (a.do === 'REQUIRE' || a.do === 'ADD_PROCESS') { add(a.process, a.because); addScope(a.process, null); }
        else if (a.do === 'FORBID') forbid.set(a.process, a.because);
        else if (a.do === 'RECOMMEND' || a.do === 'WARN') notes.push({kind: a.do, text: a.text, because: a.because});
        else if (a.do === 'SET_VALUE' || a.do === 'MODIFY_QUANTITY' || a.do === 'MODIFY_COEFFICIENT') {
          if (a.do === 'SET_VALUE' && !a.key) throw new Error('SET_VALUE: не указан key'); if (!('value' in a)) throw new Error(a.do + ': не указано value');
          modifiers.push({do: a.do, rule: rule.id, process: a.process || null, key: a.key || null, matId: a.matId || null, mode: a.mode === 'add' ? 'add' : 'mul', value: a.value, because: a.because || rule.name || rule.id}); }
        else throw new Error('неизвестное действие ' + a.do);
      }
    }
    const procs = lib.processes.filter(p => route.has(p.id)), memo = new Map();
    const byId = id => procs.find(p => p.id === id);
    const key = (p, sc) => p.id + '|' + (sc ? [...sc].sort().join(',') : '*');
    const withScope = (sc, kind, fn) => { const a = ctx.scope, b = ctx.scopeKind; ctx.scope = sc; ctx.scopeKind = kind; try { return fn(); } finally { ctx.scope = a; ctx.scopeKind = b; } };
    // Эффект уже достигнут? Для геометрии: SET_* — значение известно и равно; CREATE_OPENING — на каждой стене есть проём этого вида; DESTROY_OPENING — такого проёма нет.
    const geoDone = (p, e) => { const g = obj.geometry, ws = surfaces(ctx, 'wall').map(s => g.walls.find(w => w.id === s.wallId)).filter(Boolean), eq = (a, b) => !SM.isUnknown(a) && a == b;
      if (e.geo === 'SET_ROOM') return eq(room[e.key], e.value); if (!ws.length) return false;
      if (e.geo === 'SET_WALL') return ws.every(w => eq(w[e.key], e.value));
      const has = w => g.openings.some(x => x.wallId === w.id && (!e.kind || x.kind === e.kind)); return e.geo === 'CREATE_OPENING' ? ws.every(has) : ws.every(w => !has(w)); };
    const effDone = (p) => p.effects.every(e => e.geo ? geoDone(p, e) : R.evalCond({state: {kind: p.surface, layer: e.layer, is: effVal(e)}}, ctx) === T);
    // status(p, sc): sc — область процесса. Предшествующий процесс того же вида проверяется на ТОЙ ЖЕ области (плитка на стене 1 ждёт подготовку стены 1, а не всех), другого вида — на своей.
    const status = (p, sc) => withScope(sc || null, p.surface, () => {
      const mk = key(p, sc); if (memo.has(mk)) return memo.get(mk);
      let res;
      if (forbid.has(p.id)) res = {status: 'BLOCKED', reasons: ['Запрещено: ' + forbid.get(p.id)]};
      else if (effDone(p)) res = {status: 'DONE', reasons: []};
      else {
        const unk = []; const nv = p.needed ? R.evalCond(p.needed, ctx, unk) : T;
        if (nv === F) res = {status: 'DONE', reasons: ['не требуется']};
        else if (nv === U) res = {status: 'NEEDS_INFO', reasons: [], question: p.ask || 'Уточните: ' + unk.join(', ')};
        else {
          const blockers = (p.after || []).map(byId).filter(Boolean).map(a => [a, status(a, a.surface === p.surface ? sc : scope.get(a.id) || null)]).filter(([, s]) => s.status !== 'DONE')
            .map(([a, s]) => 'Сначала: ' + a.name + (s.status === 'NEEDS_INFO' ? ' (нужно уточнить)' : ''));
          if (blockers.length) res = {status: 'BLOCKED', reasons: blockers};
          else { const unk2 = [], rv = p.requires ? R.evalCond(p.requires, ctx, unk2) : T;
            res = rv === F ? {status: 'BLOCKED', reasons: [p.blockedText || 'Не выполнено условие']} : rv === U ? {status: 'NEEDS_INFO', reasons: [], question: p.ask || 'Уточните: ' + unk2.join(', ')} : {status: 'READY', reasons: []}; }
        }
      }
      memo.set(mk, res); return res;
    });
    const items = procs.map(p => { const sc = scope.get(p.id) || null, s = status(p, sc); if (s.question && !questions.some(q => q.text === s.question)) questions.push({text: s.question, why: p.name});
      return {id: p.id, name: p.name, surface: p.surface, status: s.status, reasons: s.reasons, why: route.get(p.id), scope: sc ? [...sc] : null}; });
    return {roomId, items, notes, questions, modifiers};
  };

  // Выполнить процесс: применить эффекты к состоянию. Только если процесс сейчас READY.
  R.complete = (obj, lib, roomId, pid) => {
    const it = R.plan(obj, lib, roomId).items.find(x => x.id === pid);
    if (!it || it.status !== 'READY') throw new Error('Сейчас нельзя: ' + (it ? (it.reasons.join('; ') || it.status) : 'процесса нет в маршруте'));
    const p = lib.processes.find(x => x.id === pid);
    R.applyEffects(obj, roomId, p, it.scope);
    return obj;
  };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
