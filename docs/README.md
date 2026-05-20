# docs — документация iSmart Platform

Документация платформы организована по четырём типам по характеру содержимого. Принцип: **разное живёт отдельно**. Что/почему — в `architecture/`, что есть сейчас — в `inventory/`, правила и стиль — в `conventions/`, журнал — в `notes/`.

## Структура

```
docs/
  architecture/                # стратегия, ADR, концепции
    distillation.md              # стратегия дистилляции (центральный документ)
    decisions/                   # Architecture Decision Records (ADR)
      0001-static-utilities-vs-services.md
      0002-photoroom-out-of-baseline.md

  inventory/                   # автогенерируемые отчёты о текущем состоянии
    core.md                      # таблица ядра + статус во всех deployments (npm run distill:inventory)

  conventions/                 # как пишем код
    best-practices.md            # принципы (минимализм, type-safety, immutability, ...)
    naming.md                    # соглашения имён классов/папок

  notes/                       # живой журнал
    improvements.md              # applied changes + open opportunities + patterns
```

## Когда что куда писать

| Тип записи | Куда |
|---|---|
| Новое архитектурное решение или паттерн на проекте | `architecture/` (если стратегия) или `architecture/decisions/NNNN-*.md` (если ADR) |
| Снимок текущего drift / inventory | `inventory/` — генерируется CLI, не правится руками |
| Договорённость по стилю/нейму/тестам | `conventions/` |
| Заметка о найденном дубле, отложенной задаче, локальном паттерне | `notes/improvements.md` |
| Архитектурное решение, требующее обоснования и альтернатив | новый ADR в `architecture/decisions/` |

## ADR (Architecture Decision Records)

Формат каждого ADR:

```markdown
# ADR-NNNN: <короткое имя решения>

**Status**: Accepted | Proposed | Superseded | Deprecated
**Date**: YYYY-MM-DD

## Context
<что заставило принимать решение>

## Decision
<что выбрали>

## Consequences
<плюсы и минусы>

## Alternatives considered
<какие варианты отвергли и почему>
```

Нумерация — последовательная (`0001`, `0002`, ...). При замене старого решения новый ADR ссылается на старый и помечает его `Superseded`.

## Корневые файлы (`/README.md`, `/CLAUDE.md`)

Остаются в корне репозитория, потому что это **точки входа**: README.md — для людей, CLAUDE.md — для Claude Code. Они короткие и ссылаются на `docs/` для деталей.
