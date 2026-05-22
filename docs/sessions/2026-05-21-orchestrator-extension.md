# Сессия 2026-05-21 — Расширение роли оркестратора + реестр deployments

Документальная сессия по анализу baseline-ядра и оркестратора через `architecture/orchestrator-role.md`. Кода не трогали — итог в виде ADR-ready планов.

## Ключевые моменты

**Главный gap — оркестратор не замыкает цикл.** `npm run orchestrate` стабильно показывает 8 секций с пустым `data.items` при наличии entity-папки. Симптом не уходит, потому что фикс лежит в ядре (отсутствие `data.items_from` в `DataLoaderService`), а оркестратор только детектирует. Beepitron обходит это runtime-скриптом `populate-bp-multilang.py`, следующий deployment повторит боль.

**Commit-mining — новая часть роли (#7 analyzer).** Текущий оркестратор смотрит только финальный sha256-state. История коммитов deployments не анализируется — теряется интент изменений (commit message «fix: cookie panel disappears» сразу маршрутизирует к opportunity #7), теряются recurring fixes (один баг фиксят в kumho и через неделю в beepitron — должны были поймать после первого), теряется drift origin (italy показывает 92 drift'а, никто не знает когда и каким коммитом). Подход без LLM: Conventional Commits + manifest `kind:core` + path-glob.

**Реестр deployments как source of truth.** Список 5 deployments жил только в хардкоде `orchestrate.mjs:14-20`, без репо-URL для trazano/mirage и без override'ов в формальном виде. Создан `inventory/deployments.md` — карточки на каждый deployment + TODO-валидация.

## Что создано / обновлено

- `orchestrator/improvements-2026-05-21.md` — план реализации, 7 пунктов **все DONE 2026-05-21**.
- `inventory/deployments.md` — реестр 5 active + 1 planned + canonical baseline; все repo-URL + ветки заполнены.
- `inventory/commit-baseline.md` — статистика 90д истории по 5 deployments (453 commits, 53% Conventional).
- `architecture/orchestrator-role.md` — добавлен раздел 7 (commit-miner), roadmap перенумерован.
- `architecture/decisions/0004-data-items-from.md` — ADR для items_from (3 источника, MVP limit, зарезервированы order/filter).
- `tests/php/Unit/DataLoaderItemsFromTest.php` — 7 unit-тестов на ADR-0004.
- `src/Service/DataLoaderService.php` — `injectItemsFrom()` + `scanCollectionSlugs()` + flatten-хелпер.
- `src/Action/PageAction.php:74-76` — интеграция items_from в pipeline.
- `tools/orchestrator/analyzers/commit-miner.mjs` — новый analyzer (core-hotfix / recurring-topic / convention-violation).
- `tools/orchestrator/analyzers/opportunity-tracker.mjs` — новый analyzer (маркеры `<!-- tracks: ... -->`).
- `tools/orchestrator/analyzers/divergence-audit.mjs` — расширен Intentional / Ready-to-sync.
- `tools/orchestrator/analyzers/data-flow-audit.mjs` — учёт `items_from` как валидного источника.
- `tools/orchestrator/orchestrate.mjs` — интеграция 2 новых analyzer'ов + render-секции.
- `sessions/2026-05-21-orchestrator-extension.md` — этот лог.

## Sibling-репо (за рамками baseline)

- **beepitron.com** — `distill sync` подтянул `DataLoaderService.php` + `PageAction.php`; `pages/categories.json :: categories-container` получил `items_from: "categories"`. Коммит в bitbucket — TODO пользователя.

## Закрытые вопросы

- ✅ ADR-0004 написан и реализован.
- ✅ Inventory pass для commit-miner собран.
- ✅ TODO в `deployments.md` закрыт: trazano/mirage repo URL зафиксированы; state.json у всех 5 присутствует; italy `RestaurantSeoBuilder.php` уже в overrides; Photoroom в kumho отсутствует физически — оставлен в TODO до появления файла.
- ✅ Все 7 шагов плана выполнены.

## Решения по процессу

В этой же сессии пользователь зафиксировал два правила (сохранены в memory): **(1)** session log создаётся без напоминаний для любой содержательной сессии, **(2)** структура документов — линейная и лаконичная, без многоуровневых приоритетов P1.1/P2.x и ASCII-графов. Изначальная версия `improvements-2026-05-21.md` была перегружена иерархией — переписана линейным списком.
