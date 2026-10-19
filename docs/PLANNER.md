# CAD-планировщик: как устроен модуль
Версия модуля: `SM.planner.VERSION` (см. `PLANNER_CHANGELOG.md`). Контракт: `CAD_CONTRACT.md` (версия 1). Решения: `PLANNER_DECISIONS.md`.

## Файлы
- `js/planner.js` — чистое ядро, без DOM, тестируется в Node (`tests/planner.test.js`).
- `js/planner-ui.js` — интерфейс (SVG), `SM.planner.mount`; `planner.html` — отдельная страница-стенд (открывается с file://, подключает core, geometry, model, seeds и файлы планировщика). Тест: `tests/planner-ui.test.js` (нужен jsdom).

## Ядро (срез 1)
`drawing = {rooms, walls, openings, fixtures}`. У каждой записи: `id`, `src` (полная копия записи геометрии, включая неизвестные поля) и производные поля (не сохраняются): у комнаты `vertices, closed, area, perimeter, issue`; у стены `roomId, a, b`; у проёма `p1, p2` (концы по `at`/`w`, иначе `null`). Координаты в метрах, Y вверх, локальные для комнаты (`room.pos` — положение на плане, см. `toWorld`).

| Функция | Что делает |
|---|---|
| `fromGeometry(g)` | геометрия → drawing; вход не меняется; неизвестная длина/незамкнутый контур не ломают загрузку (`vertices = null`, `issue` по-русски) |
| `toGeometry(drawing, base)` | drawing → новая геометрия; id и неизвестные поля сохраняются; `len/turn` пересчитываются только если вершины реально сдвинуты |
| `moveVertex(drawing, roomId, i, pt)` | новый drawing с пересчитанными `len/turn` соседних стен; бросает понятную ошибку, если контур править нельзя |
| `snapPoint(drawing, pt, {grid, tol, roomId})` | привязка: вершина, затем сетка; `grid` не задан → точка как есть |
| `finish(drawing, base)` | `{ok, geometry, issues}`; `geometry` отдаётся только при `SM.geo.validate(...).ok` |
| `measure(g)` | пол/периметр по комнатам (через `SM.geo.deriveRoom`) |
| `describe(g, id)` | текст для панели свойств: `{kind, title, rows}`; неизвестное — «не задано» |
| `createHistory(g)` | undo/redo снимками без лимита глубины; в проект не попадает |

Ограничение (P2): форма хранится «черепашкой», поэтому поворот и сдвиг контура целиком не хранятся в `len/turn`; после правки первая стена снова идёт вдоль +X. Положение комнаты на плане — только `room.pos` (срез 5).

## Интерфейс (срез 2, только просмотр)
`const h = SM.planner.mount(el, {geometry, readOnly, onSelect, onIssues})` рисует SVG: сетку (шаг подбирается по масштабу), помещения с названием и площадью, стены (толщина, если известна; иначе тонкая линия), длины стен снаружи контура, проёмы на стенах (дверь/окно по `kind`), предметы. Проёмы без стены и без `at` не рисуются (они в списке «без привязки» на стенде). Предмет без `w`/`d` — маркер, размеры не выдумываются.
Управление: мышь и касание — сдвиг перетаскиванием, колесо/щипок — масштаб, клик/тап — выбор (Shift — добавить к выбору), кнопки «+», «−», «⤢».
`h`: `setGeometry, getGeometry, select(ids), selected, focus(roomId), fit, zoomIn, zoomOut, setReadOnly, isReadOnly, undo, redo, view, flush, destroy`. `select` программно не вызывает `onSelect`. До среза 3 правок нет: `onChange` не вызывается, `undo/redo` возвращают `false`.
