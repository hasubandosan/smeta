# Журнал CAD-модуля
## 0.2.0 — срез 2: просмотр
`js/planner-ui.js` (`SM.planner.mount`, только чтение: помещения, стены с толщиной, проёмы, предметы, размеры, сетка, масштаб/сдвиг мышью и касанием, выбор), `planner.html` (стенд: эталонная ванная, вымышленный пример из 3 помещений, панель свойств, замечания, список проёмов без привязки), `SM.planner.describe`. Тесты `tests/planner-ui.test.js` (10 проверок, jsdom).

## 0.1.0 — срез 1: ядро
`js/planner.js`: `fromGeometry`/`toGeometry`, `moveVertex`, `snapPoint`, `toWorld`, `finish`, `measure`, `createHistory`. Тесты `tests/planner.test.js` (15 проверок): эталонная ванная (контур, 15,75 м²), round-trip без потерь, произвольные углы, неизвестная длина, привязка, undo/redo.
