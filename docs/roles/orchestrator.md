# `ismart-platform` как оркестратор deployments

`ismart-platform` — не просто canonical baseline, из которого распространяются изменения. Он **активно анализирует** свои deployments и **предлагает** улучшения, оптимизации, унификации.

## Три роли baseline

```
┌─────────────────────────────────────────────────────────────────┐
│                       ismart-platform                            │
│                                                                  │
│  1. ИСТОЧНИК ПРАВДЫ                                              │
│     ▸ canonical CORE (src/, config/, templates/components/)      │
│     ▸ ADR'ы, conventions, документация архитектуры               │
│                                                                  │
│  2. ИНСТРУМЕНТАРИЙ                                               │
│     ▸ tools/distill   — diff / sync / inventory                  │
│     ▸ tools/scaffold  — create-{page,collection,deployment}      │
│     ▸ tools/build     — webpack, postcss, manifest               │
│     ▸ tools/ops       — генерация llms.txt, send-test-mail       │
│                                                                  │
│  3. ОРКЕСТРАТОР  ◀── ЭТА РОЛЬ                                    │
│     ▸ analyze divergence — что и почему дрейфует                 │
│     ▸ find duplicates    — что можно вынести в baseline          │
│     ▸ detect patterns    — legacy/anti-pattern в deployments     │
│     ▸ suggest opportunities — обобщать паттерны для абстракции   │
│     ▸ report periodicity — рекомендации с приоритетами            │
└─────────────────────────────────────────────────────────────────┘
```

## Зачем нужен оркестратор

Реальные эпизоды из сессии 2026-05-21 (beepitron content polishing) показали повторяющиеся проблемы которые **нужно ловить автоматически**:

| Симптом / "не работает" | Корневая причина | Сколько раз встретилось |
|---|---|---|
| «Не найдено» / «нет элементов» в секции | `pages/{id}.json :: section.data.items` пуст | 8 (news, categories, services, certificates, catalogs, products, video, management) |
| 404 на entity-страницах с числовым slug | route_map нужен, либо populate с правильным slug-источником | 3 (`/category/1`, `/product/1`, `/catalog/1`) |
| Сортировка отличается от prod | numeric vs string sort на entity-папках со slug='1','10','2' | 1 (management) |
| Стили не применяются | utility-class `.container-left` удалён по ошибке, использовался в news-slider | 1 |
| Cookie-panel не отрисовывается | section пропущена в pages, должна быть в `base.twig` | 1 |
| Картинки 404 на проде | `APP_BASE_URL` не override'нул `/public/` базу через SCRIPT_NAME | 1 |
| Form / `data/docs/` не залит | `--exclude-glob docs/` ловит любую docs/ папку, в т.ч. data/docs/ | 1 |
| nav active не подсвечен | `pages/X.json :: name` отстаёт от переименования | 1 |

Большинство этих проблем — **повторяющиеся паттерны**, которые оркестратор должен **детектировать заранее** и **подсказывать** при `npm run distill -- orchestrate` (или каком другом entry-point).

## Каталог analyzer'ов

Каждый analyzer — отдельный модуль в `tools/orchestrator/`. Возвращает структурированный JSON, который оркестратор склеивает в человекочитаемый report.

### 1. `divergence-audit.mjs`
Прогоняет `distill diff` по всем deployments и классифицирует каждый drift:
- `intentional` — намеренный override (в `.distill/state.json :: overrides`)
- `ready-to-sync` — улучшение CORE есть в baseline, deployment ждёт sync
- `outdated` — deployment-версия старше baseline ≥ N коммитов
- `divergent` — деплоймент имеет свою отдельную версию, не отслеживается

Output: матрица `файл × deployments` с категориями.

### 2. `pattern-detector.mjs`
Сканирует код deployments на anti-patterns / legacy:
- `legacy-naming` — `container narrow`, `container-left.offset` без BEM-scope override
- `numeric-id-as-slug` — entity файлы с именем `1.json`, `2.json`...
- `numeric-id-in-url` — references `/category/{numeric_id}` в twig
- `hardcoded-color` — `background: #183E68` (вместо `var(--color-X)`)
- `inline-style` — `<div style="...">` в twig
- `legacy-page-id` — `pageData.name` отстаёт от имени файла

### 3. `data-flow-audit.mjs`
Анализирует поток данных от entity-папок к secs:
- Список секций с `data.items: []` пустым **где есть** entity-папка совпадающая с именем секции (auto-fix candidate)
- Список pages с `top-level items[]` но без use в секциях
- Сортировки: для каждой коллекции — `declared order` vs `disk alphabetical` vs `numeric` — соответствует ли prod

