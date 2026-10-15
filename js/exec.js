/* Выполнение работ: статусы пункта плана, чек-лист приёмки. Без DOM.
   item (пункт плана) = {id, techId, roomId, processId?, status?: PLANNED|IN_PROGRESS|COMPLETED|ACCEPTED, checks?: {noteId: true}}
   Чек-лист = заметки операций технологии с cat:'accept' (единый источник: op.notes). Условия = cat:'cond', частые ошибки = cat:'error'.
   COMPLETED применяет эффекты процесса к состоянию объекта. ACCEPTED — только когда отмечены все пункты приёмки. */
(function (root) {
  'use strict';
  const SM = root.SM = root.SM || {}, X = SM.exec = {};
  X.LABEL = {PLANNED: 'Запланировано', IN_PROGRESS: 'В работе', COMPLETED: 'Выполнено', ACCEPTED: 'Принято'};
  const notes = (tech, cat) => (tech ? tech.ops : []).flatMap(op => (op.notes || []).filter(n => n.cat === cat && n.text).map(n => Object.assign({op: op.name}, n)));
  const procStatus = (S, item) => { if (!item.processId || !S.library) return null;
    try { return SM.rules.plan(S.object, S.library, item.roomId).items.find(x => x.id === item.processId) || null; } catch (e) { return null; } };

  X.view = (S, item) => { const tech = S.techs.find(t => t.id === item.techId), ps = procStatus(S, item), checks = item.checks || {};
    const list = notes(tech, 'accept').map(n => ({id: n.id, text: n.text, done: !!checks[n.id]}));
    const st = item.status || 'PLANNED', waits = ps && ps.status !== 'READY' && ps.status !== 'DONE' ? ps.reasons.length ? ps.reasons : ['Процесс пока нельзя начинать'] : [];
    return {status: st, canStart: st === 'PLANNED' && !waits.length, waits, process: ps, checklist: list, allChecked: list.every(x => x.done),
      conditions: notes(tech, 'cond').map(n => n.text), errors: notes(tech, 'error').map(n => n.text)};
  };
  X.start = (S, item) => { const v = X.view(S, item); if (v.status !== 'PLANNED') throw new Error('Работа уже не в статусе «Запланировано»');
    if (v.waits.length) throw new Error('Нельзя начать: ' + v.waits.join('; ')); item.status = 'IN_PROGRESS'; return item; };
  X.complete = (S, item) => { if ((item.status || 'PLANNED') !== 'IN_PROGRESS') throw new Error('Завершить можно только работу «В работе»');
    const ps = procStatus(S, item); if (ps && ps.status === 'READY') SM.rules.complete(S.object, S.library, item.roomId, item.processId);
    else if (ps && ps.status !== 'DONE') throw new Error('Нельзя завершить: ' + (ps.reasons.join('; ') || 'процесс не готов'));
    item.status = 'COMPLETED'; return item; };
  X.check = (item, noteId, val) => { item.checks = item.checks || {}; if (val) item.checks[noteId] = true; else delete item.checks[noteId]; return item; };
  X.accept = (S, item) => { if (item.status !== 'COMPLETED') throw new Error('Принять можно только выполненную работу');
    const left = X.view(S, item).checklist.filter(x => !x.done); if (left.length) throw new Error('Не пройдена приёмка: ' + left.map(x => x.text).join('; '));
    item.status = 'ACCEPTED'; return item; };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = (typeof window !== 'undefined' ? window : globalThis).SM;
