/* Демо/тестовые объекты — ДАННЫЕ, не логика. Неизвестное = null. Ничего не выдумываем (ТЗ §21). */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, M = SM.model;
  SM.seeds = {
    // Тестовая ванная из ТЗ. Углы 90° по умолчанию (решение владельца, D7). Какая стена где — по порядку обхода из ТЗ.
    bathroom() {
      const o = M.newObject('Ванная (тестовый объект)'), g = o.geometry;
      const W = (len, turn, material, name) => { const w = {id: SM.uid(), len, turn, material, name}; g.walls.push(w); return w; };
      const w = [W(3.5, 90, 'brick', 'Стена 1'), W(0.5, -90, 'gypsum_frame', 'Стена 2'), W(0.5, 90, 'gypsum_frame', 'Стена 3'),
        W(3.5, 90, 'brick', 'Стена 4'), W(4, 90, 'fortan', 'Стена 5'), W(4, null, 'fortan', 'Стена 6')];
      const room = {id: SM.uid(), name: 'Ванная', type: 'bathroom', height: 2.7, wallIds: w.map(x => x.id)}; g.rooms.push(room);
      // проёмы: на какой стене — неизвестно (wallId пуст)
      [['дверь', 0.9, 2.1], ['дверь', 0.8, 2.2], ['окно', 0.5, 0.3]].forEach(([kind, ww, h]) => g.openings.push({id: SM.uid(), roomId: room.id, wallId: null, kind, w: ww, h}));
      const S = (kind, name, wallId) => { const s = {id: SM.uid(), roomId: room.id, kind, name, wallId: wallId || null}; o.surfaces.push(s); return s; };
      const floor = S('floor', 'Пол'), ceil = S('ceiling', 'Потолок'), box = Object.assign(S('box', 'Короб'), {w: 0.6, l: 0.4, h: 2.7, assumed: true}), ws = w.map((x, i) => S('wall', 'Стена ' + (i + 1), x.id));
      // состояние: известно только то, что сказал владелец; остальное UNKNOWN по умолчанию
      M.setState(o, floor.id, 'existing_floor', 'YES');
      M.addObservation(o, {target: floor.id, what: 'existing_floor', params: {thickness: null}, note: 'существующий пол, нужен демонтаж'});
      M.addObservation(o, {target: room.id, what: 'existing_tile_walls', params: {wallsCount: 2, wallIds: null}, note: 'плитка начата на двух стенах, на каких — неизвестно; старую снять'});
      // цели
      M.addGoal(o, {target: floor.id, result: 'tile_floor', params: {underfloorHeating: 'water', waterproofing: true, newScreed: true}});
      M.addGoal(o, {target: room.id, result: 'wall_tile', params: {wallIds: null}, note: 'плитка на стенах, кроме окрашиваемой зоны ГКЛ'});
      M.addGoal(o, {target: room.id, result: 'paint_wall_zone', params: {wallIds: null}, note: 'одна стена/зона ГКЛ окрашивается, какая — неизвестно'});
      M.addGoal(o, {target: ceil.id, result: 'gkl_ceiling_paint', params: {paint: 'latex'}});
      M.addGoal(o, {target: box.id, result: 'paint', params: {}});
      // уже куплено (бренд/упаковка/расход не выдумываем)
      o.purchased.push({id: SM.uid(), name: 'Краска латексная для потолка (Farbex)', qty: 0.5, unit: 'л', packQty: null, note: 'расход/покрытие неизвестны'},
        {id: SM.uid(), name: 'Плиточный клей Ceresit для влажных зон', qty: 2, unit: 'мешок', packQty: null, note: 'модель и масса мешка неизвестны'},
        {id: SM.uid(), name: 'Перчатки', qty: null, unit: 'шт', packQty: null});
      return o;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
