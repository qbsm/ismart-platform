# Improvements Plan — 2026-05-21

Снапшот анализа ядра + оркестратора. Привязан к [`health-2026-05-21.md`](health-2026-05-21.md) и [`../architecture/orchestrator-role.md`](../architecture/orchestrator-role.md). По мере реализации пункты переезжают в [`opportunities.md`](opportunities.md) (status: done).

## Главная проблематика

Оркестратор детектирует одни и те же 8 пустых секций неделю за неделей, но **не закрывает цикл**: корневая причина — отсутствие `data.items_from` в ядре, фикс лежит в `DataLoaderService`, а оркестратор только показывает симптом. Beepitron обходит это runtime-скриптом `populate-bp-multilang.py`. Следующий deployment повторит эту боль.

## Ключевые шаги (порядок реализации)

### 1. ADR-0004 `data.items_from` — DONE (2026-05-21)

Документ `docs/architecture/decisions/0004-data-items-from.md`. Зафиксированы три источника items (inline / collection / directory-scan), MVP-опции (`items_from`, `limit`), зарезервированы `order/filter`, правила backward-compat.

### 2. Реализация `data.items_from` в `DataLoaderService` — DONE (2026-05-21)

`DataLoaderService::injectItemsFrom()` + `scanCollectionSlugs()` (natural sort). Вызов из `PageAction::__invoke()` сразу после `loadPage`. 7 unit-тестов в `tests/php/Unit/DataLoaderItemsFromTest.php` — declared order, no-override, directory scan + natural sort, limit, nav_slug resolution. PHPUnit 78/78 OK, PHPStan чист.

### 3. Cleanup beepitron — DONE (2026-05-21)

`distill sync` подтянул `DataLoaderService.php` + `PageAction.php` в beepitron. `pages/categories.json :: categories-container` получил `items_from: "categories"`. `populate-bp-multilang.py` в репо отсутствует (видимо был удалён ранее). `data-flow-audit.mjs` научен распознавать `items_from` как валидный источник — beepitron finding устранён (dataFlow findings: 8 → 7).

### 4. Заполнить TODO в `docs/inventory/deployments.md` — DONE (2026-05-21)

Зафиксированы repo URL + ветки для trazano (`github:qbsm/trazano-tires.ru` / `feat/migrate-to-ismart-platform`) и mirage (`github:qbsm/mirage-russia.ru` / `feat/migrate-to-ismart-platform`). Все 5 deployments уже имеют `.distill/state.json`. italy `RestaurantSeoBuilder.php` уже в overrides. Photoroom в kumho отсутствует физически — TODO оставлен открытым до появления файла.

### 5. Inventory pass для commit-miner — DONE (2026-05-21)

`docs/inventory/commit-baseline.md` собран: 457 коммитов за 90 дней, weighted Conventional 53%. beepitron 93% (лидер), italy 13% (blind spot — требует keyword-fallback). CORE-touching ratio 56% (254/457) — material для mining есть.

### 6. MVP `analyzers/commit-miner.mjs` — DONE (2026-05-21)

3 категории классификации (CORE-hotfix / Recurring topic / Convention violation), 17 recurring topics найдено cross-deployment, TOP: `feat(seo)` ×8 (все 5 deployments — линкуется с ADR-0003), `fix(css)` ×5 в 4 deployments, `fix(twig)` ×4 в trazano+mirage. `Reusable feature` / `Drift origin` / `CORE-refactor` отложены (требуют AST или manifest.kind).

### 7. `divergence-audit` учитывает overrides + `opportunity-tracker` — DONE (2026-05-21)

`divergence-audit.mjs` теперь читает `.distill/state.json :: overrides` и классифицирует drift на Intentional / Ready-to-sync — колонки добавлены в health-report. Новый `analyzers/opportunity-tracker.mjs` парсит маркеры `<!-- tracks: <kind>[:<value>] -->` в `opportunities.md` (поддерживает `data-flow`, `pattern[:kind]`, `commit[:scope]`), считает found-count из текущего прогона. Добавлены opportunities #12-#14 на основе commit-miner findings.

## Что отложено

Известно, но не блокирует главный цикл оркестратора:

- Доп. паттерны в `pattern-detector` (`numeric-id-in-url`, `legacy-page-id`, расширенный hex).
- `duplicate-detector` — нужен только когда несколько deployments начнут плодить SeoBuilder'ы.
- Split `PageAction::__invoke()` (155 строк) — не блокирует шаг 2 если items_from живёт в `DataLoaderService`.
- `CsrfTokenService` — после split'а PageAction.
- Реестр deployments как JSON для `orchestrate.mjs` — пока хардкод работает.

## Параллельность

Шаги 1–3 (фикс ядра) и шаги 4–5 (подготовка к commit-miner) — независимые треки. Один ресурс — иди по порядку. Два ресурса — параллельно.
