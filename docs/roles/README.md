# docs/roles

Описания **ролей в системе** — компонентов и инструментов с чётко выделенной ответственностью. По одному файлу на роль (`<role>.md`).

## Чем отличается от других папок

| Папка | Что | Пример |
|---|---|---|
| `architecture/` | как устроено (статика) | `images.md`, `distillation.md` |
| `architecture/decisions/` | почему так решили (история) | `0005-notification-channel-dispatcher.md` |
| `conventions/` | как пишем код | `naming.md`, `git.md` |
| `guides/` | как сделать X | `page-add.md`, `seo-add.md` |
| `roles/` | **что компонент делает и не делает** | `orchestrator.md`, `distill.md` |

Роль — это контракт компонента: за что отвечает, что **не** делает, чем расширяется, кто потребитель. Помогает не размывать границы при добавлении нового кода.

## Кандидаты на роли

Пока в репо роли описаны разбросанно (`architecture/orchestrator-role.md`, `architecture/distillation.md`, `tools/*/README.md`). Постепенный перенос:

- **baseline** — `ismart-platform` как canonical, источник правды для CORE + ADR/conventions
- **orchestrator** — анализ deployments (divergence/data-flow/commit-mining), рекомендации без auto-fix _(сейчас в `architecture/orchestrator-role.md`)_
- **distill** — синхронизация baseline ↔ deployments (scan/diff/sync/mark-override) _(частично в `architecture/distillation.md`)_
- **scaffold** — генераторы pages/collections/sections/components/deployment
- **build** — webpack/postcss/sharp/manifest pipeline
- **deployment** — конкретный production-инстанс с overrides и project.php

## Шаблон файла роли

```markdown
# <role-name>

**Status**: active | deprecated
**Scope**: <директории, файлы, команды>

## Ответственность
- что делает (с примерами)

## Не ответственность
- что НЕ делает (с указанием, какая роль это покрывает)

## Контракт расширения
- как роль расширяется (новый канал, новый analyzer, новый sibling)

## Потребители
- кто вызывает / использует роль

## Связанные документы
- ADR, guides, conventions
```
