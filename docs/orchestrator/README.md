# orchestrator

Документация и отчёты роли «оркестратор» — ismart-platform не просто canonical baseline, но и активно анализирует deployments, выявляет паттерны.

## Файлы

| Файл | Описание |
|---|---|
| [`opportunities.md`](opportunities.md) | Открытые идеи для baseline-улучшений (трекаются `tools/orchestrator/analyzers/opportunity-tracker.mjs`) |
| [`health-{date}.md`](.) | Health-report от `npm run orchestrate` — текущее состояние deployments, drift, паттерны |
| [`improvements-{date}.md`](.) | Применённые улучшения за период |

## Связано

- [`../roles/orchestrator.md`](../roles/orchestrator.md) — спецификация роли (что делает / не делает)
- `tools/orchestrator/orchestrate.mjs` — main entrypoint pipeline
- `tools/orchestrator/analyzers/` — отдельные analyzer'ы (divergence, data-flow, commit-miner, opportunity-tracker, deployment-proposals)

## Когда генерировать health-report

- Раз в неделю или после крупных изменений в deployment.
- `npm run orchestrate` собирает результат.
- Output: `orchestrator/health-YYYY-MM-DD.md` с приоритизированными рекомендациями.
