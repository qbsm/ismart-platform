# Границы Claude-сессий: baseline ↔ deployment

В проекте параллельно работают несколько Claude-сессий. Каждая имеет свой scope и не должна лезть в чужой репозиторий без явного разрешения пользователя.

## Роли

### Baseline-Claude (`ismart-platform`)

**Scope:** `~/Sites/ismart-platform/` — canonical baseline.

**Что делает:**
- ADR (`docs/architecture/decisions/`), baseline proposals (`docs/proposals/`)
- Ядро (`src/`, `config/{settings,container,middleware,routes}.php`, `templates/{components,base,page.twig}`)
- Tooling (`tools/{distill,orchestrator,build,migrate,scaffold,ops}/`)
- Conventions, guides, api docs, roles, inventory, orchestrator-отчёты
- Baseline-уровень session logs (`docs/sessions/` — только если работа касается ядра/инструментов)
- Анализ deployments через **read-only** (orchestrator analyzers читают `<deployment>/.git/`, `<deployment>/docs/proposals/` через aggregator)

**Что НЕ делает (без явного разрешения):**
- НЕ правит файлы в `<deployment>/` напрямую (`assets/`, `data/`, `templates/sections/`, `config/project.php`)
- НЕ запускает `git commit` / `git push` в `<deployment>/`
- НЕ делает `ssh root@…` для прямых правок production
- НЕ передёргивает `distill sync` сразу — сначала proposal/ADR, потом раскатка под контролем

**Может делать при явном «делай»/«раскатывай» от пользователя:** запускать `npm run distill:scan`, `distill sync --dry-run`, и собственно `distill sync` на siblings — но это **explicit action**, не default.

### Deployment-Claude (`<deployment>` — kumho/italy/beepitron)

**Scope:** `~/Sites/<deployment>/` — конкретный production deployment.

**Что делает:**
- Фиксы вёрстки/CSS/JS этого deployment'а
- Контент: `data/json/`, `data/img/`, `data/video/`
- Deployment-specific templates (`templates/sections/`, `templates/pages/<custom>.twig`)
- Локальные session logs (`<deployment>/docs/sessions/`)
- Deployment-инициированные proposals (`<deployment>/docs/proposals/`) — для cross-deployment паттернов, агрегируются baseline orchestrator'ом

**Что НЕ делает:**
- НЕ правит файлы в `~/Sites/ismart-platform/` напрямую
- НЕ делает `cd ../ismart-platform && git commit`
- НЕ создаёт ADR (только baseline пишет ADR)
- НЕ копирует/git checkout из baseline в свой deployment без `distill sync` — иначе работает в обход дистилляционной системы

**Может писать в baseline только через proposal:**
- Если паттерн затрагивает ядро → `<deployment>/docs/proposals/NNNN-*.md` (Status: Proposed)
- Baseline orchestrator увидит при следующем `npm run orchestrate` через `deployment-proposals` aggregator
- Решение принимается в baseline через ADR

## Поток коммуникации

```
[deployment Claude замечает паттерн] → <deployment>/docs/proposals/NNNN-X.md
                                       (Status: Proposed)
                                       └─ commit + push в свой deployment репо
                                       
[baseline Claude / npm run orchestrate] → aggregator видит proposal
                                          → если 2+ deployments на тему → cross-deployment baseline proposal
                                          → review → ADR
                                          → код в baseline → distill sync

[deployment Claude получает] → distill sync переписал нужные файлы
                              → deployment proposal помечается:
                                Status: Migrated to baseline ADR-NNNN
```

## Когда нарушения допустимы

Только при **явном** запросе пользователя:

- «делай в baseline» / «положи это в proposal ismart-platform» → baseline Claude разрешён правки
- «делай в kumho» / «исправь italy» → baseline Claude разрешён работать с deployment, но только в указанном
- «зайди на стейдж и посмотри» → baseline Claude разрешён ssh-read (без write)

Без таких сигналов — придерживаемся ролей.

## История нарушений (для понимания зачем правило)

- **2026-05-22..24** baseline Claude лазил в italy через `cp`, `git checkout`, прямые правки CSS. Каждый раз это работало, но создавало хаос — две сессии правят одни файлы, конфликты, неучтённые регрессии.
- **2026-05-24** deployment Claude (italy) дважды правил в `ismart-platform/` напрямую (CSS revert, distill.mjs sync). Зафиксировано пользователем; правило выработано.

## Связано

- [ADR-0008](../architecture/decisions/0008-multi-deployment-docs.md) — multi-deployment docs
- [ADR-0009](../architecture/decisions/0009-css-js-deployment-local.md) — assets deployment-local
- Memory: [`feedback-core-proposals-in-baseline`](https://github.com/qbsm/ismart-platform/) (применяется в каждой Claude-сессии)
