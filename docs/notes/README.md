# notes

Живой журнал улучшений, migration logs, неструктурированные заметки. Срок жизни — пока актуально (потом либо переедет в ADR/proposal, либо удалится).

## Файлы и папки

- [`improvements.md`](improvements.md) — applied changes + open opportunities + замеченные паттерны
- [`migrations/`](migrations/) — логи миграций (legacy → baseline, по deployments)

## Чем notes отличаются от sessions

- **`sessions/`** — закрытая работа (что было сделано в конкретный день, какие проблемы решены).
- **`notes/`** — открытый журнал улучшений (что бы хотелось / что замечено / отложенные задачи), не привязаны к дате.

Если заметка перерастает в идею для всех deployments — переехать в `../proposals/`. Если в фикс — в session log.
