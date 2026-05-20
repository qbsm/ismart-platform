# Дистилляция iSmart Platform

Документ описывает, как из трёх production deployment'ов (`kumho-tires.ru`, `italycommunity.ru`, `beepitron` / `beepitron.com`) выделяется тиражируемая платформа `ismart-platform`, и как поддерживается её консистентность во времени.

---

## 1. Контекст

**iSmart Platform** — content-agnostic веб-платформа на стеке Slim 4 + Twig 3 + Webpack 5 + PostCSS. Контент задаётся JSON-ом, конфиг deployment'а — одним файлом `config/project.php`. Ядро (`src/`) не знает о бизнес-предметке.

Сейчас платформа существует в трёх копиях:

| Deployment | Репо | Бизнес | Ветка | Объём |
|---|---|---|---|---|
| `kumho-tires.ru` | `github:qbsm/kumho-tires.ru` | шины (Kumho) | `feat/dealer-brand-logo` | 509 MB |
| `italycommunity.ru` | `github:qbsm/italy-platform` | сеть ресторанов | `refactor/backend-slim-events` | 865 MB |
| `beepitron` (beepitron.com) | `bitbucket:ismart-team/bp` | электротехника | `main` | 3.7 GB |

И **отдельно** живёт репо `ismart-platform` (`github:qbsm/ismart-platform.git`), который сейчас содержит **legacy архитектуру предыдущей итерации** (свой DI/Router в `core/`, `index.php` в корне, один коммит `b37b001 Initial commit`). К новой slim-twig архитектуре этот baseline отношения не имеет.

### Проблема

1. **Нет canonical source.** Любое улучшение ядра делается в одном deployment'е, а в два других попадает копипастой (или не попадает — drift).
2. **Drift накапливается.** Сегодняшний срез: 4/5 классов `src/Action` идентичны, middleware совпадает 100%, но `SeoService` разъехался (kumho inline vs italy/beepitron Strategy), `tools/scaffold` отсутствует в beepitron, тесты в beepitron сведены к одному smoke.
3. **Заводить нового заказчика дорого.** Без canonical baseline новый deployment делается копированием существующего проекта с последующей вычисткой бизнес-специфики.

### Удачное окно

В мае 2026 все три ветки впервые синхронизированы по критичным фиксам (CSP `font-src` + `data:`, `X-Robots-Tag` middleware для staging, `csrf_token` в `TemplateDataBuilder`, `createUnsafeImmutable` для `getenv()`, item_key обёртка в `buildSeoForEntity`). Это редкий момент консистентности — следует им воспользоваться для дистилляции, пока триада не разъехалась снова.

---

## 2. Цель

Привести `ismart-platform` в состояние **canonical baseline**, из которого:

- Новые deployment'ы создаются одной командой (`npx create-ismart-deployment <slug>` или `tools/scaffold/create-deployment.js`).
- Изменения в ядре синхронизируются в существующие deployment'ы через CLI с phase'ом review.
- Уникальные для deployment'а правки помечаются явным override'ом в локальном manifest'е.

**Не цель:** monorepo. Каждый deployment остаётся самостоятельным git-репо. Платформа — это **источник правды**, не runtime-зависимость.

---

## 3. Стратегия: шаблон + sync-CLI

Рассмотрены четыре варианта:

| Вариант | Плюсы | Минусы | Решение |
|---|---|---|---|
| **A. Composer-пакет** | semver, dependency tracking, чистая граница | Тяжёлый refactor (namespace PSR-4, package boundary), сложно override'ить файлы платформы, теряется easy-access к baseline-коду | **Отвергнут** — слишком радикально, текущий workflow ломается |
| **B. Git subtree / submodule** | Подтягивание apdate'ов через git | submodule'ы хрупкие; override базовых файлов требует костылей | **Отвергнут** |
| **C. Шаблон + sync-CLI** | Гибко, эволюционируемо, текущий dev-flow не меняется, CLI постепенно усложняется | Больше manual coordination, нет compile-time гарантий | **Выбран** |
| **D. Monorepo** | Атомарные кросс-проектные изменения, общий CI | Отказ от существующих репозиториев и их истории, разные deploy-pipeline | **Отвергнут** — слишком разрушительно |

### Как работает выбранный вариант

