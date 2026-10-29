/* Стены: типы (материал → толщина по умолчанию), пипетка (копирование свойств), общие стены (D44). Без DOM.
   S.wallTypes = [{id, name, thickness}] — толщина по умолчанию, м (null = неизвестно); wall.material — id типа (или произвольная строка).
   Толщина по умолчанию — обычное значение wall.thickness, подставляемое при выборе материала; дальше её можно менять руками (контракт CAD не меняется).
   Общая стена двух комнат = две записи wall, связанные wall.shared (CAD_CONTRACT): материал и толщина у пары совпадают (одна физическая стена). */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, W = SM.walls = {}, unk = v => SM.isUnknown(v) || v === '';
  const KEYS = ['material', 'thickness'], eq = (a, b) => (unk(a) && unk(b)) || a === b;
  W.KEYS = KEYS;
  const wall = (S, id) => { const w = S.object.geometry.walls.find(x => x.id === id); if (!w) throw new Error('стена не найдена'); return w; };
  W.typeOf = (S, w) => (S.wallTypes || []).find(t => t.id === w.material) || null;
  W.defaultThickness = (S, w) => { const t = W.typeOf(S, w); return t && !unk(t.thickness) ? +t.thickness : null; };
  W.pairOf = (g, w) => { if (unk(w.shared)) return null; const p = g.walls.find(x => x.id === w.shared); return p && p.shared === w.id ? p : null; };

  // Для каждого материала, использованного в стенах, заводится тип (толщина неизвестна — вводит владелец). Ничего не меняет и не удаляет.
  W.ensureTypes = S => { S.wallTypes = Array.isArray(S.wallTypes) ? S.wallTypes : []; const added = [];
    for (const w of S.object.geometry.walls) if (!unk(w.material) && !S.wallTypes.some(t => t.id === w.material)) { S.wallTypes.push({id: w.material, name: w.material, thickness: null}); added.push(w.material); }
    return added; };
  W.addType = (S, name) => { S.wallTypes = S.wallTypes || []; const t = {id: SM.uid(), name: name || 'Новый тип', thickness: null}; S.wallTypes.push(t); return t; };

  const mirror = (g, w, keys) => { const p = W.pairOf(g, w); if (p) for (const k of keys) p[k] = w[k]; return p; };
  // Смена материала: толщина берётся из типа, если она неизвестна или ещё равна стандарту прежнего типа (то есть не правилась руками).
  W.setMaterial = (S, wallId, material) => { const w = wall(S, wallId), prev = W.defaultThickness(S, w), was = w.thickness; w.material = unk(material) ? '' : material;
    const d = W.defaultThickness(S, w); if (d !== null && (unk(was) || (prev !== null && +was === prev))) w.thickness = d;
    mirror(S.object.geometry, w, KEYS); return w; };
  W.setThickness = (S, wallId, v) => { const w = wall(S, wallId); if (!unk(v) && !(+v > 0)) throw new Error('толщина — положительное число, м'); w.thickness = unk(v) ? null : +v; mirror(S.object.geometry, w, ['thickness']); return w; };
  W.applyDefault = (S, wallId) => { const w = wall(S, wallId), d = W.defaultThickness(S, w); if (d === null) return false; W.setThickness(S, wallId, d); return true; };
  // Пипетка: скопировать свойства (материал, толщину) со стены на другие стены.
  W.copyProps = (S, fromId, toIds, keys) => { const f = wall(S, fromId), ks = (keys || KEYS).filter(k => KEYS.includes(k)); let n = 0;
    for (const id of toIds) { if (id === fromId) continue; const t = wall(S, id); for (const k of ks) t[k] = unk(f[k]) ? (k === 'material' ? '' : null) : f[k]; mirror(S.object.geometry, t, ks); n++; } return n; };

  // Согласование пар после правки на плане: изменённая сторона побеждает; неизвестное заполняется известным; расхождение двух известных значений — замечание, значения не трогаются.
  W.syncPairs = (oldG, newG) => { const changes = [], notes = [], done = new Set(), oldW = id => (oldG.walls || []).find(x => x.id === id);
    for (const w of newG.walls) { const p = W.pairOf(newG, w); if (!p || done.has(w.id) || done.has(p.id)) continue; done.add(w.id); done.add(p.id);
      for (const k of KEYS) { if (eq(w[k], p[k])) continue; const ow = oldW(w.id), op = oldW(p.id), cw = ow && !eq(ow[k], w[k]), cp = op && !eq(op[k], p[k]); let from = null, to = null;
        if (unk(p[k]) && !unk(w[k])) [from, to] = [w, p]; else if (unk(w[k]) && !unk(p[k])) [from, to] = [p, w]; else if (cw && !cp) [from, to] = [w, p]; else if (cp && !cw) [from, to] = [p, w];
        if (from) { changes.push({wallId: to.id, key: k, from: to[k], to: from[k]}); to[k] = from[k]; }
        else notes.push('Общая стена «' + (w.name || w.id) + '» ↔ «' + (p.name || p.id) + '»: ' + (k === 'material' ? 'материалы' : 'толщины') + ' различаются — выровняйте'); } }
    return {changes, notes}; };
  // Расхождения в текущих данных (для предупреждения в «Объекте»)
  W.conflicts = g => { const out = [], seen = new Set(); for (const w of g.walls) { const p = W.pairOf(g, w); if (!p || seen.has(p.id)) continue; seen.add(w.id); const ks = KEYS.filter(k => !eq(w[k], p[k]) && !unk(w[k]) && !unk(p[k])); if (ks.length) out.push({a: w.id, b: p.id, keys: ks}); } return out; };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = globalThis.SM;