### 4. `duplicate-detector.mjs`
Находит **близкие по содержанию** файлы в разных deployments:
- Twig-шаблоны с одинаковым skeleton, разными data-bindings (candidate в `templates/components/`)
- CSS правила повторяющиеся 3+ раз (candidate в `assets/css/base/utilities.css`)
- PHP-методы (через AST или regex) повторяющиеся в Action/Service слоях

### 5. `opportunity-tracker.mjs`
Поддерживает текстовый файл `docs/orchestrator/opportunities.md` с **открытыми** идеями для baseline-улучшений. Каждое open item имеет:
- описание паттерна
- сколько раз встретилось ($refs)
- предложенный план абстракции
- статус: `open / planned / wip / done`

Pre-populated на текущий момент (см. ниже).

### 6. `health-report.mjs`
Раз в N дней (cron'ом или manual) генерит summary `docs/orchestrator/health-{date}.md`:
- HEAD каждого deployment
- last-sync с baseline
- # drifted файлов
- # open opportunities
- # detected anti-patterns
- TOP 3 рекомендации с конкретными командами

### 7. `commit-miner.mjs`

**Идея:** оркестратор не должен ограничиваться финальным state'ом файлов. **Каждый коммит** в deployments — кандидат на распознавание паттерна или улучшения для baseline. Финальный sha256-diff скрывает интент изменений; история коммитов сохраняет его в commit message + diff.

Что mining делает на каждом deployment'е (incremental — с `state.json :: platform_commit` или с явного `--since`):

| Класс коммита | Признак | Action |
|---|---|---|
| **CORE-hotfix** | `git diff` коммита затрагивает файл, помеченный `kind: core` в manifest'е, тип коммита `fix:` | candidate в baseline через `distill propose`. Скорее всего тот же баг есть и в других deployments |
| **CORE-refactor** | CORE-файл + `refactor:` | review с автором; если универсально — propose, иначе override с reason |
| **Reusable feature** | DEPLOYMENT-файл, но имя generic (`*Service.php`, `templates/components/*.twig`), `feat:` | candidate на extract в `templates/components/` или `src/Support/` |
| **Recurring topic** | одинаковая тема в commit message в 2+ deployments за последний период (`fix: cookie panel`, `fix: csrf token`) | сильный сигнал на baseline-фикс. Записать как opportunity |
| **Drift origin** | для каждого drift-файла из `divergence-audit` — `git log --follow` находит **первый коммит** где deployment разошёлся с baseline | даёт reason для `mark-override` или `propose` |
| **Convention violation** | commit message не Conventional Commits (`update`, `wip`, `.`) | пометка в health-report для команды |

Output: `commits-{date}.json` + раздел в health-report с TOP candidates на propose/extract.

**Зачем именно поком­митно:**

- Финальный state «sha256 разошёлся» не показывает **почему**. Коммит-сообщение «fix: cookie-panel disappears after pages refactor» сразу маршрутизирует баг к opportunity #7.
- Один и тот же фикс в 2+ deployments за одну неделю — сильнейший сигнал что в baseline дыра (см. реальный эпизод 2026-05-21: `BaseUrlResolver` `APP_BASE_URL` priority — сначала фикснули в kumho, через пару дней в beepitron — orchestrator должен был поймать **после первого** и предложить вынести).
- Conventional Commits превращает истории в **структурированный feed** для analyzer'а без LLM.

**Сложности:**

- Требуется read-access ко всем sibling-репо (уже есть в orchestrate.mjs через `existsSync(d.path)`).
- `git log`/`git show` на больших историях — кэшировать в `.distill/state.json :: commit_cache_until`.
- Маппинг файлов deployment'а на CORE-категорию — через `manifest.json :: kind`.

## Существующие opportunities (extracted из сессии 2026-05-21)

Эти **точно** просятся в baseline на следующей итерации:

### `data.items_from` cross-page injection

Вместо `populate-bp-v4.py` (deployment-side runtime скрипт) — расширить baseline `DataLoaderService` или `PageAction`:

```json
{"name": "news-slider", "data": {"items_from": "news", "limit": 5}}
{"name": "categories", "data": {"items_from": "categories"}}
{"name": "management", "data": {"items_from": "management"}}
```

DataLoader при загрузке страницы видит `items_from` и подсасывает entity'и. Это убирает необходимость дублировать items в каждой странице через runtime скрипт.

Встретилось в: **beepitron** (главная, /about, /catalogs, /certificates, /docs, /services, /video).

### Numeric-aware sort

`DataLoaderService::loadEntitySlugs()` + scaffold должны сортировать entity-файлы со slug-числами **численно**. Также применимо для `id` поля при сортировке items.

Встретилось в: **beepitron** (management, catalogs, certificates).

### `data.declared_order`

Если `pages/{list}.json :: items[]` содержит порядок, и секция авто-инжектит items коллекции — порядок должен **следовать** этому массиву (не alphabetical).

Встретилось в: **beepitron** (categories на главной должны идти как на prod, не в порядке disk).

### Items inline (не slug'и) — третий тип источника

Кроме slug-источника (loadEntity) и declared-list — нужно поддерживать **inline-массив объектов** на top-level pages, не вызывать entity-loader.

Встретилось в: **beepitron `/video`** (нет entity-папки, items уже plain в pages/video.json).

### Legacy URL redirects через scaffold

При rename collection / entity-папки scaffold должен **автоматически** генерировать redirects в config/redirects.json (legacy URL → новый slug).

Встретилось в: **beepitron** (`/certificates → /docs`, `/category/{num} → /category/{slug}`).

### `BaseUrlResolver` priority order

`APP_BASE_URL` из env должен иметь **abs приоритет** над `SCRIPT_NAME`-derived calculation. Включая обнуление `/public` префикса как fallback. *(Уже в baseline `ec39376`.)*

### `slugs_page` для collection

Slug-источник может быть в **отдельной** странице, не в `pages/{nav_slug}.json`. *(Уже в baseline `08fa612`.)*

### `injectListItems` во ВСЕ секции

Если на list-page есть `data.items: []` секция (включая `hero` для tag-counts) — инжектить items, не только в секцию с `name === nav_slug`. *(Уже в baseline `33c0f1c`.)*

### Entity-page загружает sections из list-page

При entity-load `pageData['sections']` должен быть **унаследован** от list-page (не overwritten пустым массивом). *(Уже в baseline `69c9621`.)*

### Cookie-panel глобально в `base.twig`

Не в page-section, а одной строкой include в base.twig перед `</body>`. Видимость через JS (cookie-set check).

Встретилось в: **beepitron** (cookie-panel пропадал после refactor pages).

## Workflow оркестратора

```bash
# Раз в неделю или после крупных изменений в deployment
cd ~/Sites/ismart-platform
npm run orchestrate

# Что произойдёт:
# 1. distill scan        — обновить manifest baseline'а
# 2. divergence-audit    — пройти по всем 5 deployments, классифицировать drift
# 3. pattern-detector    — найти anti-patterns
# 4. data-flow-audit     — секции с пустыми items, неотсортированные коллекции
# 5. opportunity-tracker — обновить opportunities.md с новыми наблюдениями
# 6. health-report       — сгенерить docs/orchestrator/health-{date}.md

# Output: docs/orchestrator/health-2026-05-21.md с приоритизированными рекомендациями
# Например:
#   [P1] beepitron: 3 секции с empty data.items где есть entity-папка
#        → fix через runtime populate ИЛИ extract в baseline `data.items_from`
#   [P2] kumho/italy/trazano: drift в src/Service/MailService.php (sync с 33c0f1c)
#   [P3] beepitron, italy: legacy class `.container-left.offset` в 2 шаблонах
```

## Что НЕ должен делать оркестратор

- **Авто-фиксить** код — только обнаруживать и рекомендовать. Решение принимает человек.
- **Прерывать deploy** — это инструмент анализа, не CI-gate (хотя интеграция с CI возможна).
- **Дублировать distill** — distill отвечает за `scan/diff/sync`. Orchestrator живёт уровнем выше — над несколькими deployments одновременно, классифицирует и интерпретирует.

## Roadmap

| Этап | Что |
|---|---|
| **MVP (P1)** | `divergence-audit.mjs` + `data-flow-audit.mjs` + первый `health-report` |
| P2 | `pattern-detector.mjs` (legacy-naming, numeric-id, hardcoded colors) |
| P3 | `commit-miner.mjs` — incremental analysis истории deployments |
| P4 | `duplicate-detector.mjs` — сложнее, требует AST |
| P5 | Интеграция с GitHub Issues / Linear — каждое open opportunity = ticket |
| P6 | CI-mode: `npm run orchestrate -- --strict` exit-code 1 если новые P1-issues |
