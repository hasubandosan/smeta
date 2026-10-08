/* Модель объекта: геометрия + поверхности + текущее состояние + наблюдения + цели + закупленное. Без DOM.
   obj = {id, name, geometry:{walls,openings,rooms}, surfaces:[{id,roomId,kind,wallId?,name}],
          state:{ "<surfaceId>.<слой>": {value:'YES'|'NO'|'UNKNOWN'|'NOT_APPLICABLE', note?} },
          observations:[{id,target,what,params,note}],   // существующее, созданное не нами
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
  M.addGoal = (obj, g) => { const x = Object.assign({id: SM.uid(), params: {}}, g); obj.goals.push(x); return x; };

  // Производные величины всего объекта: по каждому помещению (из геометрии, не хранятся)
  M.derive = obj => obj.geometry.rooms.map(r => Object.assign({roomId: r.id, name: r.name}, SM.geo.deriveRoom(obj.geometry, r)));

  // Миграция: принимает данные любой версии, ничего не теряет (неизвестные поля сохраняются). Новее нашей схемы — отказ, не порча.
  M.migrate = data => {
    const d = JSON.parse(JSON.stringify(data || {})), v = d.schemaVersion || 0;
    if (v > SCHEMA) throw new Error('данные созданы более новой версией приложения (схема ' + v + ' > ' + SCHEMA + ')');
    d.geometry = Object.assign({walls: [], openings: [], rooms: []}, d.geometry);
    for (const k of ['surfaces', 'observations', 'goals', 'purchased']) d[k] = d[k] || [];
    d.state = d.state || {}; d.schemaVersion = SCHEMA; return d;
  };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
