# Proposal 0001: Notification Channel-Dispatcher

**Status:** Migrated to ADR-0005 (2026-05-22)
**Original status:** v2, готов к review (расширен с 1 канала до 4 базовых)
**Reference implementation:** `kumho-tires.ru` ветка `feat/dealer-brand-logo` — Dispatcher + Mail + CallTouch. Telegram + Google Sheets реализуются вместе с baseline-merge (нет working reference на момент proposal).
**Дата:** 2026-05-22
**Финальный ADR:** [`docs/architecture/decisions/0005-notification-channel-dispatcher.md`](../architecture/decisions/0005-notification-channel-dispatcher.md)

> 📋 Архивирован. Решение принято и имплементировано — см. ADR-0005. Этот файл сохраняет историю review-этапа.

## Контекст

`ApiSendAction` принимает submit формы и тянет за собой **только email** через `MailService`. Реальные интеграции, которые нужны платформе:

- **Email** — уже есть (`MailService`)
- **CallTouch** — лид-трекинг для всех клиентов (`api.calltouch.ru/widget-service/.../user-form/create`)
- **Telegram** — нотификации в чат менеджеров
- **Google Sheets** — лог заявок в таблицу для отчётов

Все четыре — **базовые каналы платформы**, общие для всех deployments (kumho, italy, beepitron, trazano, mirage). Включаются per-deployment через env. Если credentials не заполнены — канал отдаёт `disabled`, не падает.

Подходы, которые **не масштабируются**:

- Прямой вызов сервисов из `ApiSendAction` — `__construct` пухнет, каждый канал = новая правка Action, дублируется обработка ошибок.
- Отдельный endpoint на канал — дублирует CSRF/idempotency/rate-limit, переносит мультиплекс на фронт (Promise.all), усложняет UX при partial failure.

## Решение

Channel-dispatcher: один endpoint `POST /api/send`, внутри — `NotificationDispatcher`, итерирующий зарегистрированные каналы. Каждый канал — отдельный класс, реализующий `ChannelInterface`. Ошибка одного канала изолируется и логируется, не блокирует остальные.

## Контракт

```php
// src/Notification/ChannelInterface.php
interface ChannelInterface
{
    public function name(): string;
    public function isEnabled(): bool;
    public function send(array $formData, array $uploadedFiles, string $requestId): ChannelResult;
}
```

```php
// src/Notification/ChannelResult.php — DTO
final class ChannelResult
{
    public const STATUS_SUCCESS = 'success';
    public const STATUS_WARNING = 'warning';   // валидационная ошибка на стороне получателя
    public const STATUS_FAILED  = 'failed';    // транспортная/инфраструктурная ошибка
    public const STATUS_DISABLED = 'disabled'; // канал не включён в конфиге

    public readonly string $channel;
    public readonly string $status;
    public readonly string $message;
    public readonly array $meta;

    public static function success(string $channel, array $meta = []): self;
    public static function warning(string $channel, string $message, array $meta = []): self;
    public static function failed(string $channel, string $message, array $meta = []): self;
    public static function disabled(string $channel): self;
}
```

```php
// src/Notification/NotificationDispatcher.php — sequential dispatch с изоляцией Throwable
final class NotificationDispatcher
{
    public function __construct(
        private readonly iterable $channels,
        private readonly LoggerInterface $logger,
    ) {}

    public function dispatch(array $formData, array $uploadedFiles, string $requestId): array
    {
        // итерирует каналы, ловит Throwable, возвращает ChannelResult[]
    }
}
```

## Структура файлов

