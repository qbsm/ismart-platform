# Proposal 0008: Multi-deployment docs structure

**Status:** Migrated to ADR-0008 (2026-05-24)
**Date:** 2026-05-24
**Финальный ADR:** [`docs/architecture/decisions/0008-multi-deployment-docs.md`](../architecture/decisions/0008-multi-deployment-docs.md)

> 📋 Архивирован одновременно с принятием — пользователь явно одобрил подход в момент запуска работы.

---

## Контекст

Сейчас вся документация (sessions, proposals, ADR) живёт только в `ismart-platform/docs/`. Это значит:

1. **Session logs deployment-специфичных задач** (исправление italy mob-lemons, фикс kumho tire breadcrumb) лежат в baseline → отрывают историю работы от того deployment'а, где работа происходила.
2. **Proposals от конкретных deployments** негде писать. Если контент-владелец kumho хочет предложить общесистемную доработку — нужно идти в baseline и писать там.
3. **Паттерны для ADR** не видны: baseline orchestrator не агрегирует proposals из deployments — потому что их там нет.

Архитектурно правильнее: каждый deployment имеет свою папку `docs/`, baseline orchestrator агрегирует proposals из всех deployments → формирует cross-deployment proposal или сразу ADR.

## Решение

### Структура

**`ismart-platform/docs/`** (baseline, canonical):
- `architecture/decisions/NNNN-*.md` — ADR (применимые ко всем deployments)
- `architecture/*.md` — эталонная архитектура (distillation, images, …)
- `proposals/NNNN-*.md` — **baseline proposals** (cross-deployment темы, инициированные оркестратором или после агрегации deployment proposals)
- `sessions/YYYY-MM-DD-*.md` — **сессии baseline-уровня** (только когда работа реально касается ядра: новые тулзы, изменения архитектуры, общие фиксы)
- `inventory/`, `conventions/`, `guides/`, `roles/`, `api/` — без изменений
- `orchestrator/` — health-reports, opportunities, role spec

**`<deployment>/docs/`** (new — у каждого kumho/italy/beepitron/…):
- `README.md` — описание (что лежит и куда писать)
- `sessions/YYYY-MM-DD-*.md` — **deployment-specific сессии работы** (фиксы вёрстки, контент-задачи, миграции данных)
- `proposals/NNNN-*.md` — **deployment-инициированные proposals** — идеи которые могут стать baseline ADR. Нумерация локальная, не пересекается с baseline.

### Flow

```
[deployment work session] → kumho/docs/sessions/2026-05-26-card-tire-fix.md
                          
[deployment-владелец видит паттерн] → kumho/docs/proposals/0001-card-tire-srcset.md
                                       (Status: Proposed, awaiting baseline review)

[orchestrator aggregator] → grep kumho/docs/proposals/, italy/docs/proposals/, …
                          → видит 2+ similar proposals
                          → формирует ismart-platform/docs/proposals/NNNN-X.md
                            (cross-deployment), или сразу ADR-NNNN

[ADR раскатывается] → distill sync → код в каждый deployment
                    → deployment proposal помечается:
                      Status: Migrated to baseline ADR-NNNN
```

### Nuances

- **Нумерация proposals независима** в каждом deployment'е (kumho 0001, 0002, …; italy 0001, 0002, …; baseline свой ряд). Конфликтов нет — папки разные.
- **ADR — только в baseline**. Deployment не пишет ADR.
- **Session logs**: deployment-specific сессии (фикс кнопки на kumho/news) лежат в `kumho/docs/sessions/`. Baseline сессии (создание новой Twig-функции, новый orchestrator analyzer) — в `ismart-platform/docs/sessions/`.
- **При distill sync** — папка `docs/` deployment не синкается с baseline (она deployment-specific). Это уже встроено в `BRAND_SPECIFIC_PREFIXES` через путь `docs/`.

### Orchestrator aggregator

`tools/orchestrator/analyzers/deployment-proposals.mjs`:
- Сканирует `*/docs/proposals/*.md` всех siblings (через `SIBLING_DEPLOYMENTS` paths)
- Группирует по themes (heuristic — keywords в title/body)
- В `health-report` секция «Deployment Proposals» — список с deployment-origins и счётчиком повторений
- 2+ deployments на ту же тему → flag «Pattern: candidate for baseline»

## Acceptance

- [ ] `ismart-platform/docs/README.md` обновлён под новую структуру (отражает разделение baseline ↔ deployments)
- [ ] `<deployment>/docs/README.md` — шаблон создан в kumho/italy/beepitron, объясняет flow
- [ ] `<deployment>/docs/sessions/.gitkeep` + `<deployment>/docs/proposals/.gitkeep`
- [ ] Скрипт `scaffold/create-deployment.js` создаёт `docs/` skeleton при init'е нового deployment'а
- [ ] `tools/orchestrator/analyzers/deployment-proposals.mjs` — aggregator
- [ ] `tools/orchestrator/orchestrate.mjs` — интеграция aggregator'а в health-report
- [ ] Существующие deployment-specific session logs из baseline перенесены в соответствующие deployments (или хотя бы помечены ссылкой)

## Миграция

1. Реализация в baseline (config + docs README + scaffold + aggregator).
2. На каждом deployment: создать `docs/{README.md, sessions/.gitkeep, proposals/.gitkeep}`. Init-commit.
3. Анализ существующих baseline session logs — какие из них реально baseline-уровня, какие deployment-specific. Deployment-specific перенести (cp+commit в нужный deployment, оставить ссылку в baseline session или удалить).
4. Зафиксировать ADR-0008.

## Связано

- [[user-likes-adr]] memory — пользователь одобряет ADR-подход
- [[feedback-proposals-lifecycle]] memory — proposals не удаляются
- ADR-0005 (notifications), ADR-0006/0007 (images) — baseline ADR'ы, раскатываются на deployments
