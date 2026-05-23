# docs — документация iSmart Platform

Документация платформы разделена на два уровня (ADR-0008):

1. **Baseline (`ismart-platform/docs/`)** — canonical: ADR, baseline proposals, architecture, conventions.
2. **Deployment (`<deployment>/docs/`)** — каждый kumho/italy/beepitron/… имеет свой набор session logs и proposals.

См. [ADR-0008](architecture/decisions/0008-multi-deployment-docs.md) — обоснование структуры и flow.

## Структура baseline (этого репо)

```
docs/
  architecture/                # эталонная архитектура (статика)
    decisions/                 # ADR — финальные архитектурные решения, единый ряд
      NNNN-*.md
    distillation.md            # стратегия дистилляции
    platform-reference.md      # эталонная архитектура (Slim 4 + Twig + JSON-контент)
    structure.md, config.md, images.md, ...

  proposals/                   # baseline proposals (cross-deployment темы)
    NNNN-*.md                  # статусы: Proposed | Migrated to ADR-NNNN | Rejected | Superseded

  sessions/                    # baseline-уровень сессии (ядро, инструменты, общие фиксы)
    YYYY-MM-DD-<topic>.md

  conventions/                 # как пишем код
    git, naming (PHP/HTML/CSS/JS/Twig/JSON), env-vars, routes-and-urls

  guides/                      # how-to: добавить страницу, добавить SEO, локальная настройка, ...

  api/                         # API-контракты
    send.md                    # POST /api/send (объединённый, был form-send + send-contract)

  inventory/                   # автогенерируемые отчёты
    core.md                    # таблица ядра + статус во всех deployments
    deployments.md             # реестр deployments
    commit-baseline.md         # статистика истории

  notes/                       # живой журнал и migrations
    improvements.md
    migrations/

  orchestrator/                # orchestrator pipeline + отчёты
    opportunities.md
    health-{date}.md
    improvements-{date}.md

  proposals/README.md          # описание lifecycle (Proposed → ADR / Rejected / Superseded)

  roles/                       # роли компонентов системы (контракт: что делает / не делает)
    README.md
    orchestrator.md            # перенесено из architecture/orchestrator-role.md
```

## Структура deployment (kumho/italy/beepitron)

В каждом deployment'е:

```
docs/
  README.md                    # описание flow и ссылки на baseline ADR
  sessions/                    # локальные сессии работы с deployment
    YYYY-MM-DD-<topic>.md
  proposals/                   # deployment-инициированные предложения
    NNNN-<topic>.md            # нумерация локальная, статус → ADR в baseline
```

Deployment **не пишет** ADR — только proposals. После migration baseline'ом deployment proposal получает `Status: Migrated to baseline ADR-NNNN`.

## Куда что писать

| Тип записи | Куда |
|---|---|
| Архитектурное решение, обоснование и альтернативы (cross-deployment) | новый ADR в `architecture/decisions/NNNN-*.md` (baseline) |
| Идея/паттерн от конкретного deployment'а | `<deployment>/docs/proposals/NNNN-*.md` |
| Cross-deployment proposal после агрегации deployment proposals | `proposals/NNNN-*.md` (baseline) |
| Сессия работы с ядром/инструментами/общими фиксами | `sessions/YYYY-MM-DD-*.md` (baseline) |
| Сессия фикса вёрстки/контента конкретного deployment'а | `<deployment>/docs/sessions/YYYY-MM-DD-*.md` |
| Конвенция (стиль кода, нейминг) | `conventions/` (baseline) |
| Как сделать X в платформе (how-to) | `guides/` (baseline) |
| API-контракт | `api/` (baseline) |
| Снимок drift / inventory | `inventory/` — генерируется CLI |
| Описание роли компонента системы | `roles/<name>.md` (baseline) |
| Найденный дубль / отложенная задача | `notes/improvements.md` (baseline) |
| Orchestrator-отчёт / opportunity | `orchestrator/` (baseline) |

## ADR — формат

```markdown
# ADR-NNNN: <короткое имя решения>

**Status**: Accepted | Proposed | Superseded by ADR-XXXX | Deprecated
**Date**: YYYY-MM-DD
**Supersedes**: docs/proposals/NNNN-*.md (опционально)

## Context
## Decision
## Consequences
## Решения, оставленные на потом (опционально)
## References
```

Нумерация — последовательная (`0001`, `0002`, …). При замене старого решения новый ADR ссылается на старый через `Supersedes` / помечает старый `Superseded by ADR-XXXX`.

## Proposals lifecycle

См. [`proposals/README.md`](proposals/README.md). Кратко:

- **НЕ удалять** proposal после миграции — обновлять `Status:`.
- Статусы: `Proposed` / `Migrated to ADR-NNNN` / `Superseded by proposals/NNNN-*.md` / `Rejected`.

## Корневые файлы

`/README.md` (для людей), `/CLAUDE.md` (для Claude Code) — точки входа, ссылаются на `docs/` для деталей.