```
src/Notification/
├── ChannelInterface.php
├── ChannelResult.php
├── NotificationDispatcher.php
└── Channel/
    ├── MailChannel.php          # адаптер над App\Service\MailService
    ├── CallTouchChannel.php     # cURL → api.calltouch.ru
    ├── TelegramChannel.php      # cURL → api.telegram.org/bot{TOKEN}
    └── GoogleSheetsChannel.php  # JWT → sheets.googleapis.com/v4

config/
├── settings.php                 # + секции 'calltouch', 'telegram', 'google_sheets'
├── container.php                # + регистрация всех Channel'ов и Dispatcher
└── secrets/
    ├── .gitkeep
    ├── .htaccess                # Require all denied (страховка)
    ├── README.md                # формат google-service-account.json
    └── google-service-account.json  # gitignored

cache/
└── google-sheets/
    └── token.json               # access_token cache, TTL 50 мин (gitignored)

.env / .env.example              # + CT_*, TG_*, GS_* ключи
.gitignore                       # + config/secrets/*.json (с исключениями .gitkeep, .htaccess, README.md)
```

## Каналы

### MailChannel

Адаптер над существующим `App\Service\MailService` — сервис не меняется.

- `name()` → `"mail"`
- `isEnabled()` → `($settings['mail']['to'] ?? '') !== ''` (без `MAIL_TO` канал disabled — иначе CI/локалка без SMTP-конфига шлёт в `noreply@localhost` и тесты падают)
- `send()` → `MailService::sendFormSubmission()`, возвращает `success` / `failed('mail_transport_failed')`

### CallTouchChannel

Реализован в kumho (`src/Notification/Channel/CallTouchChannel.php`, 158 строк). Переносится в baseline 1:1 с двумя правками:

- Split CURL timeouts: `CONNECTTIMEOUT=3`, `TIMEOUT=10` (раньше оба = `timeout`).
- `name()` / `isEnabled()` / `send()` — как в reference.

Env: `CT_ENABLE`, `CT_ROUTE_KEY`, `CT_TOKEN`, `CT_TIMEOUT`.

### TelegramChannel

API: `https://api.telegram.org/bot{TOKEN}/sendMessage` + `sendDocument`.

- `name()` → `"telegram"`
- `isEnabled()` → `enable && bot_token !== '' && chat_id !== ''`
- `send()`:
  1. `sendMessage` с текстом заявки (`parse_mode=HTML`), форматирование `<b>Новая заявка</b>\n<b>Имя:</b> ...\n<b>Телефон:</b> ...\n<b>Email:</b> ...\n<b>Сообщение:</b> ...`
  2. Для каждого файла из `$uploadedFiles` — отдельный `sendDocument` (multipart). Ошибка per-file изолируется.
- Mapping ChannelResult:
  - sendMessage OK + все файлы OK → `success(meta: {message_id, attached_files})`
  - sendMessage OK + часть файлов упала → `warning(meta: {message_id, failed_files: [...]})`
  - sendMessage упал → `failed`
- Split timeouts как у CallTouch.
- Один `TG_CHAT_ID` на deployment. Множественные чаты / per-form routing — на потом, через `project.php::telegram_routes`.

Env: `TG_ENABLE`, `TG_BOT_TOKEN`, `TG_CHAT_ID`, `TG_TIMEOUT`.

### GoogleSheetsChannel

API: `https://sheets.googleapis.com/v4/spreadsheets/{id}/values/{range}:append`.

- `name()` → `"google_sheets"`
- `isEnabled()` → `enable && file_exists($credentials_path) && spreadsheet_id !== ''`
- `send()`:
  1. Получить access_token: либо из cache (`cache/google-sheets/token.json`, TTL 50 мин), либо подписать JWT через service account и обменять на token (`oauth2.googleapis.com/token`).
  2. POST values:append с массивом ячеек.
  3. Если sheet пустой (первая запись) — сначала записать строку заголовков.

**Структура таблицы (15 колонок, фиксирована в исходнике канала):**

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| timestamp | request_id | name | phone | email | message | form_id | page_url | utm_source | utm_medium | utm_campaign | utm_content | utm_term | user_agent | ip |

Range: `{sheet_name}!A:O`, `valueInputOption=RAW`. Новое поле формы → правка baseline для всех deployments (а не per-deployment override) — соответствует content-agnostic принципу ядра.

