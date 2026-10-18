/* Выполнение работ: статусы пункта плана, чек-лист приёмки. Без DOM.
   item (пункт плана) = {id, techId, roomId, processId?, status?: PLANNED|IN_PROGRESS|COMPLETED|ACCEPTED, checks?: {noteId: true}}
   Чек-лист = заметки операций технологии с cat:'accept' (единый источник: op.notes). Условия = cat:'cond', частые ошибки = cat:'error'.
   COMPLETED применяет эффекты процесса к состоянию объекта. ACCEPTED — только когда отмечены все пункты приёмки. */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, X = SM.exec = {};
  X.LABEL = {PLANNED: 'Запланировано', IN_PROGRESS: 'В работе', COMPLETED: 'Выполнено', ACCEPTED: 'Принято'};
  const notes = (tech, cat, item) => (tech ? tech.ops : []).filter(op => !(item && (item.skipOps || {})[op.id])).flatMap(op => (op.notes || []).filter(n => n.cat === cat && n.text).map(n => Object.assign({op: op.name}, n)));
  const procStatus = (S, item) => { if (!item.processId || !S.library) return null;
    try { return SM.rules.plan(S.object, S.library, item.roomId).items.find(x => x.id === item.processId) || null; } catch (e) { return null; } };

  X.view = (S, item) => { const tech = (SM.ver ? SM.ver.resolve(S, item) : S.techs.find(t => t.id === item.techId)), ps = procStatus(S, item), checks = item.checks || {};
    const meas = item.measure || {}, list = notes(tech, 'accept', item).map(n => ({id: n.id, text: n.text, done: !!checks[n.id]}))
      .concat((item.accept || []).map(a => ({id: a.id, text: a.text, group: a.group || '', extra: true, src: a.src || 'custom', meas: !!a.meas, measure: meas[a.id] || '', done: !!checks[a.id]})));
    const st = item.status || 'PLANNED', waits = ps && ps.status !== 'READY' && ps.status !== 'DONE' ? ps.reasons.length ? ps.reasons : ['Процесс пока нельзя начинать'] : [];
    return {status: st, canStart: st === 'PLANNED' && !waits.length, waits, process: ps, checklist: list, allChecked: list.every(x => x.done),
      conditions: notes(tech, 'cond', item).map(n => n.text), errors: notes(tech, 'error', item).map(n => n.text)};
  };
  X.start = (S, item) => { const v = X.view(S, item); if (v.status !== 'PLANNED') throw new Error('Работа уже не в статусе «Запланировано»');
    if (v.waits.length) throw new Error('Нельзя начать: ' + v.waits.join('; ')); item.status = 'IN_PROGRESS'; return item; };
  X.complete = (S, item) => { if ((item.status || 'PLANNED') !== 'IN_PROGRESS') throw new Error('Завершить можно только работу «В работе»');
    const ps = procStatus(S, item); if (ps && ps.status === 'READY') SM.rules.complete(S.object, S.library, item.roomId, item.processId);
    else if (ps && ps.status !== 'DONE') throw new Error('Нельзя завершить: ' + (ps.reasons.join('; ') || 'процесс не готов'));
    item.status = 'COMPLETED'; return item; };
  X.check = (item, noteId, val) => { item.checks = item.checks || {}; if (val) item.checks[noteId] = true; else delete item.checks[noteId]; return item; };
  /* Дополнительные пункты приёмки пункта плана (из справочника или свои): item.accept = [{id, text, group?, meas?, src, topicId?}], замеры item.measure = {id: текст}. */
  const open = item => { if (item.status === 'ACCEPTED') throw new Error('Работа принята — приёмка закрыта'); };
  X.addAccept = (item, entries) => { open(item); item.accept = item.accept || []; const have = new Set(item.accept.map(a => a.text.trim().toLowerCase())); let n = 0;
    for (const e of entries || []) { const text = String(e.text || '').trim(); if (!text || have.has(text.toLowerCase())) continue; have.add(text.toLowerCase());
      const a = {id: SM.uid(), text, src: e.src || 'custom'}; if (e.group) a.group = e.group; if (e.meas) a.meas = true; if (e.topicId) a.topicId = e.topicId; item.accept.push(a); n++; } return n; };
  X.removeAccept = (item, id) => { open(item); item.accept = (item.accept || []).filter(a => a.id !== id); if (item.checks) delete item.checks[id]; if (item.measure) delete item.measure[id]; return item; };
  X.setMeasure = (item, id, val) => { open(item); const a = (item.accept || []).find(x => x.id === id); if (!a || !a.meas) throw new Error('Для этого пункта замер не предусмотрен');
    item.measure = item.measure || {}; const s = String(val == null ? '' : val).trim(); if (s) item.measure[id] = s; else delete item.measure[id]; return item; };
  X.accept = (S, item) => { if (item.status !== 'COMPLETED') throw new Error('Принять можно только выполненную работу');
    const left = X.view(S, item).checklist.filter(x => !x.done); if (left.length) throw new Error('Не пройдена приёмка: ' + left.map(x => x.text).join('; '));
    item.status = 'ACCEPTED'; return item; };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
