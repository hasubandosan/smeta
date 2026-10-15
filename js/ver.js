/* Версии технологий (ТЗ §17). Без DOM.
   S.techs — текущие (редактируемые) технологии. S.techVersions = {techId: [{v, t, note?, tech: <полная копия>}]} — неизменяемые снимки.
   Пункт плана хранит techVer — версию, на которой он считается. Правка технологии НЕ меняет уже запланированные/начатые работы:
   они считаются по своему снимку. Новая версия создаётся только когда содержимое изменилось (ставят в план или «Зафиксировать»). */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, V = SM.ver = {};
  const clone = x => JSON.parse(JSON.stringify(x)), sig = x => JSON.stringify(x);
  const list = (S, id) => (S.techVersions || {})[id] || [];
  const cur = (S, id) => S.techs.find(t => t.id === id) || null;

  V.latest = (S, id) => { const L = list(S, id); return L.length ? L[L.length - 1] : null; };
  V.isChanged = (S, id) => { const t = cur(S, id), l = V.latest(S, id); return !!t && (!l || sig(l.tech) !== sig(t)); };

  /* Создаёт снимок текущей технологии, если её содержимое отличается от последней версии; иначе возвращает последнюю. */
  V.release = (S, id, note) => { const t = cur(S, id); if (!t) throw new Error('Технология не найдена'); const l = V.latest(S, id);
    if (l && sig(l.tech) === sig(t)) return l;
    const e = {v: l ? l.v + 1 : 1, t: Date.now(), tech: clone(t)}; if (note) e.note = String(note);
    (S.techVersions = S.techVersions || {})[id] = list(S, id).concat([e]); return e; };

  /* Привязывает пункт плана к версии (создаёт её при необходимости). Уже привязанный пункт не трогает. */
  V.pin = (S, item) => { if (item.techVer && list(S, item.techId).some(x => x.v === item.techVer)) return item.techVer;
    if (cur(S, item.techId)) item.techVer = V.release(S, item.techId).v; else if (V.latest(S, item.techId)) item.techVer = V.latest(S, item.techId).v; return item.techVer || null; };
  /* Миграция старых проектов: пункты без версии фиксируются на текущей технологии (ничего не меняется, пока технологию не правили). */
  V.pinAll = S => { for (const it of S.plan || []) if (!it.techVer) V.pin(S, it); return S; };

  /* Технология, по которой считается пункт плана: его версия, а если версии нет — текущая. */
  V.resolve = (S, item) => { const e = item.techVer ? list(S, item.techId).find(x => x.v === item.techVer) : null; return e ? e.tech : cur(S, item.techId); };

  const matName = S => id => (S.materials.find(m => m.id === id) || {name: id}).name;
  V.diff = (a, b, mn) => { const out = [], q = x => (x === null || x === undefined || x === '' ? '?' : x), mname = mn || (id => id);
    if (a.name !== b.name) out.push('название: «' + a.name + '» → «' + b.name + '»');
    if ((a.processId || '') !== (b.processId || '')) out.push('процесс изменён');
    const pk = (a.params || []).map(p => p.key), qk = (b.params || []).map(p => p.key);
    for (const k of qk) if (!pk.includes(k)) out.push('параметр добавлен: ' + k);
    for (const k of pk) if (!qk.includes(k)) out.push('параметр убран: ' + k);
    for (const p of a.params || []) { const n = (b.params || []).find(x => x.key === p.key); if (n && n.def !== p.def) out.push('параметр ' + p.key + ': ' + q(p.def) + ' → ' + q(n.def)); }
    for (const o of b.ops || []) if (!(a.ops || []).some(x => x.id === o.id)) out.push('добавлена операция «' + o.name + '»');
    for (const o of a.ops || []) { const n = (b.ops || []).find(x => x.id === o.id); if (!n) { out.push('убрана операция «' + o.name + '»'); continue; }
      const nm = n.name || o.name;
      if (o.name !== n.name) out.push('операция «' + o.name + '» → «' + n.name + '»');
      for (const [f, lb] of [['unit', 'единица'], ['price', 'цена'], ['qty', 'объём']]) if (o[f] !== n[f]) out.push('«' + nm + '»: ' + lb + ' ' + q(o[f]) + ' → ' + q(n[f]));
      for (const m of n.mats || []) if (!(o.mats || []).some(x => x.id === m.id)) out.push('«' + nm + '»: добавлен материал ' + mname(m.matId));
      for (const m of o.mats || []) { const k = (n.mats || []).find(x => x.id === m.id); if (!k) out.push('«' + nm + '»: убран материал ' + mname(m.matId));
        else { if (m.matId !== k.matId) out.push('«' + nm + '»: материал ' + mname(m.matId) + ' → ' + mname(k.matId)); if (m.rate !== k.rate) out.push('«' + nm + '»: расход ' + mname(k.matId) + ' ' + q(m.rate) + ' → ' + q(k.rate)); } }
      if (sig(o.notes || []) !== sig(n.notes || [])) out.push('«' + nm + '»: изменены условия/ошибки/приёмка'); }
    return out; };

  /* Состояние версии пункта плана для показа: на какой версии, изменена ли технология, можно ли обновить. */
  V.state = (S, item) => { const t = cur(S, item.techId), pinned = item.techVer || null, pt = V.resolve(S, item), st = item.status || 'PLANNED';
    const changed = !!t && !!pt && sig(pt) !== sig(t);
    return {pinned, changed, canUpdate: changed && st === 'PLANNED', frozen: changed && st !== 'PLANNED', changes: changed ? V.diff(pt, t, matName(S)) : []}; };

  /* Явное обновление пункта до текущей технологии. Только для ещё не начатых работ (начатая работа остаётся на своей версии). */
  V.update = (S, item, note) => { const st = item.status || 'PLANNED'; if (st !== 'PLANNED') throw new Error('Работа уже начата — она остаётся на своей версии технологии');
    if (!cur(S, item.techId)) throw new Error('Текущей технологии нет — обновлять не на что'); const from = item.techVer || null, before = V.resolve(S, item), e = V.release(S, item.techId, note);
    if (from === e.v) throw new Error('Версия не изменилась: технология совпадает с версией v' + e.v);
    item.techVer = e.v; return {from, to: e.v, changes: before ? V.diff(before, e.tech, matName(S)) : []}; };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