**Credentials:**
- `config/secrets/google-service-account.json` — JSON как скачивается из Google Cloud Console.
- Путь через env `GS_CREDENTIALS_PATH=config/secrets/google-service-account.json` (относительно project_root, как другие пути в `settings.php::paths`).
- НЕ в `public/`, НЕ в `data/`.
- `.gitignore`: `config/secrets/*.json` с исключениями для `.gitkeep`, `.htaccess`, `README.md`.
- `config/secrets/.htaccess` → `Require all denied` (страховка от случайных symlinks в public).

**Зависимость:**
- `firebase/php-jwt` (~70KB) для подписи JWT. Полный `google/apiclient` (~30MB transitive deps) не тащим — нужна только подпись токена + два HTTP-запроса curl'ом.

Env: `GS_ENABLE`, `GS_SPREADSHEET_ID`, `GS_SHEET_NAME` (default `"Заявки"`), `GS_CREDENTIALS_PATH`, `GS_TIMEOUT`.

## Миграция существующего `ApiSendAction`

**Было:**

```php
public function __construct(
    private readonly MailService $mailService,
    private readonly LoggerInterface $logger,
) {}

$mailSent = $this->mailService->sendFormSubmission($data, $uploadedFiles, $requestId);
if (!$mailSent) { $this->logger->warning(...); }
```

**Стало:**

```php
public function __construct(
    private readonly NotificationDispatcher $dispatcher,
    private readonly LoggerInterface $logger,
) {}

$results = $this->dispatcher->dispatch($data, $uploadedFiles, $requestId);
$channels = [];
foreach ($results as $r) {
    $channels[$r->channel] = $r->status;
    if ($r->status === ChannelResult::STATUS_FAILED) {
        $this->logger->warning('Канал не доставил', ['channel' => $r->channel, 'message' => $r->message, 'request_id' => $requestId]);
    }
}

$payload = [
    'success' => true,
    'message' => 'Заявка успешно отправлена',
    'channels' => $channels,  // {"mail":"success","calltouch":"disabled","telegram":"success","google_sheets":"disabled"}
    'request_id' => $requestId,
];
```

`MailService` остаётся **неизменным** — `MailChannel` его тонкая обёртка.

## Регистрация каналов (`config/container.php`)

```php
MailChannel::class => \DI\autowire(),

CallTouchChannel::class => static fn (ContainerInterface $c) =>
    new CallTouchChannel($c->get(LoggerInterface::class), $c->get('settings')['calltouch'] ?? []),

TelegramChannel::class => static fn (ContainerInterface $c) =>
    new TelegramChannel($c->get(LoggerInterface::class), $c->get('settings')['telegram'] ?? []),

GoogleSheetsChannel::class => static fn (ContainerInterface $c) =>
    new GoogleSheetsChannel(
        $c->get(LoggerInterface::class),
        $c->get('settings')['google_sheets'] ?? [],
        $c->get('settings')['project_root'],
    ),

NotificationDispatcher::class => static fn (ContainerInterface $c) =>
    new NotificationDispatcher(
        [
            $c->get(MailChannel::class),
            $c->get(CallTouchChannel::class),
            $c->get(TelegramChannel::class),
            $c->get(GoogleSheetsChannel::class),
        ],
        $c->get(LoggerInterface::class),
    ),
```

## Хранение статусов доставки

**Log-only.** Каждый канал пишет в Monolog (JSON) `request_id`, `channel`, `status`, `message`, `meta` (например, `widget_request_id` для Calltouch, `message_id` для Telegram, `updated_range` для Sheets). Полную историю по конкретной заявке достаём grep'ом по `request_id` в `logs/app-*.log`.

Отдельная БД / JSON-per-submission / SQLite — **не закладываем**. Если потребуется аудит-витрина или отчёты — уйдёт в n8n или Django-часть (`CLAUDE.md`, три-компонентная схема), не в baseline.

## Решения, оставленные на потом