1. **`ismart-platform`** — canonical baseline. Содержит дистиллированное ядро (CORE), шаблоны конфигов (TEMPLATE), и инструменты (`tools/distill/`).
2. **Каждый deployment** — отдельный репо со своим контентом и `config/project.php`. В корне deployment'а лежит `.distill/state.json` — локальный snapshot того, что и когда было синхронизировано с baseline'ом.
3. **CLI `distill`** в baseline-репо:
   - `distill scan` — собирает manifest всех файлов baseline'а с их sha256.
   - `distill diff <deployment-path>` — сравнивает manifest baseline'а с deployment'ом, классифицирует каждый файл.
   - `distill sync <deployment-path>` — обновляет CORE-файлы в deployment'е до версий baseline'а (с интерактивным подтверждением каждой группы).
   - `distill propose <deployment-path> <file>` — предлагает изменение из deployment'а в baseline (создаёт patch и git-branch).
   - `distill init <slug>` — создаёт новый deployment из baseline'а.

---

## 4. Архитектура baseline

### CORE — синхронизируется во все deployment'ы, drift = bug

```
src/Action/
  PageAction.php
  HealthAction.php
  SitemapAction.php
  ApiSendAction.php

src/Service/
  DataLoaderService.php
  LanguageService.php
  MailService.php
  TemplateDataBuilder.php
  SeoService.php             # к Strategy pattern (см. §8)

src/Middleware/                # 100% идентичны во всех 3, эталон
  SecurityHeadersMiddleware.php
  CorrelationIdMiddleware.php
  CorsMiddleware.php
  LanguageMiddleware.php
  RateLimitMiddleware.php
  RedirectMiddleware.php
  RequestDurationMiddleware.php
  TrailingSlashMiddleware.php

src/Handler/
  HttpErrorHandler.php
  ServerErrorHandler.php

src/Event/                     # PSR-14 league/event
  EntityResolvedEvent.php
  PageLoadedEvent.php
  SeoBuiltEvent.php

src/Twig/
  AssetExtension.php
  UrlExtension.php
  DataExtension.php

config/
  container.php
  settings.php
  middleware.php
  errors.php
  routes.php

tools/scaffold/
  create-page.js
  create-collection.js
  create-section.js
  create-component.js
  create-deployment.js
  utils.js

tools/build/
  css-hash.js
  clean-assets.js
  setup-public-links.js
  setup-public-copy.js
  build-critical.js
  build-images.js
  check-env-build.js

tools/ops/
  init-env.js
  validate-json.js
  generate-llms-full.php
  generate-favicons.js
  fix-permissions.sh

tools/distill/                 # сам инструмент distill
  distill.mjs
  manifest-builder.mjs
  README.md

templates/errors/              # 404, 500 — generic, без бренда
public/.htaccess

composer.json                  # зависимости + autoload + scripts
package.json                   # зависимости + scripts (build/lint/test/scaffold)
webpack.config.js
postcss.config.js
eslint.config.js
stylelint.config.mjs
vitest.config.js
phpunit.xml
.gitignore                     # /vendor/ с leading slash (см. §8)
```

### TEMPLATE — schema общая, контент уникален

```
templates/base.twig             # generic-skeleton
templates/components/           # атомные компоненты (form-callback, button-section, ...)
templates/sections/             # переиспользуемые секции (intro, contacts, ...)
config/project.php.dist         # шаблон с placeholder'ами
data/json/global.json.dist      # schema без значений
data/json/{lang}/pages/         # папочная структура
data/json/{lang}/seo/
```

### DEPLOYMENT-SPECIFIC — живёт только в deployment'е

```
config/project.php             # реальный конфиг (от .dist)
data/json/{lang}/**            # контент бренда
data/json/{lang}/<collection>/ # бизнес-сущности (tires/, restaurants/, products/, ...)
assets/css/                    # стили бренда (с использованием base/ из baseline)
assets/js/sections/            # JS-секции бренда
templates/pages/               # страницы бренда (кроме базовых из baseline)
data/img/                      # медиа
public/data -> ../data/img     # symlink
.env
deployments/<slug>/            # nginx, docker-compose, scripts
```

---

## 5. File-level tracking

### Manifest платформы (`ismart-platform/.distill/manifest.json`)

Создаётся `distill scan`. Слепок текущего состояния baseline'а:

```json
{
  "$schema": "https://ismart.pro/schemas/distill-manifest-v1.json",
  "platform_version": "1.0.0",
  "generated_at": "2026-05-20T00:00:00Z",
  "generated_from_commit": "abc123...",
  "files": {
    "src/Middleware/SecurityHeadersMiddleware.php": {
      "kind": "core",
      "sha256": "ab12...ef",
      "size": 2415,
      "sync_policy": "strict"
    },
    "config/project.php.dist": {
      "kind": "template",
      "sha256": "...",
      "sync_policy": "template-only"
    },
    "data/json/global.json.dist": {
      "kind": "template",
      "sha256": "...",
      "sync_policy": "schema-only"
    },
    "templates/pages/index.twig": {
      "kind": "example",
      "sha256": "...",
      "sync_policy": "ignore-after-init"
    }
  }
}
```

