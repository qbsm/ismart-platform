# decisions — ADR (Architecture Decision Records)

Финальные архитектурные решения, единый последовательный ряд. Каждый ADR — отдельный `.md` файл с фиксированным форматом.

## Формат файла

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

Имя файла: `NNNN-<topic-kebab>.md` (4-значная нумерация, последовательная).

## Текущие ADR

| # | Тема | Статус |
|---|---|---|
| 0001 | static-utilities-vs-services | Accepted |
| 0002 | photoroom-out-of-baseline | Accepted |
| 0003 | seo-builder-strategy | Accepted |
| 0004 | data-items-from | Accepted |
| 0005 | notification-channel-dispatcher | Accepted |
| 0006 | manifest-driven-images | Accepted |
| 0007 | raw-source-picture | Accepted |
| 0008 | multi-deployment-docs | Accepted |

## Жизненный цикл

```
proposal (docs/proposals/) → review → принят → ADR (decisions/) → код в baseline → distill sync в deployments
```

При замене старого ADR новый ссылается через `Supersedes:`, старый помечается `Superseded by ADR-XXXX`.

ADR **не удаляются** после superseding — остаются как историческая запись.
