# ADR-0005: Notification Channel-Dispatcher

**Status**: Accepted
**Date**: 2026-05-22
**Supersedes**: `docs/proposals/0001-notification-channel-dispatcher.md` (v2)

## Context

`ApiSendAction` принимает submit формы и тянет за собой **только email** через `MailService`. Реальные интеграции, которые нужны платформе:

- **Email** — уже есть (`MailService`)
- **CallTouch** — лид-трекинг для всех клиентов
- **Telegram** — нотификации в чат менеджеров
- **Google Sheets** — лог заявок в таблицу для отчётов

Все четыре — **базовые каналы платформы**, общие для всех deployments (kumho, italy, beepitron, trazano, mirage). На deployments без credentials канал отдаёт `disabled` через `isEnabled()`, не падает.

Подходы, которые не масштабируются:

- Прямой вызов сервисов из `ApiSendAction` — `__construct` пухнет, каждый канал = новая правка Action, дублирование обработки ошибок.
- Отдельный endpoint на канал — дублирует CSRF / idempotency / rate-limit, переносит мультиплекс на фронт.

## Decision

Channel-dispatcher: один endpoint `POST /api/send`, внутри — `NotificationDispatcher`, итерирующий зарегистрированные каналы. Каждый канал — отдельный класс, реализующий `ChannelInterface`. Ошибка одного канала изолируется (`Throwable` → `ChannelResult::failed`) и не блокирует остальные.

### Контракт

```php
interface ChannelInterface
{
    public function name(): string;
    public function isEnabled(): bool;
    public function send(array $formData, array $uploadedFiles, string $requestId): ChannelResult;
}

final class ChannelResult
{
    public const STATUS_SUCCESS  = 'success';
    public const STATUS_WARNING  = 'warning';   // валидационная ошибка на стороне получателя
    public const STATUS_FAILED   = 'failed';    // транспортная/инфраструктурная ошибка
    public const STATUS_DISABLED = 'disabled';

    public readonly string $channel;
    public readonly string $status;
    public readonly string $message;
    public readonly array $meta;
}
```

### Базовый набор каналов

| Канал | name() | isEnabled() | Env |
|---|---|---|---|
| Mail | `mail` | `MAIL_TO !== ''` | `MAILER_DSN`, `MAIL_TO`, `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_SUBJECT_PREFIX` |
| CallTouch | `calltouch` | `CT_ENABLE=true && CT_ROUTE_KEY && CT_TOKEN` | `CT_ENABLE`, `CT_ROUTE_KEY`, `CT_TOKEN`, `CT_TIMEOUT` |
| Telegram | `telegram` | `TG_ENABLE=true && TG_BOT_TOKEN && TG_CHAT_ID` | `TG_ENABLE`, `TG_BOT_TOKEN`, `TG_CHAT_ID`, `TG_TIMEOUT` |
| Google Sheets | `google_sheets` | `GS_ENABLE=true && GS_SPREADSHEET_ID && file_readable(GS_CREDENTIALS_PATH)` | `GS_ENABLE`, `GS_SPREADSHEET_ID`, `GS_SHEET_NAME`, `GS_CREDENTIALS_PATH`, `GS_TIMEOUT` |

### Особенности по каналам

- **MailChannel** — тонкая обёртка над существующим `App\Service\MailService` (сервис не меняется). `isEnabled()` зависит от `MAIL_TO` (иначе CI без SMTP падал бы).
- **CallTouchChannel** — POST в `api.calltouch.ru/widget-service/v1/api/widget-request/user-form/create`. Mapping ответа: HTTP 200 + `widgetRequestId` → `success`, `errorCode=10007` или `validationErrorData` → `warning`, остальное → `failed`. Phone normalize: 8-prefix → 7-prefix, не-цифры удаляются.
- **TelegramChannel** — `sendMessage` (HTML) + `sendDocument` per file. Один `TG_CHAT_ID` на deployment. Per-file ошибки изолируются: основное сообщение OK, часть файлов упала → `warning(meta: {message_id, failed_files: [...]})`.
- **GoogleSheetsChannel** — JWT service account через нативный `openssl_sign` (без сторонних JWT-либ). 15-колоночная схема таблицы фиксирована в исходнике (`COLUMNS` / `HEADER_RU`). При первой записи в пустой sheet канал пишет строку заголовков и ставит файл-маркер `cache/google-sheets/header-{hash}.flag`. Access-token кэшируется в `cache/google-sheets/token.json` (TTL 50 мин, OAuth выдаёт 60).

