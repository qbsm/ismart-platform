# Сессия 2026-05-24 — Multi-deployment docs structure (ADR-0008)

Рефакторинг документации: разделение на baseline-уровень (ismart-platform/docs/) и deployment-уровень (`<deployment>/docs/`). Deployment'ы могут писать свои sessions и proposals; baseline orchestrator агрегирует deployment proposals для выявления cross-deployment паттернов.

## Главное

**Контракт:** ADR — только в baseline. Deployment пишет proposals + sessions. Когда 2+ deployments сходятся на одной теме → baseline формирует proposal или сразу ADR.

**Aggregator уже работает** — `tools/orchestrator/analyzers/deployment-proposals.mjs` сканирует `<deployment>/docs/proposals/*.md`, группирует по keyword overlap (>= 2 общих значимых слова в title между разными deployments), печатает в health-report секцию «Pattern: 2+ deployments на схожую тему — кандидат на baseline ADR».

## Что сделано

**Baseline (ismart-platform):**
- `docs/proposals/0008-multi-deployment-docs.md` (Migrated to ADR-0008) — дизайн
- `docs/architecture/decisions/0008-multi-deployment-docs.md` — финальный ADR
- `docs/README.md` — обновлён под двухуровневую структуру
- `docs/architecture/orchestrator-role.md` → `docs/roles/orchestrator.md` (перенос в правильное место, ранее накопленный технический долг #14)
- `docs/api/form-send.md` + `docs/api/send-contract.md` → `docs/api/send.md` (дубли слиты)
- `tools/orchestrator/analyzers/deployment-proposals.mjs` — aggregator

**Deployments (kumho/italy/beepitron):**
- Создан `docs/{README.md, sessions/, proposals/}` skeleton в каждом
- README — общий шаблон со ссылкой на ADR-0008
- Существующие baseline-дубли удалены (architecture/, guides/, api/, registry/) — они зеркалили baseline
- kumho: 10 session-* логов перенесены из `docs/` плоско в `docs/sessions/` с правильным формат `YYYY-MM-DD-topic.md`
- kumho: `platform-content-separation.md` → `sessions/2026-03-06-platform-content-separation.md`
- italy: `architecture/refactor-backend-events-2026-05-08.md` → `sessions/2026-05-08-refactor-backend-events.md`
- beepitron: `history/refactor-plan-2026.md` → `sessions/2026-refactor-plan.md`

## Memory обновлено

- `user-likes-adr` — пользователь явно одобряет ADR-подход
- `feedback-proposals-lifecycle` — proposals не удалять, помечать статус

## Не сделано (отдельные задачи)

- **Интеграция aggregator'а в `tools/orchestrator/orchestrate.mjs`** — пока скрипт работает standalone (`node tools/orchestrator/analyzers/deployment-proposals.mjs`). Включение в main pipeline + сохранение в health-report-{date}.md — следующий шаг.
- **`scaffold/create-deployment.js`** — добавить создание `docs/{README.md, sessions/, proposals/}` skeleton при init нового deployment'а.
- **Анализ существующих baseline session logs** — какие из них реально baseline-уровня (ядро/инструменты), какие deployment-specific и должны быть перенесены. Пока оставлены как есть — следующая итерация при необходимости.
- **`docs/proposals/0004-public-symlinks-security.md`** и **0005, 0007** — open Proposed статус, ждут review/решения.

## Ожидаемый эффект

В работе по конкретному deployment'у (например kumho intro/card-tire fix) Claude теперь должен:
1. Сессию писать в `kumho-tires.ru/docs/sessions/2026-XX-XX-card-tire-fix.md` (а не в baseline)
2. Если замечает паттерн (3 раза подряд та же проблема) — proposal в `kumho-tires.ru/docs/proposals/NNNN-<topic>.md`
3. Baseline `npm run orchestrate` увидит этот proposal через aggregator → если есть аналог в italy/beepitron → паттерн → baseline proposal/ADR

Это **долгосрочное** улучшение: контекст работы остаётся с проектом, паттерны выявляются автоматически.
