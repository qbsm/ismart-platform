# Improvement Log — журнал улучшений ядра

Живой документ для непрерывного улучшения iSmart Platform. Сюда пишем:

- **что найдено** при чтении/работе с кодом (дубль, длинный метод, magic-литерал, неочевидная связь)
- **что применено** (короткие записи с датой)
- **что отложено** и почему

Запись короткая, в одно-два предложения. Если запись расширяется — превращай её в задачу или ADR в `docs/architecture/decisions/`.

Правила, по которым работаем — см. [`../conventions/best-practices.md`](../conventions/best-practices.md) и [`../conventions/naming.md`](../conventions/naming.md).

---

## Applied

### 2026-05-20 — Первая волна дистилляции из kumho

- Baseline `ismart-platform` собран из `kumho-tires.ru` (тег `legacy-archive-v0` хранит старую архитектуру).
- Удалена kumho-specific интеграция Photoroom (см. [ADR-0002](../architecture/decisions/0002-photoroom-out-of-baseline.md)).
- Создан `src/Support/RespondsToContent` (trait) — устранил дубль `wantsJson()` + `withRequestIdHeader()` в HttpErrorHandler/ServerErrorHandler.
- Создан `src/Support/Arr::str/int/bool/array` — заменил приватные `extractString()` в ApiSendAction и MailService (две идентичные функции удалены).
- Создан `src/Support/RequestAttributes` — константы для magic-строк (`csrf_token`, `request_id`, `lang_code`, ...). Постепенно вытесняет литералы.
- Создан `src/Support/PlatformSettings` — типизированный доступ к ключам settings; применён в `SitemapAction` как образец.
- Создан `src/Support/Json::load / Json::loadKey` — 9 мест с дублирующимся паттерном `file_get_contents` + `json_decode` свернуты в один модуль. Заменено в DataLoaderService, SitemapAction, RedirectMiddleware, RateLimitMiddleware, Twig\AssetExtension (2 метода), Twig\DataExtension (2 метода).
- `.gitignore` `vendor/` → `/vendor/` зафикшено в baseline + kumho + italy (beepitron уже был починен).

### Распределение модулей `src/Support/` после рефакторинга

| Файл | Тип | Назначение |
|---|---|---|
| `Arr` | static utility | Типизированное извлечение из ассоциативных массивов |
| `BaseUrlResolver` | service | Резолв base URL'а с учётом прокси и языка |
| `CitySlugger` | service | Транслитерация русских городов в slug |
| `Json` | static utility | Загрузка JSON-файлов в массив (с проверкой) |
| `JsonProcessor` | static utility | Нормализация путей `data/*` в JSON-структуре в абсолютные URL |
| `PlatformSettings` | constants/accessor | Типизированный доступ к ключам `$settings` |
| `RequestAttributes` | constants | Имена атрибутов request'а и ключей |
| `RespondsToContent` | trait | `wantsJson()` + `withRequestIdHeader()` для error handlers |

### 2026-08-05 — Разбор aimika-neiro-global

- CSP: `object-src 'none'` + `form-action 'self'`; host-allowlist не вводим
  ([ADR-0012](../architecture/decisions/0012-csp-no-third-party-allowlist.md)).
- `RateLimitMiddleware::pruneExpired()` — счётчики по IP чистятся раз в ~100 запросов.
- `admin-requests-security.md` описывал классы, которых нет в ядре с дистилляции — сокращён до факта.
- Механизм переопределения CSP через `APP_CSP` сделали и в тот же день сняли: allowlist решили не
  вводить, а «ручка на будущее» без единого потребителя — лишняя ветка в конфиге.
- Из aimika не взяли: SSRF-safe fetch, storage-порт с `remove()`, AI-провайдеры с реестром моделей
  и spend-guard, защиту от prompt-injection — это про сервис с пользователями и деньгами.
  Разбор — в `docs/sessions/2026-08-05-aimika-transfer-analysis.md`.

---

## Open Opportunities

### Высокий приоритет

- **`PageAction::__invoke()` — 155 строк**. Разбить на 4 метода: `resolvePageData()`, `resolveEntity()`, `buildSeoData()`, `buildTemplateData()`. См. `src/Action/PageAction.php:47-201`. Требует тестов перед рефакторингом (entity, list, 404 ветки).
- **`PageAction::injectListItems()` — 72 строки, 3 копии цикла извлечения slug'ов**. Вынести `Support/SlugCollector::fromItems()` — это устранит дубль с `SitemapAction::buildDynamicUrls()`.
- **CSRF-логика разбросана** между `PageAction::ensureCsrfToken()`, `ApiSendAction::__invoke()` (session_start + проверка). Вынести в `Service/CsrfTokenService` с методами `ensure(): string` + `validate(string): bool`.
- **`Service/FormValidator`** — валидация формы (phone/email/policy) сейчас в `ApiSendAction::validate()`. Логика будет переиспользоваться, когда появятся другие формы.
- **`PlatformSettings` ещё не применён везде**. Места: `PageAction:53,61,70`, `LanguageMiddleware:50,57`, `TemplateDataBuilder` (через ctx). Просто заменить inline-распаковку.

### Средний приоритет

