# migrations

Логи миграций — переход с legacy boilerplate → baseline платформы. Per-deployment записи о том, что переехало, что осталось как override.

## Файлы

| Файл | Описание |
|---|---|
| [`legacy-boilerplate-to-baseline.md`](legacy-boilerplate-to-baseline.md) | Общий план миграции с legacy на baseline |
| [`status-by-deployment.md`](status-by-deployment.md) | Прогресс по каждому deployment'у |
| [`trazano.md`](trazano.md) | Trazano-specific migration log |

## Куда писать сюда

При запуске нового deployment'а на baseline или при значимом sync'е существующего — короткий migration log: что синкнулось, что осталось как override, какие баги обнаружились по пути.
