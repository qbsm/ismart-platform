# Структурированное логирование

## Поля для трассировки

| Поле         | Описание                                          | Источник                                                                                                                       |
| ------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `request_id` | Уникальный идентификатор запроса (32 hex-символа) | `CorrelationIdMiddleware`: заголовок `X-Request-Id` или генерация при отсутствии; пробрасывается в ответе и в контексте ошибок |
| `message`    | Текст записи (например, сообщение исключения)     | Передаётся в `LoggerInterface::error()` и т.п.                                                                                 |
| `context`    | Массив дополнительных данных                      | В error-обработчиках в context передаётся `request_id`                                                                         |

В ответах API (api/send, ошибки) поле `request_id` возвращается в JSON, чтобы поддержка могла найти соответствующий запрос в логах.

## Где задаётся request_id

- **CorrelationIdMiddleware** — добавляет атрибут `request_id` к запросу и заголовок `X-Request-Id` к ответу.
- **ServerErrorHandler** — при логировании исключения передаёт в context `request_id` из атрибута запроса.
- **HttpErrorHandler** — возвращает `request_id` в теле JSON-ответа при 4xx.
- **ApiSendAction** — возвращает `request_id` в теле ответа (успех и ошибки валидации/CSRF).

## Как искать в логах

- Логи приложения: `logs/app.log` (путь из `config/settings.php` → `paths.logs`).
- Поиск по запросу: `grep "<request_id>" logs/app.log` или в лог-агрегаторе по полю `request_id`.
- Уровни: в production — WARNING и выше; в development — DEBUG (см. `config/settings.php`, LoggerInterface).

## Расширение (duration и др.)

При необходимости добавить замер времени запроса или другие поля:

- Либо в middleware после `$response = $handler->handle($request)`: вычислить duration, записать лог с `request_id`, `duration`, `method`, `path`.
- Либо зафиксировать формат в этом документе (например, JSON-строки в app.log с полями `timestamp`, `level`, `request_id`, `duration_ms`, `message`).