**Поля файла:**

- `kind` — `core` | `template` | `example`
- `sha256` — хеш содержимого
- `size` — байты (для скорости diff'а)
- `sync_policy`:
  - `strict` — должен быть бит-в-бит. Drift = bug.
  - `template-only` — синкается при init нового deployment'а, потом игнорируется.
  - `schema-only` — синкается только schema/структура (для JSON — топ-левел ключи).
  - `ignore-after-init` — копируется при init, далее не трогается.

### State deployment'а (`<deployment>/.distill/state.json`)

```json
{
  "$schema": "https://ismart.pro/schemas/distill-state-v1.json",
  "platform_version": "1.0.0",
  "platform_commit": "abc123...",
  "last_sync": "2026-05-20T00:00:00Z",
  "overrides": {
    "src/Action/PageAction.php": {
      "reason": "PhotoroomRemoveBackgroundAction-интеграция вынесена сюда временно",
      "accepted_drift": true,
      "last_review": "2026-05-20"
    }
  },
  "drift": {
    "src/Service/SeoService.php": {
      "platform_sha256": "...",
      "deployment_sha256": "...",
      "first_seen": "2026-05-20",
      "status": "unreviewed"
    }
  }
}
```

**`overrides`** — добровольное расхождение, deployment-specific. CLI его не предлагает sync'ить.

**`drift`** — фактическое расхождение, не объяснённое override'ом. CLI флагает на каждой запуске.

### Drift категории

| Категория | Что значит | Действие CLI |
|---|---|---|
| `identical` | файл совпадает sha256 | ничего, OK |
| `drift-unreviewed` | hash расходится, нет override'а | warn, предложить review |
| `drift-accepted` | hash расходится, есть override с reason | напомнить раз в N дней |
| `unique-to-deployment` | файла нет в baseline | предложить `propose` если выглядит универсальным |
| `unique-to-baseline` | файла нет в deployment'е (для CORE) | предложить `sync` |
| `missing` | файл удалён в deployment'е, есть в baseline (для CORE) | warn |

---

## 6. CLI `distill`

Реализован как Node.js ESM-модуль в `tools/distill/distill.mjs`. Зависимости — только встроенные `fs`/`path`/`crypto`. Запуск:

```bash
# из ismart-platform/
node tools/distill/distill.mjs <command> [args]

# или через npm script (рекомендуется)
npm run distill -- <command> [args]
```

### Команды (целевой набор)

```bash
# Построить manifest baseline'а
distill scan

# Сравнить baseline vs deployment
distill diff ../kumho-tires.ru
distill diff ../italycommunity.ru
distill diff ../beepitron

# Один общий обзор всех deployment'ов
distill status

# Синхронизировать CORE-файлы из baseline в deployment (с подтверждением)
distill sync ../kumho-tires.ru
distill sync ../kumho-tires.ru --dry-run
distill sync ../kumho-tires.ru --only=src/Middleware/

# Предложить файл из deployment'а в baseline (создаёт patch)
distill propose ../kumho-tires.ru src/Middleware/SecurityHeadersMiddleware.php

# Пометить файл как deployment-specific override
distill mark-override ../kumho-tires.ru src/Action/PhotoroomAction.php "Photoroom integration, kumho-only"

# Создать новый deployment
distill init <slug> --name "Ритейл Логистик" --domain retail-logistik.ru
```

### Прототип (этап 1)

В первом MVP реализованы:

- `distill scan` — построить manifest платформы
- `distill diff <deployment>` — pure-readonly сравнение, отчёт в stdout

Полноценный `sync`/`propose`/`init` — этап 2 после accept стратегии.

---

## 7. Roadmap миграции

### Этап 0 — Документ + CLI прототип (СЕЙЧАС)

- [x] Разведка состояния трёх deployment'ов
- [x] `docs/architecture/distillation.md` (этот документ)
- [x] Manifest-схема
- [x] `tools/distill/distill.mjs` прототип (`scan`, `diff`)

### Этап 1 — Перенос CORE в `ismart-platform`

Базовый источник — `kumho-tires.ru` (наиболее свежие фиксы, полный набор `tools/scaffold`, тесты). Шаги:

1. Удалить legacy: `core/`, `index.php` в корне, всё что относится к старой архитектуре. Сохранить в отдельный tag `legacy-archive-v0` на случай возврата.
2. Скопировать из kumho:
   - `src/` (Action кроме `Photoroom*`, Service, Middleware, Handler, Event, Twig, Support)
   - `config/` (без `project.php`)
   - `tools/scaffold/`, `tools/build/`, `tools/ops/`
   - `public/index.php`, `public/.htaccess`
   - `composer.json`, `package.json`, `webpack.config.js`, `postcss.config.js`, `eslint.config.js`, `stylelint.config.mjs`, `vitest.config.js`, `phpunit.xml`
   - `tests/php/Unit/`, `tests/js/`
   - `templates/errors/`, `templates/base.twig`, generic `templates/components/`
3. Превратить deployment-specifics в `.dist`-шаблоны:
   - `config/project.php` → `config/project.php.dist` с TODO-placeholder'ами
   - `data/json/global.json` → `data/json/global.json.dist` с минимальной schema
4. Прогнать `distill scan` — построить manifest.
5. Прогнать `distill diff` против всех трёх deployment'ов — увидеть стартовую картину drift.

### Этап 2 — Маркировка override'ов

Каждый deployment получает `.distill/state.json`:

- **kumho:** `src/Action/PhotoroomRemoveBackgroundAction.php` → override (Photoroom-интеграция, kumho-only).
- **italy:** `src/Service/RestaurantSeoBuilder.php` → override (после унификации SeoService).
- **beepitron:** массовый drift, см. §8.

### Этап 3 — Унификация sub-strategy

См. §8 — открытые вопросы (`SeoService` Strategy, scaffold/tests в beepitron).

### Этап 4 — Регулярный sync

Раз в спринт или перед релизом: `distill status` показывает дашборд drift'а по всем deployment'ам, drift со `status: unreviewed` разбирается вручную.

### Этап 5 — Новый deployment

Заказчик "Ритейл Логистик" (упомянут в `kumho/CLAUDE.md`) делается через `distill init retail-logistik`. Если процесс работает гладко — этап 5 валидирует всю архитектуру.

---

## 8. Открытые вопросы

### SeoService: inline vs Strategy

- **kumho:** inline-реализация в `SeoService`.
- **italy/beepitron:** `SeoBuilderInterface` + `SeoBuilderRegistry` + per-collection builder'ы.

**Предложение:** взять italy/beepitron вариант в baseline (расширяемость лучше), kumho мигрировать в `distill sync`. Generic `DefaultSeoBuilder` — fallback в baseline'е. Перед миграцией — review с автором паттерна.

### beepitron drift

- **tools/scaffold отсутствует** — добавить `distill sync` после переноса в baseline.
- **tests редуцированы** — добавить.
- **routes.php разрос до 2.4 KB** — изучить, не пора ли разнести на несколько routes-файлов.

### `.gitignore` `vendor/` без leading slash

Во всех трёх проектах паттерн `vendor/` (без `/`) — матчит и composer-`vendor/`, и `assets/js/vendor/`, и `assets/css/vendor/`. Это **системный баг**, обнаруженный в дискуссии 2026-05. В baseline `ismart-platform/.gitignore` должно быть `/vendor/` (leading slash) — якорь к корню репо.

### Где хранить manifest платформы и state deployment'а

- Manifest платформы: `ismart-platform/.distill/manifest.json` — **в git**, обновляется через `distill scan` (можно автоматизировать через `prepare-commit-msg` hook или CI).
- State deployment'а: `<deployment>/.distill/state.json` — **в git** каждого deployment'а. Содержит явные override'ы (стабильно) и drift-snapshot (динамично) — последнее обновляется CLI, нужно явно коммитить, чтобы команда видела.

### Авторизация и push в deployment'ы

CLI делает локальные правки, коммитит **в текущей ветке** deployment'а. Push — **не делает автоматически**, оставляет на пользователя (review + push вручную, либо PR).

---

## 9. Поддержка совместимости

Платформа эволюционирует независимо от deployment'ов. Совместимость поддерживается через `platform_version` (semver):

- **MAJOR** — breaking change в CORE (например, переименование класса, изменение сигнатуры интерфейса). Deployment'ы должны мигрировать вручную.
- **MINOR** — добавление функциональности backward-compatible. `distill sync` применяет без issues.
- **PATCH** — bugfix. Всегда `distill sync` без issues.

В каждом deployment'е `state.json:platform_version` — версия baseline'а, на которую deployment ориентируется. Расхождение MAJOR-версий — CLI warning.

---

## 10. Открытое управление

- Этот документ живёт в `ismart-platform/docs/architecture/distillation.md` — он же `single source of truth`.
- PR в baseline ревьюится владельцем платформы (или утверждённой группой).
- Decision log по архитектурным вопросам — `docs/architecture/decisions/NNNN-*.md` (ADR-формат).
