# inventory

Автогенерируемые отчёты о текущем состоянии baseline и deployments. **Не править руками** — генерируется через CLI.

## Файлы

| Файл | Генератор | Описание |
|---|---|---|
| [`core.md`](core.md) | `npm run distill:inventory` | Таблица ядра + статус во всех deployments (identical / drifted / unique / missing) |
| [`deployments.md`](deployments.md) | вручную / `distill init` | Реестр active + planned deployments (URLs, branches, состояние) |
| [`commit-baseline.md`](commit-baseline.md) | `tools/orchestrator/analyzers/commit-miner.mjs` | 90-дневная статистика истории коммитов deployments |

## Когда генерировать

- После значимых изменений baseline (новая ADR, refactor ядра) — перегенерация `core.md` показывает что drift'ит.
- Перед обсуждением раскатки на deployments — `commit-baseline.md` показывает накопленный intent.
- При добавлении нового deployment — `deployments.md` обновляется руками.
