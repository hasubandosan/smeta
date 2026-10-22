/* Редактор библиотеки процессов и правил: чистая логика (без DOM). Библиотека = S.library (данные, см. rules.js).
   Здесь: заготовки условий, смена типа условия, разбор введённых значений, описание правил по-русски, проверка библиотеки, удаление процесса. */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, X = SM.libedit = {};
  X.COND_TYPES = [['all', 'все условия (И)'], ['any', 'любое из условий (ИЛИ)'], ['not', 'НЕ'], ['room', 'свойство помещения'], ['state', 'состояние поверхности'], ['goal', 'есть цель'], ['param', 'параметр цели'], ['geo', 'размер помещения'], ['obs', 'наблюдение (что уже есть)']];
  X.GEO_KEYS = [['height', 'высота, м'], ['floor', 'площадь пола, м²'], ['ceiling', 'площадь потолка, м²'], ['perimeter', 'периметр, м'], ['wallArea', 'площадь стен, м²'], ['openingsArea', 'площадь проёмов, м²']];
  X.ROOM_KEYS = [['type', 'тип'], ['height', 'высота, м'], ['name', 'название']];
  X.KIND_RU = {floor: 'пол', wall: 'стены', ceiling: 'потолок', box: 'короб'};
  const TRI_RU = {YES: 'да', NO: 'нет', UNKNOWN: 'неизвестно', NOT_APPLICABLE: 'не применимо'};
  X.condType = c => (c ? X.COND_TYPES.map(t => t[0]).find(k => k in c) || null : null);
  X.defaultCond = (type, lib) => { const g0 = Object.keys((lib || {}).goalNames || {})[0] || '';
    return ({all: {all: []}, any: {any: []}, not: {not: {all: []}}, room: {room: {key: 'type', op: '==', value: ''}}, state: {state: {kind: 'floor', layer: '', is: 'YES', quant: 'all'}},
      goal: {goal: g0}, param: {param: {goal: g0, key: '', op: '==', value: true}}, geo: {geo: {key: 'height', op: '>', value: null}}, obs: {obs: {what: '', kind: '', key: '', op: '==', value: true}}})[type]; };
  X.parseOne = s => { s = String(s).trim(); if (s === '') return null; if (s === 'true' || s === 'да') return true; if (s === 'false' || s === 'нет') return false;
    const n = Number(s.replace(',', '.')); return isFinite(n) ? n : s; };
  X.parseValue = (s, list) => (list ? String(s).split(',').map(x => X.parseOne(x)).filter(x => x !== null) : X.parseOne(s));
  const walk = (obj, path) => path.split('.').reduce((o, k) => o[k], obj);
  X.replaceAt = (root, path, val) => { const k = path.split('.'), key = k.pop(); walk(root, k.join('.'))[key] = val; return root; };
  X.deleteAt = (root, path) => { const k = path.split('.'), key = k.pop(); delete walk(root, k.join('.'))[key]; return root; };

  const fmt = v => (v === null || v === undefined ? '?' : v === true ? 'да' : v === false ? 'нет' : Array.isArray(v) ? v.join(' / ') : String(v));
  const layerName = (lib, kind, layer) => { const l = ((lib.layers || {})[kind] || []).find(x => x[0] === layer); return l ? l[1] : layer || '?'; };
  X.describeCond = (c, lib) => { lib = lib || {}; const t = X.condType(c), D = x => X.describeCond(x, lib), gn = id => (lib.goalNames || {})[id] || id || '?';
    if (!t) return '(условие не задано)';
    if (t === 'all') return c.all.length ? c.all.map(x => { const s = D(x); return X.condType(x) === 'any' ? '(' + s + ')' : s; }).join(' И ') : 'всегда';
    if (t === 'any') return c.any.length ? c.any.map(x => { const s = D(x); return X.condType(x) === 'all' ? '(' + s + ')' : s; }).join(' ИЛИ ') : 'никогда';
    if (t === 'not') return 'НЕ (' + D(c.not) + ')';
    if (t === 'room') return 'помещение: ' + (X.ROOM_KEYS.find(k => k[0] === c.room.key) || [0, c.room.key])[1] + ' ' + c.room.op + ' ' + fmt(c.room.value);
    if (t === 'state') { const s = c.state, w = s.in ? 'одно из: ' + s.in.map(v => TRI_RU[v] || v).join(' / ') : TRI_RU[s.is] || s.is;
      return (X.KIND_RU[s.kind] || s.kind) + ': «' + layerName(lib, s.kind, s.layer) + '» — ' + w + (s.quant === 'any' ? ' (хотя бы у одной поверхности)' : ''); }
    if (t === 'goal') return 'есть цель «' + gn(c.goal) + '»';
    if (t === 'param') return 'у цели «' + gn(c.param.goal) + '» ' + (c.param.key || '?') + ' ' + c.param.op + ' ' + fmt(c.param.value);
    if (t === 'obs') return 'наблюдение «' + (c.obs.what || '?') + '»' + (c.obs.kind ? ' (' + (X.KIND_RU[c.obs.kind] || c.obs.kind) + ')' : '') + ' есть' + (c.obs.key ? ', ' + c.obs.key + ' ' + (c.obs.op || '==') + ' ' + fmt(c.obs.value) : '');
    return 'размер: ' + (X.GEO_KEYS.find(k => k[0] === c.geo.key) || [0, c.geo.key])[1] + ' ' + c.geo.op + ' ' + fmt(c.geo.value); };
  X.describeAction = (a, lib) => { const p = id => ((lib.processes || []).find(x => x.id === id) || {name: id || '?'}).name, sc = a.process ? ' (' + p(a.process) + ')' : '';
    switch (a.do) { case 'REQUIRE': return 'потребовать «' + p(a.process) + '»'; case 'ADD_PROCESS': return 'добавить «' + p(a.process) + '»'; case 'FORBID': return 'запретить «' + p(a.process) + '»';
      case 'RECOMMEND': return 'рекомендовать: ' + (a.text || '?'); case 'WARN': return 'предупредить: ' + (a.text || '?'); case 'SET_VALUE': return 'задать ' + (a.key || '?') + ' = ' + fmt(a.value) + sc;
      case 'MODIFY_QUANTITY': return 'объём ' + (a.mode === 'add' ? '+ ' : '× ') + fmt(a.value) + sc; case 'MODIFY_COEFFICIENT': return 'расход' + (a.matId ? ' материала' : ' всех материалов') + ' × ' + fmt(a.value) + sc; }
    return String(a.do); };
  X.describeRule = (r, lib) => 'ЕСЛИ ' + X.describeCond(r.if, lib) + ' → ' + (r.then.length ? r.then.map(a => X.describeAction(a, lib)).join('; ') : 'ничего') + (r.ask ? '. Если неизвестно — спросить: «' + r.ask + '»' : '');

  // Проверка библиотеки: [{level:'error'|'warn', text}]. Ошибка = правило/процесс не будет работать как задумано.
  X.validate = lib => { const out = [], add = (level, text) => out.push({level, text}), P = lib.processes || [], ids = new Set(), goals = lib.goalNames || {}, layers = lib.layers || {}, has = id => P.some(p => p.id === id);
    for (const p of P) { if (ids.has(p.id)) add('error', 'Повтор id процесса «' + p.name + '»'); ids.add(p.id); if (!p.name) add('warn', 'У процесса ' + p.id + ' нет названия');
      if (!layers[p.surface]) add('warn', 'Процесс «' + p.name + '»: вид поверхности «' + p.surface + '» не описан в слоях');
      for (const a of p.after || []) { if (a === p.id) add('error', 'Процесс «' + p.name + '» ждёт сам себя'); else if (!has(a)) add('error', 'Процесс «' + p.name + '»: «сначала» ссылается на несуществующий процесс'); }
      for (const e of p.effects || []) { if (e.geo) { if (!SM.rules.GEO_EFFECTS.includes(e.geo)) add('error', 'Процесс «' + p.name + '»: неизвестный эффект геометрии ' + e.geo); else if ((e.geo === 'SET_WALL' || e.geo === 'SET_ROOM') && !e.key) add('warn', 'Процесс «' + p.name + '»: у эффекта геометрии не выбрано свойство');
          else if (e.geo === 'SET_WALL' && p.surface !== 'wall') add('warn', 'Процесс «' + p.name + '»: эффект на стены, а процесс не на стены — он применится ко всем стенам помещения'); continue; }
        if (!e.layer) add('warn', 'Процесс «' + p.name + '»: у эффекта не выбран слой'); else if (!(layers[p.surface] || []).some(l => l[0] === e.layer)) add('warn', 'Процесс «' + p.name + '»: слой «' + e.layer + '» не описан для вида «' + p.surface + '»');
        if (e.op === 'SET' && !e.value) add('warn', 'Процесс «' + p.name + '»: у эффекта SET не задано значение'); }
      if (!(p.effects || []).length) add('warn', 'Процесс «' + p.name + '» ничего не меняет в состоянии (нет эффектов): он никогда не станет «Готово»'); }
    const state = {}; const cyc = id => { if (state[id] === 2) return false; if (state[id] === 1) return true; state[id] = 1; const p = P.find(x => x.id === id); const r = p && (p.after || []).some(a => has(a) && cyc(a)); state[id] = 2; return !!r; };
    for (const p of P) if (state[p.id] === undefined && cyc(p.id)) add('error', 'Цикл в «сначала» около процесса «' + p.name + '»');
    const condCheck = (c, where) => { const t = X.condType(c); if (!t) { add('warn', where + ': условие не задано'); return; }
      if (t === 'all' || t === 'any') c[t].forEach(x => condCheck(x, where)); else if (t === 'not') condCheck(c.not, where);
      else if (t === 'state') { if (!c.state.layer) add('warn', where + ': в условии не выбран слой'); else if (!(layers[c.state.kind] || []).some(l => l[0] === c.state.layer)) add('warn', where + ': слой «' + c.state.layer + '» не описан для «' + (X.KIND_RU[c.state.kind] || c.state.kind) + '»'); }
      else if (t === 'goal') { if (!(c.goal in goals)) add('warn', where + ': цель «' + c.goal + '» не описана'); } else if (t === 'param') { if (!(c.param.goal in goals)) add('warn', where + ': цель «' + c.param.goal + '» не описана'); if (!c.param.key) add('warn', where + ': у параметра цели нет ключа'); }
      else if (t === 'obs') { if (!c.obs.what) add('warn', where + ': в условии не указано, какое наблюдение'); } };
    for (const p of P) { if (p.needed) condCheck(p.needed, 'Процесс «' + p.name + '» (нужен, если)'); if (p.requires) condCheck(p.requires, 'Процесс «' + p.name + '» (условие)'); }
    for (const r of lib.rules || []) { const w = 'Правило «' + (r.name || r.id) + '»'; condCheck(r.if, w);
      for (const a of r.then || []) { if (['REQUIRE', 'ADD_PROCESS', 'FORBID'].includes(a.do) && !has(a.process)) add('error', w + ': действие «' + X.describeAction(a, lib) + '» ссылается на несуществующий процесс');
        if (a.process && !has(a.process)) add('error', w + ': процесс действия не найден');
        if (['SET_VALUE', 'MODIFY_QUANTITY', 'MODIFY_COEFFICIENT'].includes(a.do) && !('value' in a)) add('error', w + ': у действия нет значения');
        if (a.do === 'SET_VALUE' && !a.key) add('error', w + ': у SET_VALUE нет ключа параметра'); if (!a.because) add('warn', w + ': у действия нет объяснения «почему»'); } }
    for (const [g, list] of Object.entries(lib.goals || {})) { if (!(g in goals)) add('warn', 'Цель «' + g + '» есть в маршрутах, но без названия'); for (const pid of list) if (!has(pid)) add('error', 'Цель «' + (goals[g] || g) + '»: процесс не найден'); }
    return out; };

  // Виды наблюдений (подсказка при вводе): уже записанные в объекте + упомянутые в условиях библиотеки
  X.obsKinds = (obj, lib) => { const s = new Set(((obj && obj.observations) || []).map(o => o.what).filter(Boolean));
    const walk = c => { if (!c) return; if (c.all || c.any) (c.all || c.any).forEach(walk); else if (c.not) walk(c.not); else if (c.obs && c.obs.what) s.add(c.obs.what); };
    for (const p of (lib && lib.processes) || []) { walk(p.needed); walk(p.requires); } for (const r of (lib && lib.rules) || []) walk(r.if); return [...s].sort(); };

  // Где используется процесс (для подтверждения удаления)
  X.usage = (lib, S, pid) => ({goals: Object.values(lib.goals || {}).filter(l => l.includes(pid)).length, after: (lib.processes || []).filter(p => (p.after || []).includes(pid)).length,
    rules: (lib.rules || []).filter(r => (r.then || []).some(a => a.process === pid)).length, techs: ((S && S.techs) || []).filter(t => t.processId === pid).length, plan: ((S && S.plan) || []).filter(x => x.processId === pid).length});
  // Удаление процесса: убирает ссылки внутри библиотеки (маршруты целей, «сначала», действия правил); технологии и пункты плана не трогает
  X.removeProcess = (lib, pid) => { lib.processes = lib.processes.filter(p => p.id !== pid); lib.processes.forEach(p => { p.after = (p.after || []).filter(a => a !== pid); });
    for (const g in lib.goals || {}) lib.goals[g] = lib.goals[g].filter(x => x !== pid); (lib.rules || []).forEach(r => { r.then = (r.then || []).filter(a => a.process !== pid); }); return lib; };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
