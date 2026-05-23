# ADR-0008: Multi-deployment docs structure

**Status:** Accepted
**Date:** 2026-05-24
**Supersedes:** `docs/proposals/0008-multi-deployment-docs.md`

## Context

Документация ismart-platform жила только в `ismart-platform/docs/`. Это:

- Сессии deployment-специфичных задач (italy mob-lemons, kumho card-tire) лежат в baseline → теряют локальный контекст.
- Proposals от конкретных deployment'ов негде писать.
- Паттерны для cross-deployment ADR не агрегируются автоматически.

## Decision

Документация разделена на два уровня:

### Baseline уровень (`ismart-platform/docs/`)

- `architecture/decisions/NNNN-*.md` — ADR (применимые ко всем)
- `proposals/NNNN-*.md` — cross-deployment proposals (от оркестратора или после агрегации deployment proposals)
- `sessions/YYYY-MM-DD-*.md` — baseline-уровень: ядро, инструменты, общие фиксы
- `architecture/`, `conventions/`, `guides/`, `roles/`, `api/`, `orchestrator/`, `inventory/` — без изменений

### Deployment уровень (`<deployment>/docs/`)

В каждом kumho/italy/beepitron:
- `docs/README.md` — описание flow
- `docs/sessions/YYYY-MM-DD-*.md` — локальные сессии (фиксы вёрстки/контента deployment'а)
- `docs/proposals/NNNN-*.md` — deployment-инициированные proposals, локальная нумерация

Не лежит в deployment:
- ADR — только в baseline
- Cross-deployment proposals — только в baseline

## Flow

```
Deployment session → <deployment>/docs/sessions/YYYY-MM-DD-X.md
                  ↓ (паттерн замечен)
Deployment proposal → <deployment>/docs/proposals/NNNN-X.md (Status: Proposed)
                  ↓
Orchestrator aggregator → ismart-platform/docs/orchestrator/proposals-{date}.md
                          группирует по темам, flag «Pattern: 2+ deployments»
                  ↓ (выявлен паттерн)
Baseline proposal → ismart-platform/docs/proposals/NNNN-X.md
                  ↓ (review + accept)
ADR → ismart-platform/docs/architecture/decisions/NNNN-X.md
                  ↓ (distill sync — код в каждый deployment)
Deployment proposal помечается Status: Migrated to baseline ADR-NNNN
```

## Implementation

### Orchestrator aggregator

`tools/orchestrator/analyzers/deployment-proposals.mjs`:
- Сканирует `<parent>/<deployment>/docs/proposals/*.md` для каждого sibling'а
- Извлекает title + Status из шапки
- Группирует proposals по keyword similarity (простая heuristic — общие слова в title)
- В health-report добавляет секцию:
  - Полный список proposals от deployments
  - Cross-deployment patterns (когда 2+ deployments на схожую тему)

### Scaffold

`tools/scaffold/create-deployment.js` создаёт `docs/{README.md, sessions/.gitkeep, proposals/.gitkeep}` при init'е нового deployment'а.

### Distill protection

`docs/` deployment **не синкается с baseline**. Уже под `BRAND_SPECIFIC_PREFIXES` через начальный путь — добавить `docs/` явно если не покрыто.

## Consequences

### Положительные

- Deployment-владельцы могут писать proposals в **своём** контексте, не открывая ismart-platform.
- Baseline orchestrator имеет автоматический канал для выявления cross-deployment паттернов.
- Sessions deployment-уровня близко к самой работе → проще читать историю спустя время.
- Структура масштабируется: новый deployment → автоматически получает `docs/` через scaffold.

### Отрицательные

- Нумерация proposals независимая в каждом deployment'е — при miграции в baseline proposal **переименовывается**. Это нормально (ADR — единый ряд), но требует ссылок на источник.
- Дополнительная папка в каждом deployment, которую нужно поддерживать (README актуальный, ссылки на ADR работают).

## Решения, оставленные на потом

- **Cross-references** между deployment proposal'ом и baseline ADR — пока через текст в Status:. Возможен авто-link при aggregator-passe.
- **Notifications** когда новый deployment proposal — пока вручную / при следующем `npm run orchestrate`. Возможно webhook от git push hook deployment'а в baseline.
- **`<deployment>/docs/notes/`** — пока опционально, не обязательная папка. Если у deployment'а есть локальные заметки которые не превращаются в proposal — там.

## References

- Proposal: [`docs/proposals/0008-multi-deployment-docs.md`](../../proposals/0008-multi-deployment-docs.md) (Migrated to ADR-0008)
- Memory: [[user-likes-adr]], [[feedback-proposals-lifecycle]]
- Session log: `docs/sessions/2026-05-24-docs-refactor.md`
