/* Правила, эффекты, «что можно делать сейчас». Без DOM. Всё поведение — в данных библиотеки (lib), не в коде.
   lib = {layers:{kind:[[layer,подпись]]}, goalNames:{result:имя}, goals:{result:[processId]},
          processes:[{id,name,surface:kind,after?:[id],needed?:cond,requires?:cond,ask?:текст,blockedText?,effects:[{op:'ADD'|'REMOVE'|'SET',layer,value?}]}],
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
  const surfaces = (ctx, kind) => ctx.obj.surfaces.filter(s => s.roomId === ctx.room.id && s.kind === kind);
  const mkCtx = (obj, room) => { const sid = new Set(obj.surfaces.filter(s => s.roomId === room.id).map(s => s.id));
    return {obj, room, goals: obj.goals.filter(g => g.target === room.id || sid.has(g.target))}; };
  const effVal = e => (e.op === 'ADD' ? 'YES' : e.op === 'REMOVE' ? 'NO' : e.value);

  R.effVal = effVal;

  // evalCond(cond, ctx, unk) -> 'T'|'F'|'U'; в unk попадают названия неизвестного
  R.evalCond = (c, ctx, unk) => {
    unk = unk || [];
    if (!c) return T;
    if (c.all || c.any) { const all = !!c.all, L = c.all || c.any; let r = all ? T : F;
      for (const x of L) { const v = R.evalCond(x, ctx, unk); if (v === (all ? F : T)) return v; if (v === U) r = U; } return r; }
    if (c.not) { const v = R.evalCond(c.not, ctx, unk); return v === T ? F : v === F ? T : U; }
    if (c.room) { const v = cmp(ctx.room[c.room.key], c.room.op, c.room.value); if (v === U) unk.push('помещение.' + c.room.key); return v; }
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

  // plan(obj, lib, roomId) -> {items:[{id,name,status,reasons,why,recommended}], notes, questions}
  // status: DONE | READY | NEEDS_INFO | BLOCKED
  R.plan = (obj, lib, roomId) => {
    const room = obj.geometry.rooms.find(r => r.id === roomId), ctx = mkCtx(obj, room), route = new Map(), forbid = new Map(), notes = [], questions = [];
    const add = (pid, why) => { if (!route.has(pid)) route.set(pid, []); if (why && !route.get(pid).includes(why)) route.get(pid).push(why); };
    for (const g of ctx.goals) for (const pid of (lib.goals || {})[g.result] || []) add(pid, 'цель: ' + ((lib.goalNames || {})[g.result] || g.result));
    for (const rule of lib.rules || []) {
      const v = R.evalCond(rule.if, ctx);
      if (v === U) { if (rule.ask) questions.push({text: rule.ask, why: rule.name || rule.id}); continue; }
      if (v !== T) continue;
      for (const a of rule.then) {
        if (a.do === 'REQUIRE' || a.do === 'ADD_PROCESS') add(a.process, a.because);
        else if (a.do === 'FORBID') forbid.set(a.process, a.because);
        else if (a.do === 'RECOMMEND' || a.do === 'WARN') notes.push({kind: a.do, text: a.text, because: a.because});
        else throw new Error('неизвестное действие ' + a.do);
      }
    }
    const procs = lib.processes.filter(p => route.has(p.id)), memo = new Map();
    const byId = id => procs.find(p => p.id === id);
    const effDone = (p) => p.effects.every(e => R.evalCond({state: {kind: p.surface, layer: e.layer, is: effVal(e)}}, ctx) === T);
    const status = p => {
      if (memo.has(p.id)) return memo.get(p.id);
      let res;
      if (forbid.has(p.id)) res = {status: 'BLOCKED', reasons: ['Запрещено: ' + forbid.get(p.id)]};
      else if (effDone(p)) res = {status: 'DONE', reasons: []};
      else {
        const unk = []; const nv = p.needed ? R.evalCond(p.needed, ctx, unk) : T;
        if (nv === F) res = {status: 'DONE', reasons: ['не требуется']};
        else if (nv === U) res = {status: 'NEEDS_INFO', reasons: [], question: p.ask || 'Уточните: ' + unk.join(', ')};
        else {
          const blockers = (p.after || []).map(byId).filter(Boolean).map(a => [a, status(a)]).filter(([, s]) => s.status !== 'DONE')
            .map(([a, s]) => 'Сначала: ' + a.name + (s.status === 'NEEDS_INFO' ? ' (нужно уточнить)' : ''));
          if (blockers.length) res = {status: 'BLOCKED', reasons: blockers};
          else { const unk2 = [], rv = p.requires ? R.evalCond(p.requires, ctx, unk2) : T;
            res = rv === F ? {status: 'BLOCKED', reasons: [p.blockedText || 'Не выполнено условие']} : rv === U ? {status: 'NEEDS_INFO', reasons: [], question: p.ask || 'Уточните: ' + unk2.join(', ')} : {status: 'READY', reasons: []}; }
        }
      }
      memo.set(p.id, res); return res;
    };
    const items = procs.map(p => { const s = status(p); if (s.question && !questions.some(q => q.text === s.question)) questions.push({text: s.question, why: p.name});
      return {id: p.id, name: p.name, surface: p.surface, status: s.status, reasons: s.reasons, why: route.get(p.id)}; });
    return {roomId, items, notes, questions};
  };

  // Выполнить процесс: применить эффекты к состоянию. Только если процесс сейчас READY.
  R.complete = (obj, lib, roomId, pid) => {
    const it = R.plan(obj, lib, roomId).items.find(x => x.id === pid);
    if (!it || it.status !== 'READY') throw new Error('Сейчас нельзя: ' + (it ? (it.reasons.join('; ') || it.status) : 'процесса нет в маршруте'));
    const p = lib.processes.find(x => x.id === pid);
    for (const s of obj.surfaces.filter(x => x.roomId === roomId && x.kind === p.surface)) for (const e of p.effects) M.setState(obj, s.id, e.layer, effVal(e));
    return obj;
  };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