- **`RequestAttributes` ещё не применён**. Заменить literal `'csrf_token'`, `'request_id'` и т.д. в ~20 местах.
- **DI-конструкторы — разнобой**. PageAction (25-45) и SitemapAction используют классическое присваивание, ApiSendAction — promoted readonly. Унифицировать.
- ~~**`Service/SeoService` — kumho-вариант (inline)**~~ — **РЕШЕНО** в [ADR-0003](../architecture/decisions/0003-seo-builder-strategy.md): baseline принимает italy-вариант Strategy pattern (`SeoBuilderInterface` + `SeoBuilderRegistry` + `DefaultSeoBuilder`). PageAction принимает `?SeoBuilderRegistry` опционально, обратно-совместим. В работе.
- **TemplateDataBuilder::extractHeroPreloadImage() — 62 строки**. Логика adaptive images + fallback стоит вынести.
- **Unit-тесты для Support-модулей** — `Arr`, `Json`, `PlatformSettings` чистые утилиты, идеальные кандидаты на unit-coverage. Дать confidence для дальнейших рефакторингов.
- **`distill init --from <existing-deployment>`** — расширение CLI: создавать новый deployment не только из baseline, но и с overrides существующего deployment'а как стартовой точки. Use case: trazano-миграция (см. [migrations/trazano.md](migrations/trazano.md)) — `--from ../kumho-tires.ru` сразу даст архитектуру для tire-deployment'а. Кандидат на реализацию после первого реального применения паттерна (валидировать на trazano).

### Низкий приоритет (когда дойдут руки)

- **`MailService::buildHtmlBody()` — heredoc HTML** прямо в PHP. Переписать через `templates/emails/contact-form.twig`.
- **`MailService::FIELD_LABELS`** не содержит `subject` — в письме лейбл „Subject" вместо локализованного. Дополнить мапу.
- **Magic HTTP-коды (404, 500, 419, 422, 429)** разбросаны inline. Не стоит самостоятельной константной таблицы — встроенные PSR-7 коды читабельны. Но стоит закрепить _доменные_ коды в `config/errors.php` (уже есть карта 404/500, расширить).

### Naming-конвенции — оставшиеся gap'ы (после 2026-05-20 расширения)

Сейчас в `docs/conventions/` покрыто: PHP (`naming.md`), HTML, CSS, JS, Twig, JSON, Git, ENV, Routes/URLs, best-practices — 10 файлов. Что **не покрыто** и стоит добавить, когда наступит на этот gap:

- **Tests naming** — как именовать test-классы (`XxxTest`), методы (`testYy_zZz_pattern`, `should*`, `given_when_then`), fixture-файлы. Сейчас есть только эмпирическая практика из существующих тестов.
- **File / directory naming (вне `src/`)** — sessions (`YYYY-MM-DD-<topic>.md`), ADR (`NNNN-<slug>.md`), brand assets (`logo-h-color-N.svg`), `data/img/<entity>/<size>/<n>.webp`. Сейчас по факту работает, но правила не зафиксированы.
- **Composer / npm package names** — vendor/package convention (если выпускаем что-то как пакет).
- **Error / exception class names** — суффикс `Exception`, грамматика имени (`ApiKeyMissingException`, не `MissingApiKeyError`).
- **Event names** — past participle без суффикса (зафиксировано в `naming.md`), но не задокументированы конвенции payload'а событий (имена свойств, формат).
- **Image filenames** — в `guides/images.md` упоминается, но без жёстких правил. Стоит зафиксировать: `<entity-slug>-<variant>-<index>.<ext>`, ресайз-suffix через папку (`400/`, `800/`), не через имя.
- **CSS custom properties (`--name`)** — в `css-naming.md` §5 базово есть. Но нет правила про namespace (`--button-bg` vs `--bg-button`).
- **Twig blocks** — в `twig-naming.md` есть про шаблоны, но не зафиксирован формат `{% block name %}` (имя в snake_case или kebab?).
- **PHP interfaces / abstract classes** — `naming.md` упоминает Interface suffix вскользь. Зафиксировать: `*Interface` если в одной папке с реализацией, namespace-имя (без суффикса) — если в отдельной `Contract/`/`Port/` папке.

Каждый gap — кандидат на отдельный файл в `docs/conventions/` или дополнение существующего, по триггеру: реальная ситуация выбора в коде, которая требует решения.

---

## Patterns Found — повторяющиеся подходы (зафиксировать)

- **Каждый Action принимает `$request, $response` (вызов через `__invoke`)**. Не отступай — Slim ждёт callable.
- **Middleware всегда возвращает `$handler->handle($request)`** (после или до своей работы). Если возвращаем ответ напрямую — это short-circuit (rate limit, redirect).
- **`config/project.php`** — единственное место с deployment-spec. Если в чём-то «kumho» — оно живёт здесь либо в `data/json/`.
- **Twig-шаблоны рендерятся через `pages/page.twig`**, который data-driven по `sections[]`. Не создавай отдельный page-template, если можно описать через JSON-секцию.

---

## Метрика прогресса

| Дата | Кол-во CORE-классов | Строк в `src/` | Дублирующих паттернов |
|---|---|---|---|
| 2026-05-20 (initial) | 28 | ~2150 | ~250 строк дубля |
| 2026-05-20 (post-refactor) | 33 (+5 Support) | ~2000 (-150) | ~100 строк дубля (-150) |

После следующих волн ожидается: ~30 CORE-классов (часть склеится), ~1700 строк, <50 строк дубля.