### HTTP-клиент

Все каналы кроме Mail используют `Symfony\Contracts\HttpClient\HttpClientInterface` (реализация — `Symfony\Component\HttpClient\HttpClient::create()`). Выбран `symfony/http-client` поверх Guzzle и native cURL — половина symfony/* транзитивных зависимостей уже подгружена через `symfony/mailer`, нативный `MockHttpClient` для unit-тестов каналов. Подробнее: [[project_http_client]] в memory.

### Кредентиалы Google Sheets

- JSON service account → `config/secrets/google-service-account.json` (gitignored).
- `.gitignore`: `config/secrets/*.json` с исключениями `.gitkeep`, `.htaccess`, `README.md`.
- `config/secrets/.htaccess` → `Require all denied` (страховка от случайного symlink в `public/`).
- Получение credentials описано в `config/secrets/README.md`.

### Структура файлов

```
src/Notification/
├── ChannelInterface.php
├── ChannelResult.php
├── NotificationDispatcher.php
└── Channel/
    ├── MailChannel.php
    ├── CallTouchChannel.php
    ├── TelegramChannel.php
    └── GoogleSheetsChannel.php

config/
├── settings.php       # секции 'mail', 'calltouch', 'telegram', 'google_sheets'
├── container.php      # регистрация Channel'ов + Dispatcher + HttpClientInterface
└── secrets/           # gitignored credentials + .gitkeep + .htaccess + README.md

cache/
└── google-sheets/     # token.json + header-{hash}.flag (gitignored)

tests/php/Unit/Notification/
├── ChannelResultTest.php
└── NotificationDispatcherTest.php

tools/build/check-notification-channels.php  # печатает статус каналов при build / build:dev
```

## Consequences

### Положительные

- Расширение на новый канал — отдельный класс, регистрация в `config/container.php`, env-ключи. `ApiSendAction` не трогается.
- Throwable-изоляция: один канал лёг — остальные продолжают.
- Прозрачный статус: JSON response содержит `channels: {mail: success, calltouch: success, telegram: warning, google_sheets: disabled}`. Видно в DevTools → Network → /api/send → Response. Логи Monolog в `logs/app-*.log` грепаются по `request_id`.
- На deployments без credentials каналы автоматически `disabled` — не нужны deployment-overrides на каждый канал.
- `MailService` не меняется — `MailChannel` тонкая обёртка, обратная совместимость существующего email-pipeline.

### Отрицательные

- Sequential dispatch — общее время submit = сумма таймаутов всех включённых каналов. На 4 канала с timeout 10s в худшем случае это 40s. На практике все четыре одновременно лежат редко; средний случай — 1-2s.
- Symfony HttpClient не разделяет `connect_timeout` и total timeout (только `timeout` + `max_duration`). При мёртвом DNS канал отъест весь `max_duration`. Приемлемо — на современных хостах connect-залипания редки.
- GoogleSheets делает дополнительный GET на проверку header (одноразово, потом маркер в `cache/`).

### Решения, оставленные на потом

- **Async/parallel dispatch.** При появлении 5+ каналов или жёстких SLA можно ввести `ConcurrentDispatcher` (`HttpClient::stream()` или curl_multi) с тем же `ChannelInterface` — каналы не меняются.
- **Per-deployment selection.** Если у клиента понадобится свой канал (например, отдельный webhook) — вводится `config/project.php::notification_channels => [WebhookChannel::class]`, factory Dispatcher собирает массив `[...baseline, ...projectChannels]`. Пока не нужно.
- **Telegram per-form routing.** Если разные формы должны идти в разные чаты — `project.php::telegram_routes => [form_id => chat_id]`.
- **Sheets per-deployment columns.** Если клиенту нужна своя схема таблицы — отдельный канал или `project.php::google_sheets.extra_columns`. Сейчас 15 колонок фиксированы.
- **Декораторы.** `RetryingChannel`, `QueuedChannel`, `MeteredChannel` оборачивают любой канал без правок самого канала.

## References

- Reference implementation Mail + CallTouch — `kumho-tires.ru` ветка `feat/dealer-brand-logo`, коммит `810b6a2` (предшествовал этому ADR; послужил основой и был расширен Telegram + Sheets при merge в baseline).
- Proposal v2: `docs/proposals/0001-notification-channel-dispatcher.md` (удаляется после merge этого ADR).
- Session log: `docs/sessions/2026-05-22-notification-channels-implementation.md`.
