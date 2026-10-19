# Журнал CAD-модуля
## 0.1.0 — срез 1: ядро
`js/planner.js`: `fromGeometry`/`toGeometry`, `moveVertex`, `snapPoint`, `toWorld`, `finish`, `measure`, `createHistory`. Тесты `tests/planner.test.js` (15 проверок): эталонная ванная (контур, 15,75 м²), round-trip без потерь, произвольные углы, неизвестная длина, привязка, undo/redo.
