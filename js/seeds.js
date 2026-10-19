/* Демо/тестовые объекты — ДАННЫЕ, не логика. Неизвестное = null. Ничего не выдумываем (ТЗ §21). */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, M = SM.model;
  SM.seeds = {
    // Обновление сохранённой библиотеки без потерь: только ДОБАВЛЯЕТ недостающее по id, ничего не меняет и не удаляет.
    upgradeLibrary(lib) { const base = SM.seeds.library(); if (!lib) return base; if ((lib.version || 0) >= base.version) return lib;
      const L = JSON.parse(JSON.stringify(lib)); for (const k of ['processes', 'rules']) { L[k] = L[k] || []; for (const x of base[k]) if (!L[k].some(y => y.id === x.id)) L[k].push(x); }
      for (const k of ['layers', 'goalNames', 'goals']) { L[k] = L[k] || {}; for (const key in base[k]) if (!(key in L[k])) L[k][key] = base[k][key]; }
      for (const kind in base.layers) for (const lay of base.layers[kind]) if (!L.layers[kind].some(x => x[0] === lay[0])) L.layers[kind].push(lay);   // новые слои внутри вида поверхности
      // Точечные правки демо-процессов (порядок работ): применяются, только если значение ещё демонстрационное (не правилось руками); иначе пропускаются и записываются в upgradeSkipped.
      L.upgradeSkipped = L.upgradeSkipped || [];
      for (const pt of SM.seeds.PATCHES) { if (pt.v <= (lib.version || 0)) continue; const p = L.processes.find(x => x.id === pt.id); if (!p) continue;
        if (JSON.stringify(p[pt.field]) === JSON.stringify(pt.from)) p[pt.field] = pt.to; else if (JSON.stringify(p[pt.field]) !== JSON.stringify(pt.to)) L.upgradeSkipped.push(pt.id + '.' + pt.field); }
      L.version = base.version; return L; },
    // v3 (D34): порядок работ по полу, как принято сейчас и как описано в справочнике (2.5.5, 2.5.6, 3.2.1, 3.2.2):
    // демонтаж → тёплый пол → стяжка → основная гидроизоляция по стяжке → плитка. Защитная гидроизоляция плиты — отдельный, не блокирующий шаг.
    PATCHES: [
      {v: 3, id: 'waterproof_floor', field: 'after', from: ['demolish_floor'], to: ['screed_new']},
      {v: 3, id: 'waterproof_floor', field: 'name', from: 'Гидроизоляция пола', to: 'Гидроизоляция пола (по стяжке, под плитку)'},
      {v: 3, id: 'heating_water', field: 'after', from: ['waterproof_floor'], to: ['demolish_floor']},
      {v: 3, id: 'screed_new', field: 'after', from: ['waterproof_floor', 'heating_water'], to: ['demolish_floor', 'heating_water']},
      {v: 3, id: 'tile_floor_lay', field: 'after', from: ['screed_new'], to: ['screed_new', 'waterproof_floor']},
      {v: 3, id: 'demolish_floor', field: 'effects', from: ['existing_floor', 'screed', 'waterproofing', 'heating', 'tile'].map(l => ({op: 'REMOVE', layer: l})), to: ['existing_floor', 'slab_waterproofing', 'screed', 'waterproofing', 'heating', 'tile'].map(l => ({op: 'REMOVE', layer: l}))}],
    // Демо-библиотека процессов и правил (ДАННЫЕ). Порядок процессов — только структура, без норм расхода/цен. Помечено как пример: пользователь может заменить.
    library() {
      const st = (kind, layer, is, quant) => ({state: {kind, layer, is, quant}}), E = (op, layer) => ({op, layer});
      const P = (id, name, surface, o) => Object.assign({id, name, surface, effects: []}, o);
      return {version: 3, demo: true,
        layers: {floor: [['existing_floor', 'Старый пол'], ['slab_waterproofing', 'Гидроизоляция плиты (под стяжку)'], ['waterproofing', 'Гидроизоляция (по стяжке)'], ['heating', 'Тёплый пол'], ['screed', 'Стяжка'], ['tile', 'Плитка']],
          wall: [['existing_tile', 'Старая плитка'], ['base_prepared', 'Основание подготовлено'], ['tile', 'Плитка'], ['painted', 'Окрашено']],
          ceiling: [['gkl', 'ГКЛ'], ['prepared', 'Подготовлено под краску'], ['painted', 'Окрашено']], box: [['base_prepared', 'Основание подготовлено'], ['painted', 'Окрашено']]},
        goalNames: {tile_floor: 'плитка на полу', wall_tile: 'плитка на стенах', paint_wall_zone: 'окраска зоны стены', gkl_ceiling_paint: 'потолок из ГКЛ под покраску', paint: 'покраска'},
        goals: {tile_floor: ['demolish_floor', 'screed_new', 'tile_floor_lay'], wall_tile: ['demolish_wall_tile', 'prepare_wall_base', 'tile_wall'], paint_wall_zone: ['prepare_wall_base', 'paint_wall_zone'],
          gkl_ceiling_paint: ['gkl_ceiling', 'prep_ceiling', 'paint_ceiling'], paint: ['paint_box']},
        processes: [
          P('demolish_floor', 'Демонтаж старого пола', 'floor', {needed: st('floor', 'existing_floor', 'YES'), ask: 'Есть ли в помещении старый пол, который нужно демонтировать?',
            effects: ['existing_floor', 'slab_waterproofing', 'screed', 'waterproofing', 'heating', 'tile'].map(l => E('REMOVE', l))}),
          P('waterproof_slab', 'Защитная гидроизоляция плиты (под стяжку)', 'floor', {after: ['demolish_floor'], effects: [E('ADD', 'slab_waterproofing')]}),
          P('heating_water', 'Водяной тёплый пол', 'floor', {after: ['demolish_floor'], effects: [E('ADD', 'heating')]}),
          P('screed_new', 'Новая стяжка', 'floor', {after: ['demolish_floor', 'heating_water'], effects: [E('ADD', 'screed')]}),
          P('waterproof_floor', 'Гидроизоляция пола (по стяжке, под плитку)', 'floor', {after: ['screed_new'], effects: [E('ADD', 'waterproofing')]}),
          P('repair_screed', 'Ремонт существующей стяжки', 'floor', {effects: [E('ADD', 'screed')]}),
          P('tile_floor_lay', 'Плитка на полу', 'floor', {after: ['screed_new', 'waterproof_floor'], effects: [E('ADD', 'tile')]}),
          P('demolish_wall_tile', 'Демонтаж старой плитки со стен', 'wall', {needed: st('wall', 'existing_tile', 'YES', 'any'), ask: 'На каких стенах осталась старая плитка? Отметьте «Старая плитка» у стен.', effects: [E('REMOVE', 'existing_tile')]}),
          P('prepare_wall_base', 'Подготовка основания стен', 'wall', {after: ['demolish_wall_tile'], effects: [E('ADD', 'base_prepared')]}),
          P('tile_wall', 'Плитка на стенах', 'wall', {after: ['prepare_wall_base'], effects: [E('ADD', 'tile')]}),
          P('paint_wall_zone', 'Окраска зоны стены', 'wall', {after: ['prepare_wall_base'], effects: [E('ADD', 'painted')]}),
          P('gkl_ceiling', 'Потолок из ГКЛ', 'ceiling', {effects: [E('ADD', 'gkl')]}),
          P('prep_ceiling', 'Подготовка потолка под краску', 'ceiling', {after: ['gkl_ceiling'], effects: [E('ADD', 'prepared')]}),
          P('paint_ceiling', 'Покраска потолка', 'ceiling', {after: ['prep_ceiling'], effects: [E('ADD', 'painted')]}),
          P('paint_box', 'Покраска короба', 'box', {requires: st('box', 'base_prepared', 'YES'), ask: 'Подготовлено ли основание короба под покраску?', blockedText: 'Основание короба не подготовлено', effects: [E('ADD', 'painted')]})],
        rules: [
          {id: 'wet_waterproof', name: 'Влажная зона', if: {all: [{room: {key: 'type', op: '==', value: 'bathroom'}}, {goal: 'tile_floor'}]},
            then: [{do: 'REQUIRE', process: 'waterproof_floor', because: 'Гидроизоляция добавлена: помещение — влажная зона (ванная) и выбрана плитка на полу'}]},
          {id: 'wet_slab', name: 'Защита плиты в санузле', if: {all: [{room: {key: 'type', op: '==', value: 'bathroom'}}, {goal: 'tile_floor'}]},
            then: [{do: 'ADD_PROCESS', process: 'waterproof_slab', because: 'Справочник (2.5.5) рекомендует для санузла защитную гидроизоляцию плиты под стяжкой; шаг не блокирует остальные работы'}]},
          {id: 'chosen_waterproof', name: 'Гидроизоляция выбрана', if: {param: {goal: 'tile_floor', key: 'waterproofing', op: '==', value: true}},
            then: [{do: 'REQUIRE', process: 'waterproof_floor', because: 'Вы выбрали гидроизоляцию пола'}]},
          {id: 'water_heating', name: 'Тёплый пол', if: {param: {goal: 'tile_floor', key: 'underfloorHeating', op: '==', value: 'water'}},
            then: [{do: 'ADD_PROCESS', process: 'heating_water', because: 'Выбран водяной тёплый пол'}]},
          {id: 'old_floor', name: 'Старый пол', ask: 'Есть ли в помещении старый пол?', if: {all: [{goal: 'tile_floor'}, {param: {goal: 'tile_floor', key: 'newScreed', op: '==', value: true}}, st('floor', 'existing_floor', 'YES')]},
            then: [{do: 'ADD_PROCESS', process: 'demolish_floor', because: 'В помещении старый пол, а выбрана новая стяжка — старый нужно демонтировать'}]},
          {id: 'screed_thick', name: 'Толщина стяжки', ask: 'Какая толщина новой стяжки, мм?', if: {param: {goal: 'tile_floor', key: 'screedThickness', op: '>', value: 50}},
            then: [{do: 'RECOMMEND', text: 'Армирование стяжки', because: 'Толщина стяжки больше 50 мм'}]}]};
    },
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
