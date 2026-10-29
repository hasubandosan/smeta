/* Слои отделки поверхностей (D45). Без DOM.
   S.layerTypes = [{id, name, thickness, kinds:['wall'|'floor'|'ceiling'|'box']}] — типы слоёв и толщина по умолчанию, м (null = неизвестно). Стартовые значения — ориентиры, правятся.
   surface.layers = [{id, type, status:'existing'|'done'|'planned', thickness:null|число, note}] — один список от основания наружу.
   Толщина слоя = своя (если задана вручную) иначе по умолчанию от типа: меняется тип/его стандарт — не заданные вручную слои следуют за ним. */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, L = SM.layers = {}, unk = v => SM.isUnknown(v) || v === '';
  L.VERSION = 1; L.KINDS = ['wall', 'floor', 'ceiling', 'box'];
  L.STATUS = [['existing', 'Есть сейчас'], ['done', 'Сделано'], ['planned', 'Запланировано']];
  const T = (id, name, mm, kinds) => ({id, name, thickness: mm / 1000, kinds});
  L.seedTypes = () => [T('plaster', 'Штукатурка гипсовая', 15, ['wall', 'ceiling', 'box']), T('putty', 'Шпаклёвка', 2, ['wall', 'ceiling', 'box']), T('paint', 'Краска', 0.2, ['wall', 'ceiling', 'box']), T('wallpaper', 'Обои', 1, ['wall']),
    T('wall_tile', 'Плитка стеновая с клеем', 12, ['wall', 'box']), T('gkl', 'ГКЛ 12,5 мм', 12.5, ['wall', 'ceiling', 'box']), T('waterproof', 'Гидроизоляция обмазочная', 2, ['wall', 'floor']),
    T('screed', 'Стяжка', 50, ['floor']), T('self_level', 'Наливной пол', 5, ['floor']), T('floor_tile', 'Плитка напольная с клеем', 15, ['floor']), T('laminate', 'Ламинат с подложкой', 10, ['floor']), T('linoleum', 'Линолеум', 3, ['floor'])];
  // Добавляет недостающие стартовые типы только при росте версии набора (удалённые владельцем не возвращаются; существующие не меняются)
  L.ensureTypes = S => { const first = !Array.isArray(S.layerTypes); if (first) S.layerTypes = []; const v = first ? 0 : (S.layerTypesVersion || 0);
    if (v < L.VERSION) for (const t of L.seedTypes()) if (!S.layerTypes.some(x => x.id === t.id)) S.layerTypes.push(t); S.layerTypesVersion = L.VERSION; return S.layerTypes; };
  L.typeOf = (S, id) => (S.layerTypes || []).find(t => t.id === id) || null;
  L.typesFor = (S, kind) => (S.layerTypes || []).filter(t => (t.kinds || []).includes(kind));
  L.addType = (S, name) => { const t = {id: SM.uid(), name: name || 'Новый слой', thickness: null, kinds: ['wall']}; S.layerTypes.push(t); return t; };
  L.typeUse = (S, typeId) => S.object.surfaces.reduce((n, s) => n + L.of(s).filter(l => l.type === typeId).length, 0);
  L.removeType = (S, typeId) => { const n = L.typeUse(S, typeId); if (n) throw new Error('тип слоя используется (' + n + ') — сначала уберите эти слои'); S.layerTypes = S.layerTypes.filter(t => t.id !== typeId); };
  L.setTypeKind = (S, typeId, kind, on) => { const t = L.typeOf(S, typeId); if (!t) throw new Error('тип слоя не найден'); if (!L.KINDS.includes(kind)) throw new Error('неизвестный вид поверхности'); const k = new Set(t.kinds || []); if (on) k.add(kind); else k.delete(kind); t.kinds = L.KINDS.filter(x => k.has(x)); return t; };

  L.of = s => s.layers || [];
  L.defaultOf = (S, ly) => { const t = L.typeOf(S, ly.type); return t && !unk(t.thickness) ? +t.thickness : null; };
  L.thicknessOf = (S, ly) => (!unk(ly.thickness) ? +ly.thickness : L.defaultOf(S, ly));
  const surf = (S, id) => { const s = S.object.surfaces.find(x => x.id === id); if (!s) throw new Error('поверхность не найдена'); return s; };
  const lay = (s, id) => { const l = L.of(s).find(x => x.id === id); if (!l) throw new Error('слой не найден'); return l; };
  const okType = (S, s, typeId) => { const t = L.typeOf(S, typeId); if (!t) throw new Error('тип слоя не найден'); if (!L.KINDS.includes(s.kind)) throw new Error('на этой поверхности слоёв отделки нет'); if (!(t.kinds || []).includes(s.kind)) throw new Error('слой «' + t.name + '» не для этой поверхности'); return t; };
  const okStatus = st => { if (!L.STATUS.some(x => x[0] === st)) throw new Error('статус слоя: «есть сейчас», «сделано» или «запланировано»'); return st; };
  const okTh = v => { if (unk(v)) return null; if (!(+v > 0)) throw new Error('толщина слоя — положительное число, м (пусто = по умолчанию)'); return +v; };

  L.add = (S, surfaceId, typeId, opt) => { const s = surf(S, surfaceId); okType(S, s, typeId); opt = opt || {}; const ly = {id: SM.uid(), type: typeId, status: okStatus(opt.status || 'planned'), thickness: okTh(opt.thickness), note: opt.note || ''};
    s.layers = L.of(s).slice(); if (opt.at === undefined || opt.at >= s.layers.length) s.layers.push(ly); else s.layers.splice(Math.max(0, opt.at), 0, ly); return ly; };
  L.update = (S, surfaceId, layerId, patch) => { const s = surf(S, surfaceId), ly = lay(s, layerId);
    if ('type' in patch) { okType(S, s, patch.type); ly.type = patch.type; } if ('status' in patch) ly.status = okStatus(patch.status); if ('thickness' in patch) ly.thickness = okTh(patch.thickness); if ('note' in patch) ly.note = patch.note || ''; return ly; };
  L.remove = (S, surfaceId, layerId) => { const s = surf(S, surfaceId); lay(s, layerId); s.layers = L.of(s).filter(x => x.id !== layerId); };
  L.move = (S, surfaceId, layerId, delta) => { const s = surf(S, surfaceId); lay(s, layerId); const a = s.layers, i = a.findIndex(x => x.id === layerId), j = i + delta; if (j < 0 || j >= a.length) return false; [a[i], a[j]] = [a[j], a[i]]; return true; };
  // Пипетка слоёв: список целиком копируется на другие поверхности того же вида (новые id); у общей стены стороны остаются независимыми
  L.copyLayers = (S, fromId, toIds) => { const f = surf(S, fromId); let n = 0;
    for (const id of toIds) { if (id === fromId) continue; const t = surf(S, id); if (t.kind !== f.kind) throw new Error('слои копируются только на поверхность того же вида'); t.layers = L.of(f).map(l => Object.assign({}, l, {id: SM.uid()})); n++; } return n; };
  L.surfaceOfWall = (S, wallId) => S.object.surfaces.find(s => s.kind === 'wall' && s.wallId === wallId && !s.orphan) || null;
  // Суммарная толщина слоёв (по умолчанию все статусы): {sum, unknown:[layerId]} — слой без известной толщины в сумму не входит и перечисляется
  L.total = (S, s, statuses) => { let sum = 0; const unknown = []; for (const ly of L.of(s)) { if (statuses && !statuses.includes(ly.status)) continue; const t = L.thicknessOf(S, ly); if (t === null) unknown.push(ly.id); else sum += t; } return {sum, unknown}; };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = globalThis.SM;
