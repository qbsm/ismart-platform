# DEPLOYMENTS INVENTORY — реестр проектов для оркестратора

Канонический список deployment'ов, по которым `npm run orchestrate` ведёт анализ (`data-flow-audit`, `divergence-audit`, `pattern-detector`, будущий `commit-miner` — см. [`../architecture/orchestrator-role.md`](../architecture/orchestrator-role.md)).

**Этот файл — source of truth.** Захардкоженный список в [`tools/orchestrator/orchestrate.mjs:14-20`](../../tools/orchestrator/orchestrate.mjs) должен в будущем читать отсюда (см. P3.3 в [`../orchestrator/improvements-2026-05-21.md`](../orchestrator/improvements-2026-05-21.md)).

## Условные обозначения

| Поле | Значения |
|---|---|
| `Status` | `active` (анализируем) · `paused` (временно исключён) · `archived` (история, не анализируем) · `planned` (будущий) |
| `Role` | `primary` (источник дистилляции, обновлений в baseline) · `secondary` (поглотитель sync'а) · `canonical` (сам baseline) |
| `Content type` | бизнес-домен deployment'а (tire-deployment / restaurants / e-commerce / ...) |
| `Distill state` | наличие `.distill/state.json` (для `divergence-audit` overrides и `commit-miner` incremental) |

---

## Активные deployments (5)

| Slug | Repo | Default branch | Content type | Size | Role | Distill state | Status |
|---|---|---|---|---|---|---|---|
| `kumho-tires.ru` | `github:qbsm/kumho-tires.ru` | `feat/dealer-brand-logo` | tire-deployment (Kumho) | 509 MB | secondary | present | active |
| `italycommunity.ru` | `github:qbsm/italy-platform` | `sync/baseline-2026-05-20` | restaurants network | 865 MB | secondary | present | active |
| `beepitron.com` | `bitbucket:ismart-team/bp` | `sync/baseline-2026-05-20` | electrical components | 3.7 GB | secondary | present | active |
| `trazano-tires.ru-v2` | `github:qbsm/trazano-tires.ru` | `feat/migrate-to-ismart-platform` | tire-deployment (Trazano) | 241 MB | secondary | present | active |
| `mirage-russia.ru-v2` | `github:qbsm/mirage-russia.ru` | `feat/migrate-to-ismart-platform` | tire-deployment (Mirage) | 263 MB | secondary | present | active |

## Canonical baseline

| Slug | Repo | Branch | Размер | Role |
|---|---|---|---|---|
| `ismart-platform` | `github:qbsm/ismart-platform` | `distill/initial-baseline` | — | **canonical** (этот репо) |

## Запланированные (planned)

| Slug | Контекст | Когда | Источник упоминания |
|---|---|---|---|
| `retail-logistik` | Заказчик «Ритейл Логистик» — валидирует pipeline `distill init` | этап 5 distillation roadmap | [distillation.md §7](../architecture/distillation.md) |

## Архивные

Пусто. (При архивировании deployment'а — переносить сюда строку с пометкой даты + причины.)

---

## Детальные карточки

### kumho-tires.ru

- **Бизнес.** Каталог шин бренда Kumho — главный e-commerce-стиль deployment.
- **Репо.** `github:qbsm/kumho-tires.ru`, ветка `feat/dealer-brand-logo`.
- **Размер.** 509 MB.
- **Особенности для оркестратора.**
  - Интеграция Photoroom (`src/Action/PhotoroomRemoveBackgroundAction.php`) — **kumho-only**, фиксируется override'ом в `.distill/state.json`. См. [ADR-0002](../architecture/decisions/0002-photoroom-out-of-baseline.md).
  - `SeoService` исторически inline (kumho-вариант) — мигрируется к Strategy через [ADR-0003](../architecture/decisions/0003-seo-builder-strategy.md).
  - Полный набор `tools/scaffold` — kumho был источником дистилляции baseline'а 2026-05-20.
- **Текущий drift (health-2026-05-21):** 28 drifted, 34 missing, 1208 unique.
- **Открытые рекомендации.** 7 `inline-color-hex` в CSS, 8 `inline-style` в Twig.

### italycommunity.ru

- **Бизнес.** Сеть итальянских ресторанов / community-портал.
- **Репо.** `github:qbsm/italy-platform`, ветка `refactor/backend-slim-events`.
- **Размер.** 865 MB.
- **Особенности для оркестратора.**
  - Per-collection `SeoBuilder` (`RestaurantSeoBuilder.php`) — **прообраз** Strategy pattern, который принят в baseline ADR-0003. Override до завершения миграции kumho.
  - Коллекция `restaurants/` уникальна.
- **Текущий drift:** 92 drifted, 92 missing, 85 unique — самый зашумлённый. После учёта override'ов (P2.2 в roadmap) ожидаемо упадёт.
- **Открытые рекомендации.** 2 `inline-color-hex`, 6 `inline-style`.

### beepitron.com

- **Бизнес.** Каталог электротехнических компонентов (фотоника, жгуты, НАСК).
- **Репо.** `bitbucket:ismart-team/bp`, ветка `main`. **Единственный** не на GitHub.
- **Размер.** 3.7 GB — самый крупный, риск для git-walking analyzer'ов (`commit-miner`).
- **Особенности для оркестратора.**
  - **Источник** большинства open opportunities (#1–#7) — был полигоном distillation 2026-05-21.
  - Runtime-скрипт `populate-bp-multilang.py` — обходит ядро, **удаляется** после реализации P1.1 `data.items_from` в baseline.
  - Множество numeric-id slug'ов (`management/1.json`, `categories/2.json`) — кандидаты на rename.
  - `routes.php` 2.4 KB — необычно разрос, требует review.
- **Текущий drift:** 61 drifted, 214 missing, 308 unique.
- **Открытые рекомендации.** 8 data-flow findings (пустые секции с entity-папкой), 4 паттерна.

### trazano-tires.ru-v2

- **Бизнес.** Каталог шин бренда Trazano.
- **Репо.** `github:qbsm/trazano-tires.ru`, ветка `feat/migrate-to-ismart-platform`.
- **Размер.** 241 MB.
- **Особенности.** «v2» в slug'е — намёк на миграцию со старой кодовой базы. Структурно близок к kumho (tire-deployment), кандидат на `distill init --from ../kumho-tires.ru` (см. open opportunity в `improvements.md`).
- **Текущий drift:** 16 drifted, 5 missing, 50 unique — близко к kumho-baseline (chemistry уже хорошая).
- **Открытые рекомендации.** 7 `inline-color-hex`, 11 `inline-style`.

### mirage-russia.ru-v2

- **Бизнес.** Каталог шин бренда Mirage.
- **Репо.** `github:qbsm/mirage-russia.ru`, ветка `feat/migrate-to-ismart-platform`.
- **Размер.** 263 MB.
- **Особенности.** «v2» аналогично trazano. Структурно близок к kumho.
- **Текущий drift:** 16 drifted, 5 missing, 46 unique.
- **Открытые рекомендации.** 7 `inline-color-hex`, 12 `inline-style` — самый «грязный» по pattern-detector.

---

## Критерии: что значит «вести анализ»

Для каждого active deployment оркестратор должен уметь:

1. **Прочитать файлы.** `existsSync(path)` + рекурсивный walk (`data-flow-audit`, `pattern-detector`).
2. **Сделать `distill diff`.** Нужен manifest baseline'а (есть) + access к deployment'у (есть, sibling).
3. **Прочитать `.distill/state.json`.** Для overrides classification (P2.2) — требует чтобы файл существовал. **Сейчас не у всех есть, см. TODO выше.**
4. **Прочитать git log.** Для `commit-miner` (P1.3) — `git log` в директории deployment'а. Не требует ssh-доступа к origin.

**Не требуется** оркестратору:

- Push в репозитории deployment'ов (CLI делает локальные правки в текущей ветке, push — вручную).
- Доступ к production-серверам.
- Доступ к private composer/npm registries (анализ оффлайн).

---

## TODO (валидация реестра)

- [x] ~~**trazano-tires.ru-v2** — зафиксировать repo URL и default branch.~~ (2026-05-21)
- [x] ~~**mirage-russia.ru-v2** — зафиксировать repo URL и default branch.~~ (2026-05-21)
- [x] ~~Во **всех 5** deployments — убедиться что есть `.distill/state.json`.~~ (все 5 present, 2026-05-21)
- [x] ~~**italycommunity.ru** — внести `RestaurantSeoBuilder.php` в `state.json :: overrides`.~~ (уже в `overrides` с 2026-05-20)
- [ ] **kumho-tires.ru** — внести `PhotoroomRemoveBackgroundAction.php` в `overrides` **после** появления файла в репо (ADR-0002 описывает план; на 2026-05-21 файла нет ни в одном sibling). Без файла override бесмыслен.
- [x] ~~**beepitron.com** — после реализации items_from удалить `populate-bp-multilang.py`.~~ (скрипта в репо нет; categories-container перешёл на `items_from` 2026-05-21)

## TODO (рефакторинг кода)

- [ ] **P3.3** (roadmap): `tools/orchestrator/orchestrate.mjs` хардкодит `DEPLOYMENTS` массивом. Заменить на чтение этого файла (или JSON-зеркала `tools/orchestrator/deployments.json`). Кандидат на frontmatter-формат или отдельную секцию `<!-- machine-readable: ... -->`.

---

## История

| Дата | Изменение |
|---|---|
| 2026-05-21 | Файл создан. 5 active deployments из orchestrate.mjs, 1 planned (retail-logistik из distillation.md). |
| 2026-05-21 | Зафиксированы repo URL + ветки для trazano (`github:qbsm/trazano-tires.ru`) и mirage (`github:qbsm/mirage-russia.ru`); обновлены актуальные ветки italy/beepitron (`sync/baseline-2026-05-20`); все 5 deployments имеют `.distill/state.json`. TODO про italy RestaurantSeoBuilder закрыт (уже в overrides), про beepitron populate-скрипт — скрипт не найден в репо. |