- **Async/parallel dispatch.** Sequential. При необходимости `ConcurrentDispatcher` (curl_multi / swoole / queue) с тем же интерфейсом — каналы не меняются.
- **Декораторы.** `RetryingChannel`, `QueuedChannel`, `MeteredChannel` оборачивают любой канал без правок самого канала.
- **Per-deployment selection / доп. каналы.** Если у клиента понадобится свой канал (например, отдельный webhook) — вводится `config/project.php::notification_channels => [WebhookChannel::class]`, factory Dispatcher собирает массив `[...baseline, ...projectChannels]`. Пока не нужно.
- **Telegram per-form routing.** Если разные формы должны идти в разные чаты — `project.php::telegram_routes => [form_id => chat_id]`. Сейчас один `TG_CHAT_ID` на deployment.
- **Sheets per-deployment columns.** Если клиенту нужна своя схема таблицы — отдельный канал или расширение через `project.php::google_sheets.extra_columns`. Сейчас 15 колонок фиксированы.

## Зависимости (`composer.json`)

Добавить:

```json
"firebase/php-jwt": "^6.10"
```

Не добавляем `google/apiclient` — тащит ~30MB transitive deps, а нужны только JWT-подпись и два HTTP-запроса (есть `curl`).

## Reference implementation

`kumho-tires.ru` ветка `feat/dealer-brand-logo`, коммит `810b6a2`:

- `src/Notification/ChannelInterface.php`
- `src/Notification/ChannelResult.php`
- `src/Notification/NotificationDispatcher.php`
- `src/Notification/Channel/MailChannel.php`
- `src/Notification/Channel/CallTouchChannel.php`
- `src/Action/ApiSendAction.php` (рефакторинг)
- `config/settings.php` (секция `calltouch`)
- `config/container.php` (Mail + CallTouch + Dispatcher)
- `.env.example` (CT_*)

PHPStan project level 5 — чисто.

**Не реализовано в reference, делается в рамках baseline-merge:** `TelegramChannel`, `GoogleSheetsChannel`, `config/secrets/`, `firebase/php-jwt` в composer, кэш токена Sheets, юнит-тесты Dispatcher.

## Acceptance для merge в baseline

- [ ] `src/Notification/ChannelInterface.php`, `ChannelResult.php`, `NotificationDispatcher.php` в baseline
- [ ] `src/Notification/Channel/MailChannel.php` + `MailChannel::isEnabled()` проверяет `MAIL_TO !== ''`
- [ ] `src/Notification/Channel/CallTouchChannel.php` (из kumho 1:1, split timeouts)
- [ ] `src/Notification/Channel/TelegramChannel.php` (sendMessage + sendDocument per-file)
- [ ] `src/Notification/Channel/GoogleSheetsChannel.php` (JWT, 15-колоночная схема, кэш токена)
- [ ] `config/settings.php` — секции `calltouch`, `telegram`, `google_sheets`
- [ ] `config/container.php` — все 4 канала + Dispatcher
- [ ] `config/secrets/{.gitkeep, .htaccess, README.md}`
- [ ] `.env.example` — `CT_*`, `TG_*`, `GS_*` с пояснениями
- [ ] `.gitignore` — `config/secrets/*.json` с исключениями
- [ ] `composer.json` — `firebase/php-jwt`
- [ ] `ApiSendAction` — рефакторинг применён, `channels: {...}` в response
- [ ] Unit-тесты: `tests/php/Unit/Notification/NotificationDispatcherTest.php` (изоляция Throwable, mapping disabled/success/warning/failed, порядок каналов в результате)
- [ ] Unit-тесты: `tests/php/Unit/Notification/ChannelResultTest.php` (4 фабрики, immutability)
- [ ] PHPStan project level — без новых ошибок
- [ ] Smoke: POST /api/send → 200, `channels.mail == success`, `channels.{calltouch,telegram,google_sheets} == disabled` (когда `*_ENABLE=false`)
- [ ] Документация: миграция этого proposal в ADR `docs/architecture/decisions/0005-notification-channel-dispatcher.md` + краткий раздел в `CLAUDE.md` (две строки в «Architecture»)
- [ ] Дистилляция: после merge — `divergence-audit` у kumho показывает `src/Notification/`, `ApiSendAction.php`, `config/{settings,container}.php` как `ready-to-sync`. Накатить sync, удалить duplicate-код из kumho.
