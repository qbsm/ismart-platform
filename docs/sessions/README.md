# sessions

Логи содержательных сессий **baseline-уровня** — работа с ядром, инструментами, общие фиксы. Per-deployment сессии лежат в `<deployment>/docs/sessions/` (ADR-0008).

## Naming convention

`YYYY-MM-DD-<topic-kebab>.md`

Без префикса `session-` (уже видно из папки). Topic — kebab-case (через `-`).

## Что писать сюда

- Создание нового tooling (orchestrator analyzer, migration script, scaffold)
- Изменения в ядре (`src/`, `config/settings.php`, новый ADR с реализацией)
- Refactor общих компонентов
- Fix баг'а который касается всех deployments

## Что НЕ писать сюда

- Фикс вёрстки/контента **конкретного** deployment'а → `<deployment>/docs/sessions/`
- Идеи/паттерны → `docs/proposals/` (baseline) или `<deployment>/docs/proposals/`
- Решения с альтернативами → ADR в `docs/architecture/decisions/`

## Стиль

- Линейный нарратив без P1.1/P2.x иерархий
- «Проблема → Решение → План» в 3 абзацах для главных моментов
- Что создано / обновлено — список
- Не сделано / follow-up — открыто

См. memory `feedback-simplicity`.
