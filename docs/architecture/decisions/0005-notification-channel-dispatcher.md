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

Порядок в списке — порядок обхода. Rescue стоит **первым**: он сохраняет заявку у приёмника
раньше любых попыток доставки, поэтому отказ остальных каналов перестаёт означать потерянный
лид (см. «Обновление 2026-08-09»).

| Канал | name() | isEnabled() | Env |
|---|---|---|---|
| Rescue | `rescue` | `RESCUE_ENABLE=true && RESCUE_URL && RESCUE_SITE` | `RESCUE_ENABLE`, `RESCUE_URL`, `RESCUE_SITE`, `RESCUE_KEY`, `RESCUE_TIMEOUT` |
| Mail | `mail` | `MAIL_TO !== ''` | `MAIL_DSN`, `MAIL_TO`, `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_SUBJECT_PREFIX` |
| CallTouch | `calltouch` | `CALLTOUCH_ENABLE=true && (ROUTE_KEY+TOKEN либо SITE_ID)` | `CALLTOUCH_ENABLE`, `CALLTOUCH_ROUTE_KEY`, `CALLTOUCH_TOKEN`, `CALLTOUCH_SITE_ID`, `CALLTOUCH_TIMEOUT` |
| Telegram | `telegram` | `TELEGRAM_ENABLE=true && BOT_TOKEN && CHAT_ID` | `TELEGRAM_ENABLE`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_TIMEOUT` |
| Google Sheets | `google_sheets` | `SHEETS_ENABLE=true && SPREADSHEET_ID && file_readable(CREDENTIALS_PATH)` | `SHEETS_ENABLE`, `SHEETS_SPREADSHEET_ID`, `SHEETS_SHEET_NAME`, `SHEETS_CREDENTIALS_PATH`, `SHEETS_TIMEOUT` |

Имена приведены к правилу «префикс = имя канала» (`docs/reference/env.md`). Прежние `CT_`,
`TG_`, `GS_`, `MAILER_DSN` читаются как запасной вариант, но в новых deployment'ах не
используются. У почты флага `MAIL_ENABLE` нет: канал включается наличием `MAIL_TO` — расхождение
с правилом осознанное, но неудобное, см. «Открытые вопросы».

### Особенности по каналам

- **RescueChannel** — POST в `api.ismart.pro/v1/rescue`. Приёмник сначала сохраняет заявку, а
  потом сам разносит её по своим каналам с повторами, поэтому упавший канал перестаёт означать
  потерянный лид. Отправитель подтверждается по домену (заявку шлёт бэкенд, значит с адреса, на
  который резолвится домен); ключ `hmac(соль, домен)` нужен только хостингам вне нашего периметра.
  CallTouch намеренно остался на стороне сайта: ему нужны ключи конкретного кабинета и
  `sessionId` из браузера, а автопрозвон должен уходить сразу, без очереди.
- **MailChannel** — тонкая обёртка над существующим `App\Service\MailService` (сервис не меняется). `isEnabled()` зависит от `MAIL_TO` (иначе CI без SMTP падал бы).
- **CallTouchChannel** — POST в `api.calltouch.ru/widget-service/v1/api/widget-request/user-form/create`. Mapping ответа: HTTP 200 + `widgetRequestId` → `success`, `errorCode=10007` или `validationErrorData` → `warning`, остальное → `failed`. Phone normalize: 8-prefix → 7-prefix, не-цифры удаляются.
- **TelegramChannel** — `sendMessage` (HTML) + `sendDocument` per file. Один `TELEGRAM_CHAT_ID` на deployment. Per-file ошибки изолируются: основное сообщение OK, часть файлов упала → `warning(meta: {message_id, failed_files: [...]})`.
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
    ├── RescueChannel.php
    ├── MailChannel.php
    ├── CallTouchChannel.php
    ├── TelegramChannel.php
    └── GoogleSheetsChannel.php

config/
├── settings.php       # секции 'rescue', 'mail', 'calltouch', 'telegram', 'google_sheets'
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
- Прозрачный статус: JSON response содержит `channels: {rescue: success, mail: success, calltouch: success, telegram: warning, google_sheets: disabled}`, и та же сводка уходит в приёмник (см. обновление 2026-08-09). Видно в DevTools → Network → /api/send → Response. Логи Monolog в `logs/app-*.log` грепаются по `request_id`.
- На deployments без credentials каналы автоматически `disabled` — не нужны deployment-overrides на каждый канал.
- `MailService` не меняется — `MailChannel` тонкая обёртка, обратная совместимость существующего email-pipeline.

### Отрицательные

- Sequential dispatch — общее время submit = сумма таймаутов всех включённых каналов. На 5 каналов с timeout 10s в худшем случае это 50s. На практике все одновременно лежат редко; средний случай — 1-2s. Отчёт о каналах добавляет ещё один запрос с таймаутом 3s.
- Symfony HttpClient не разделяет `connect_timeout` и total timeout (только `timeout` + `max_duration`). При мёртвом DNS канал отъест весь `max_duration`. Приемлемо — на современных хостах connect-залипания редки.
- GoogleSheets делает дополнительный GET на проверку header (одноразово, потом маркер в `cache/`).

### Решения, оставленные на потом

- **Async/parallel dispatch.** При появлении 5+ каналов или жёстких SLA можно ввести `ConcurrentDispatcher` (`HttpClient::stream()` или curl_multi) с тем же `ChannelInterface` — каналы не меняются.
- **Per-deployment selection.** Если у клиента понадобится свой канал (например, отдельный webhook) — вводится `config/project.php::notification_channels => [WebhookChannel::class]`, factory Dispatcher собирает массив `[...baseline, ...projectChannels]`. Пока не нужно.
- **Telegram per-form routing.** Если разные формы должны идти в разные чаты — `project.php::telegram_routes => [form_id => chat_id]`.
- **Sheets per-deployment columns.** Если клиенту нужна своя схема таблицы — отдельный канал или `project.php::google_sheets.extra_columns`. Сейчас 15 колонок фиксированы.
- **Декораторы.** `RetryingChannel`, `QueuedChannel`, `MeteredChannel` оборачивают любой канал без правок самого канала.

## Обновление 2026-08-09: rescue, отчёт о доставке, обязательность диспетчера

**Пятый канал — rescue.** Поводом стал инцидент на `promo.avilon-changanauto.ru`: одновременно
отказали почта и CallTouch, и 30 заявок не сохранились нигде, притом что форма отвечала
«успешно отправлена». Канал ставится первым в списке, чтобы заявка попадала в приёмник до
любых попыток доставки. Он добавочный, а не замещающий: остальные каналы остаются и включаются
своими флагами. Там, где политика заказчика запрещает отдавать данные в сторонний сервис,
достаточно не включать `RESCUE_ENABLE`.

**Отчёт о том, чем закончился обход.** Статусы каналов возвращались только в JSON ответа формы,
то есть жили ровно до закрытия вкладки: в логи попадают лишь отказы, и вопрос «ушла ли заявка
в CallTouch на прозвон» не имел ответа. После обхода `ApiSendAction` досылает сводку в приёмник
(`RescueChannel::reportChannels()` → `POST /v1/rescue/channels`), тот хранит её у заявки и
показывает в выгрузке отдельной колонкой:

```
calltouch: успешно, mail: выключен, rescue: успешно, telegram: выключен
```

Отдельный запрос, а не поле внутри заявки, — потому что rescue вызывается первым и на момент
его вызова итогов остальных каналов ещё нет. Ошибка отчёта ни на что не влияет: заявка уже
принята.

**Диспетчер обязателен для всех deployment'ов.** `italycommunity` до 2026-08-09 оставался на
архитектуре «до этого ADR»: письмо уходило прямым вызовом `MailService`, копия в приёмник —
собственным `try/catch` в экшене, диспетчера в контейнере не было вовсе. Из-за этого правки
ядра проходили мимо него, а на снятии сессионного токена его формы отвечали 419, пока
расхождение не обнаружилось. Deployment, оставшийся вне диспетчера, ломается на каждой правке
ядра — поэтому приведение к нему обязательно, а не желательно.

Валидация при этом остаётся deployment-специфичной: у `italycommunity` обязательны имя и почта,
телефон не требуется. Это требования сайта, а не архитектура.

## Открытые вопросы

- **У почты нет `MAIL_ENABLE`.** Канал включается наличием `MAIL_TO`, тогда как у остальных есть
  явный флаг. Это уже стоило ошибки: попытка «выключить почту», подменив адрес, оставила канал
  включённым на семи каталогах. Флаг стоит завести и привести правило к единому виду.

## References

- Reference implementation Mail + CallTouch — `kumho-tires.ru` ветка `feat/dealer-brand-logo`, коммит `810b6a2` (предшествовал этому ADR; послужил основой и был расширен Telegram + Sheets при merge в baseline).
- Proposal v2: `docs/proposals/0001-notification-channel-dispatcher.md` (удаляется после merge этого ADR).
- Session log: `docs/sessions/2026-05-22-notification-channels-implementation.md`.
