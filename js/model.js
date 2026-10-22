/* Модель объекта: геометрия + поверхности + текущее состояние + наблюдения + цели + закупленное. Без DOM.
   obj = {id, name, geometry:{walls,openings,rooms}, surfaces:[{id,roomId,kind,wallId?,name}],
          state:{ "<surfaceId>.<слой>": {value:'YES'|'NO'|'UNKNOWN'|'NOT_APPLICABLE', note?} },
          observations:[{id,target,what,params,note,present?}],   // существующее, созданное не нами (target — помещение или поверхность; present:false = «проверили, этого нет»)
          goals:[{id,target,result,params,note}],        // что пользователь хочет получить
          purchased:[{id,name,qty,unit,packQty,note}], schemaVersion} */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, TRI = SM.TRI;
  const SCHEMA = 1;
  const M = SM.model = {SCHEMA};

  M.newObject = (name) => ({id: SM.uid(), name: name || 'Объект', schemaVersion: SCHEMA,
    geometry: {walls: [], openings: [], rooms: []}, surfaces: [], state: {}, observations: [], goals: [], purchased: []});

  // Состояние по умолчанию — UNKNOWN (а не NO!)
  M.getState = (obj, surfaceId, layer) => (obj.state[surfaceId + '.' + layer] || {value: TRI.UNKNOWN}).value;
  M.setState = (obj, surfaceId, layer, value, note) => {
    if (!Object.values(TRI).includes(value)) throw new Error('состояние должно быть YES/NO/UNKNOWN/NOT_APPLICABLE');
    obj.state[surfaceId + '.' + layer] = note ? {value, note} : {value}; return obj;
  };
  M.addObservation = (obj, o) => { const x = Object.assign({id: SM.uid(), params: {}}, o); obj.observations.push(x); return x; };
  // Наблюдения (D40): факты о существующем (стяжка ~55 мм, старая плитка), привязаны к помещению или поверхности. Это не состояние и не результат технологии проекта.
  // present:false = «проверили — этого нет» (нет записи ≠ «нет»: это неизвестно). params: числа/текст, null = неизвестно.
  const okTarget = (obj, id) => obj.geometry.rooms.some(r => r.id === id) || obj.surfaces.some(s => s.id === id);
  const findObs = (obj, id) => { const o = obj.observations.find(x => x.id === id); if (!o) throw new Error('наблюдение не найдено'); return o; };
  const okKey = k => { if (!k || /[.|]/.test(k)) throw new Error('ключ параметра не должен быть пустым и содержать «.» или «|»'); return k; };
  M.observationsOf = (obj, roomId, opt) => { const sid = new Set(obj.surfaces.filter(s => s.roomId === roomId && (!s.orphan || (opt && opt.orphans))).map(s => s.id)); return obj.observations.filter(o => o.target === roomId || sid.has(o.target)); };
  M.updateObservation = (obj, id, patch) => { const o = findObs(obj, id);
    if ('target' in patch && !okTarget(obj, patch.target)) throw new Error('цель наблюдения — помещение или поверхность объекта');
    for (const k of Object.keys(patch)) { if (k === 'present') { if (patch.present === false) o.present = false; else delete o.present; } else if (k !== 'id' && k !== 'params') o[k] = patch[k]; }
    return o; };
  M.removeObservation = (obj, id) => { findObs(obj, id); obj.observations = obj.observations.filter(x => x.id !== id); return obj; };
  M.setObsParam = (obj, id, key, value) => { const o = findObs(obj, id); o.params = o.params || {}; o.params[okKey(key)] = SM.isUnknown(value) ? null : value; return o; };
  M.removeObsParam = (obj, id, key) => { const o = findObs(obj, id); delete (o.params || {})[key]; return o; };
  M.renameObsParam = (obj, id, from, to) => { const o = findObs(obj, id), p = o.params = o.params || {}; if (from === to) return o; okKey(to); if (to in p) throw new Error('параметр «' + to + '» уже есть');
    const n = {}; for (const k of Object.keys(p)) n[k === from ? to : k] = p[k]; o.params = n; return o; };
  M.addGoal = (obj, g) => { const x = Object.assign({id: SM.uid(), params: {}}, g); obj.goals.push(x); return x; };

  // Поверхности помещений выводятся из геометрии: пол и потолок у каждого помещения, по поверхности «стена» на каждую стену помещения.
  // Идемпотентно. Существующие (id, состояние, цели, короба и т. п.) не трогаются; имя поверхности стены = имя стены (один источник).
  // Стена убрана из помещения: поверхность без состояния/целей/наблюдений удаляется, иначе помечается orphan (её данные сохраняются, в расчёты она не входит).
  M.syncSurfaces = obj => {
    const g = obj.geometry, S = obj.surfaces, out = {added: [], removed: [], orphaned: []}, uid = SM.uid;
    const used = id => Object.keys(obj.state).some(k => k.startsWith(id + '.')) || obj.goals.some(x => x.target === id) || obj.observations.some(x => x.target === id);
    for (const r of g.rooms) {
      const ids = new Set(r.wallIds || []), mine = S.filter(s => s.roomId === r.id);
      for (const [kind, name] of [['floor', 'Пол'], ['ceiling', 'Потолок']]) if (!mine.some(s => s.kind === kind)) { const s = {id: uid(), roomId: r.id, kind, name, wallId: null}; S.push(s); out.added.push(s.id); }
      for (const wid of ids) { const w = g.walls.find(x => x.id === wid); if (!w) continue; const ex = mine.find(s => s.kind === 'wall' && s.wallId === wid);
        if (!ex) { const s = {id: uid(), roomId: r.id, kind: 'wall', name: w.name || 'Стена', wallId: wid}; S.push(s); out.added.push(s.id); } else { if (w.name) ex.name = w.name; delete ex.orphan; } }
      for (const s of mine.filter(x => x.kind === 'wall' && x.wallId && !ids.has(x.wallId))) {
        if (used(s.id)) { if (!s.orphan) { s.orphan = true; out.orphaned.push(s.id); } } else { S.splice(S.indexOf(s), 1); out.removed.push(s.id); } }
    }
    return out;
  };

  // Производные величины всего объекта: по каждому помещению (из геометрии, не хранятся)
  M.derive = obj => obj.geometry.rooms.map(r => Object.assign({roomId: r.id, name: r.name}, SM.geo.deriveRoom(obj.geometry, r)));

  // Миграция: принимает данные любой версии, ничего не теряет (неизвестные поля сохраняются). Новее нашей схемы — отказ, не порча.
  M.migrate = data => {
    const d = JSON.parse(JSON.stringify(data || {})), v = d.schemaVersion || 0;
    if (v > SCHEMA) throw new Error('данные созданы более новой версией приложения (схема ' + v + ' > ' + SCHEMA + ')');
    d.geometry = Object.assign({walls: [], openings: [], rooms: []}, d.geometry);
    for (const k of ['surfaces', 'observations', 'goals', 'purchased']) d[k] = d[k] || [];
    d.state = d.state || {}; d.schemaVersion = SCHEMA; M.syncSurfaces(d); return d;
  };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
