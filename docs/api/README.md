# api

API-контракты платформы — request/response, headers, error codes.

## Файлы

- [`send.md`](send.md) — `POST /api/send` (форма обратной связи / подписка). Включает request body, headers, success/error responses, идемпотентность, CSRF, channels-output (ADR-0005).

## Связано

- [ADR-0005](../architecture/decisions/0005-notification-channel-dispatcher.md) — channels в response.
- `src/Action/ApiSendAction.php` — реализация.
