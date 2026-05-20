# iSmart Platform

Эталонная архитектура: Slim 4 + PHP-DI + Twig + JSON-контент. На ней построены italy-platform, kumho-tires.ru, bp. Канонический template — репо `ismart-platform`.

Документ — спецификация для запуска нового проекта на iSmart Platform и для понимания общих правил при поддержке существующих.

---

## 1. Тех-стек

| Слой    | Что                                      | Зачем                                              |
| ------- | ---------------------------------------- | -------------------------------------------------- |
| HTTP    | **Slim 4** (PSR-7/PSR-15)                | Тонкий router без магии; стандартные middleware    |
| DI      | **PHP-DI** + `slim-bridge`               | Autowiring, factory bindings, `ContainerInterface` |
| Шаблоны | **Twig 3** + `slim-views`                | Безопасный escape, наследование, kebab-case        |
| Email   | **Symfony Mailer**                       | Универсальный DSN (sendmail/SMTP/null)             |
| События | **league/event** (`Psr\EventDispatcher`) | PageLoaded, EntityResolved, SeoBuilt               |
| Логи    | **Monolog**                              | PSR-3, ротация                                     |
| CSS     | PostCSS + lightningcss                   | BEM, hash-naming, минификация                      |
| JS      | esbuild / webpack                        | Code splitting, hash-naming                        |
| Контент | JSON в `data/json/{lang}/`               | Read-only для приложения, версионируется в git     |
| PHP     | 8.2+ (typed props, readonly, `match`)    | Современный синтаксис, `declare(strict_types=1)`   |

Не используется: ORM, БД, очереди, контейнеры. Это **content-driven SSG-подобное** приложение с динамическим SEO/i18n.

---

## 2. Базовые принципы

1. **Контент — данные, код — поведение.** Добавление новой страницы/раздела = JSON-файл, не PHP-код.
2. **Generic-обработчики, конфиг-driven коллекции.** Один `PageAction` обслуживает все маршруты. Новый тип сущности → запись в `config/project.php`, а не правка Action.
3. **Один шаблон страницы.** `pages/page.twig` рендерит секции из `pageData.sections`. Спец-шаблоны — только для нестандартных entity-страниц (`pages/tire.twig`, `pages/news.twig`).
4. **PSR-15 везде, где про HTTP.** Любая cross-cutting логика (CORS, CSP, rate-limit, locale, redirect) — middleware.
5. **i18n из коробки.** Маршруты регистрируются парами `/path` и `/{lang}/path`; контент выбирается по `lang_code` из request attribute.
6. **SEO как first-class.** Каждая страница имеет SEO-JSON (`data/json/{lang}/seo/{page_id}.json`); для коллекций — `SeoBuilderRegistry` со своими билдерами.
7. **No trailing slash.** `/path/` → 301 → `/path` через `TrailingSlashMiddleware`.
8. **Никакого ручного include в шаблонах вне `sections/` и `components/`.** Композиция страницы — через данные, не через цепочки include в коде.

---

## 3. Структура каталогов

```
project/
├── assets/                # Исходники CSS/JS/шрифтов/иконок
│   ├── css/
│   │   ├── base/          # reset, typography, vars
│   │   ├── components/    # компоненты (по одной директории на компонент)
│   │   ├── sections/      # секции (1:1 с templates/sections/)
│   │   └── main.css       # ENTRY: импортирует всё нужное
│   ├── js/
│   │   ├── components/
│   │   ├── sections/
│   │   ├── vendor/        # сторонние неминифицированные библиотеки
│   │   └── main.js
│   └── fonts/             # webfonts
├── cache/                 # twig-кэш, rate-limit (вне git)
├── config/
│   ├── container.php      # DI bindings
│   ├── dependencies.php   # бинды зависимостей сервисов
│   ├── errors.php         # HTTP-error → шаблон
│   ├── middleware.php     # порядок middleware (см. §7)
│   ├── project.php        # collections, route_map, sitemap_pages (project-specific)
│   ├── routes.php         # регистрация маршрутов Slim
│   ├── settings.php       # пути, языки, twig, mail, rate_limit
│   └── redirects.json     # 301-редиректы (exact + prefix-based)
├── data/
│   ├── json/
│   │   ├── global.json    # nav, contacts, lang, footer
│   │   └── {lang}/
│   │       ├── pages/     # {page_id}.json — layout страницы
│   │       ├── seo/       # {page_id}.json — title, meta, json_ld
│   │       └── {entity}/  # коллекции: {slug}.json
│   ├── img/, video/, uploads/   # медиа (симлинк из public/data)
│   └── schema/            # JSON-схемы для валидации
├── docs/
│   ├── architecture/      # эта папка
│   └── guides/            # how-to (page-add, seo-add, naming)
├── logs/                  # вне git
├── public/                # DocumentRoot веб-сервера
│   ├── index.php          # bootstrap (require Slim app)
│   ├── .htaccess          # rewrite на index.php
│   ├── robots.txt
│   ├── assets → ../assets # симлинк
│   └── data → ../data     # симлинк
├── src/
│   ├── Action/            # PageAction, ApiSendAction
│   ├── Event/             # PageLoaded, EntityResolved, SeoBuilt
│   ├── EventListener/     # подписчики
│   ├── Handler/           # HttpErrorHandler, ServerErrorHandler
│   ├── Middleware/        # PSR-15
│   ├── Service/           # DataLoaderService, SeoService, …
│   ├── Support/           # утилиты (BaseUrlResolver, JsonProcessor)
│   └── Twig/              # AssetExtension, UrlExtension, DataExtension
├── templates/
│   ├── base.twig          # <head>, <body>, скрипты, метаданные
│   ├── pages/
│   │   ├── page.twig      # generic: рендерит pageData.sections
│   │   └── {entity}.twig  # для коллекций с явным template
│   ├── sections/          # секция = независимый блок страницы
│   └── components/        # переиспользуемые куски (карточки, кнопки)
├── tools/
│   ├── build/             # css-hash, setup-public-links
│   ├── scaffold/          # create-component, create-section, create-page
│   └── ops/               # validate-json, generate-favicons
├── .env.example
├── composer.json
├── package.json
└── webpack.config.js / postcss.config.js
```

---

## 4. Bootstrap (entry point)

```php
// public/index.php
<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

$container = (require __DIR__ . '/../config/container.php')();
\Slim\Factory\AppFactory::setContainer($container);
$app = \DI\Bridge\Slim\Bridge::create($container);

(require __DIR__ . '/../config/middleware.php')($app);
(require __DIR__ . '/../config/routes.php')($app);

$app->run();
```

Никакой инициализации в `index.php` сверх этого — всё через DI/middleware.

---

## 5. PageAction — generic-обработчик

Один `PageAction::__invoke(ServerRequestInterface $request, ResponseInterface $response)` обслуживает большинство маршрутов. Логика:

```
segments  = route attribute (без {lang}-префикса, нормализовано LanguageMiddleware)
pageId    = segments[0] либо route_map lookup
routeParams = остаток segments

1. Загрузить pageData = data/json/{lang}/pages/{pageId}.json
2. Если pageData нет — попробовать segments[0] как entity slug по всем коллекциям (Кейс A)
3. Если pageData есть — пройти коллекции, у которых list_page_id == pageId.
   Если есть routeParams[0] — резолвить вложенный entity (Кейс B)
4. Generic inject: для каждой section в pageData.sections, чьё имя совпадает
   с nav_slug коллекции (или его *-list / *-container / *-slider),
   подгрузить items коллекции в section.data.items (с опциональной сортировкой)
5. Загрузить SEO: data/json/{lang}/seo/{pageId}.json или собрать через SeoBuilderRegistry для entity
6. Render: pages/page.twig (или collection.template) + extras (entity, breadcrumb)
```

Расширение поведения — только через config (`config/project.php`):

- `'collections' => [...]` — типы сущностей
- `'route_map' => ['old' => 'new']` — алиасы page_id

Спец-логика per-collection (не правя Action):

| Поле коллекции                         | Эффект                                             |
| -------------------------------------- | -------------------------------------------------- |
| `data_dir`                             | `data/json/{lang}/{data_dir}/`                     |
| `nav_slug`                             | URL-сегмент (`/foo`)                               |
| `list_page_id`                         | `pages/{list_page_id}.json` — layout list-страницы |
| `slugs_page`                           | где лежат slug'и (по умолчанию = `nav_slug`)       |
| `slugs_source`                         | ключ внутри slugs_page (`items`)                   |
| `item_key`                             | внутренний ключ entity-данных (`item`/`news`/…)    |
| `extras_key`                           | имя в Twig-extras                                  |
| `entity_url_pattern`                   | для breadcrumb / canonical                         |
| `template`                             | спец-шаблон страницы entity (kumho-style)          |
| `og_type`                              | для og:type метатега                               |
| `sort_by` / `sort_format` / `sort_dir` | сортировка items при inject                        |

---

## 6. DataLoaderService

Один сервис, четыре метода:

```php
loadGlobal($globalPath, $baseUrl): array              // global.json
loadPage($pagesDir, $pageId, $baseUrl): ?array        // pages/{id}.json
loadSeo($jsonBaseDir, $lang, $pageId, $baseUrl): ?array
loadEntitySlugs($jsonBaseDir, $lang, $config): ?array // pages/{slugs_page}.json:items
loadEntity($jsonBaseDir, $lang, $slug, $baseUrl, $config): ?array
```

Все методы возвращают `null` для отсутствующих файлов (не throw), JSON-ошибки → `null`. Паблик-методы НЕ кэшируют — кэш Twig + opcache достаточны.

`JsonProcessor::processJsonPaths($data, $baseUrl)` пост-обрабатывает загруженный JSON: разворачивает `{baseUrl}` в значения, нормализует пути.

---

## 7. Middleware stack (порядок критичен)

`config/middleware.php`:

```php
return static function (App $app): void {
    $container = $app->getContainer();

    $app->add(RequestDurationMiddleware::class);
    $app->add(CorrelationIdMiddleware::class);
    $app->add(SecurityHeadersMiddleware::class);
    $app->add($container->get(CorsMiddleware::class));
    $app->addBodyParsingMiddleware();
    $app->add($container->get(RateLimitMiddleware::class));
    $app->add(LanguageMiddleware::class);

    $app->addRoutingMiddleware();   // ← ДО Redirect / TrailingSlash

    $app->add(RedirectMiddleware::class);
    $app->add(TrailingSlashMiddleware::class);

    $errorMiddleware = $app->addErrorMiddleware($displayErrorDetails, true, true);
    $errorMiddleware->setErrorHandler(HttpException::class, $container->get(HttpErrorHandler::class), true);
    $errorMiddleware->setDefaultErrorHandler($container->get(ServerErrorHandler::class));
};
```

Slim 4: «last added = outermost = runs first».

| Middleware                  | Что делает                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `RequestDurationMiddleware` | Записывает time-to-response в логи                                                                    |
| `CorrelationIdMiddleware`   | `X-Correlation-Id` для трассировки                                                                    |
| `SecurityHeadersMiddleware` | CSP, HSTS, X-Frame-Options, Permissions-Policy                                                        |
| `CorsMiddleware`            | Pre-flight + Access-Control-\* для API                                                                |
| `BodyParsingMiddleware`     | JSON/form-data → `$request->getParsedBody()`                                                          |
| `RateLimitMiddleware`       | По IP, файловое хранилище в `cache/rate_limit/`                                                       |
| `LanguageMiddleware`        | Резолвит lang_code из URL/headers, кладёт в request attribute, грузит `global.json`                   |
| `RoutingMiddleware`         | Slim: матчинг маршрута. **Бросает 404 для незарегистрированных путей** — поэтому ставится до Redirect |
| `RedirectMiddleware`        | 301-редиректы (exact + prefix-based) из `redirects.json`                                              |
| `TrailingSlashMiddleware`   | `/path/` → 301 → `/path`                                                                              |

Если `addRoutingMiddleware()` зарегистрировать ПОСЛЕ `Redirect`/`TrailingSlash`, RoutingMiddleware становится outermost и кидает 404 на пути `/img/*` ДО того, как `RedirectMiddleware` успевает их редиректнуть. Симптом: префиксные SEO-редиректы возвращают 404.

---

## 8. URL-политика

- **Без trailing slash.** `/about` каноничен; `/about/` → 301.
- **Префиксные редиректы** для миграции медиа/разделов: `{"from_prefix": "/img/", "to_prefix": "/data/img/", "status": 301}`.
- **Lang в URL.** `/en/foo` для не-дефолтного языка; дефолтный (`ru`) — без префикса. `LanguageMiddleware` определяет режим.
- **Canonical** в `<head>`: `base_url + seo_url_path` (для коллекций — через extras + reverse `route_map`).

`hreflang`-теги генерятся в `base.twig` из `available_langs` settings.

---

## 9. Multilang

Конфиг (`config/settings.php`):

```php
'default_lang' => 'ru',
'available_langs' => [
    'ru' => ['code' => 'ru', 'title' => 'Русский', 'iso' => 'ru-RU'],
    'en' => ['code' => 'en', 'title' => 'English', 'iso' => 'en-US'],
],
'paths' => [
    'json_base'       => $projectRoot . '/data/json',
    'json_pages_dir'  => $projectRoot . '/data/json/{lang}/pages',  // {lang} подставляется
    'json_global'     => $projectRoot . '/data/json/global.json',
    'redirects'       => $projectRoot . '/config/redirects.json',
],
```

Routes регистрируются дважды:

```php
foreach ($pages as $p) {
    $app->get('/' . $p, PageAction::class);
    $app->get('/en/' . $p, PageAction::class);
}
```

Twig-globals: `lang_code`, `current_lang`, `is_lang_in_url`, `available_langs`.

---

## 10. SEO pipeline

1. **Static SEO** — `data/json/{lang}/seo/{page_id}.json`:
   ```json
   {
     "title": "About — Brand",
     "meta": [
       { "name": "description", "content": "..." },
       { "property": "og:title", "content": "..." }
     ],
     "json_ld": { "@context": "schema.org", "@type": "Organization", "name": "..." }
   }
   ```
2. **Dynamic SEO для коллекций** — `SeoBuilderInterface::build($entity, $baseUrl, $lang, $config, $global)`. Реализации регистрируются в `SeoBuilderRegistry` через DI. Для коллекций без явного билдера — generic fallback в `PageAction::buildSeoForEntity()`.
3. **Twig-обработка** — `SeoService::processTemplates($seoData, $context, $twigEnv)` рендерит `{{ ... }}` внутри значений seoData (для шаблонизации title, например `"{{ entity.item.title }} — Brand"`).
4. **Render** — `base.twig` выводит title, meta, link[rel=canonical], hreflang, JSON-LD.

Никаких `Schema.org`-микроданных через атрибуты HTML. Только JSON-LD.

---

## 11. Twig

### base.twig

Содержит весь `<head>`, подключение CSS/JS (через `assetUrl()` extension с hash-именами), `<body>` с `{% block content %}`.

```twig
<!doctype html>
<html lang="{{ current_lang.iso }}">
<head>
  {% include 'partials/head-meta.twig' %}
  <link rel="stylesheet" href="{{ assetUrl('main.css', 'css', true) }}">
  ...
</head>
<body class="page-{{ pageData.name | default(page_id) }}">
  {% block content %}{% endblock %}
</body>
</html>
```

### pages/page.twig (generic)

```twig
{% extends 'base.twig' %}
{% block content %}
<div id="page-content">
  {% if sections is defined and sections|length > 0 %}
    {% for section in sections %}
      {% if section.visible is not defined or section.visible %}
        {% include 'sections/' ~ section.name ~ '.twig' ignore missing with {'data': section.data} %}
      {% endif %}
    {% endfor %}
  {% endif %}
</div>
{% endblock %}
```

### sections/

Один файл = одна секция. Соответствие 1:1 с CSS-папкой `assets/css/sections/{name}/`. Имена в kebab-case.

### components/

Переиспользуемые куски. Включаются через `{% include 'components/card-news.twig' with {'item': item} %}`.

### Twig globals

- `global` — содержимое `data/json/global.json` (nav, contacts, footer, lang)
- `pageData`, `seoData` — текущая страница
- `lang_code`, `current_lang`, `available_langs`, `is_lang_in_url`
- `route_params`, `base_url`, `csrf_token`
- `extras` — entity-специфичное (для коллекций: `entity`, `extras_key` ключ, `breadcrumb`)

---

## 12. Asset pipeline

### CSS

- Источник: `assets/css/main.css` импортирует `base/`, `components/`, `sections/` в нужном порядке
- PostCSS → lightningcss минификация → `public/assets/css/build/main.{hash}.css`
- Twig-функция `assetUrl('main.css', 'css', true)` подставляет hash-версию

BEM-нейминг: `block`, `block__element`, `block__element--modifier`. Один блок = одна папка в `assets/css/sections/{block}/` с файлами `card.css`, `index.css` и т. д.

### JS

- `assets/js/main.js` собирает entry, отдельные секции загружаются через динамические `import()` если требуется
- Шаблоны общаются с JS через классы-хуки `js-foo` (НЕ те же, что BEM-классы стилей)

### Симлинки

- `public/assets` → `../assets` (для DEV)
- `public/data` → `../data` (всегда)

В prod билде в `public/` копируется только `build/` для CSS/JS, а data симлинком.

---

## 13. CSP / security headers

`SecurityHeadersMiddleware` пишет:

| Header                      | Значение                                                    |
| --------------------------- | ----------------------------------------------------------- |
| `Content-Security-Policy`   | См. ниже                                                    |
| `X-Content-Type-Options`    | `nosniff`                                                   |
| `X-Frame-Options`           | `SAMEORIGIN`                                                |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                           |
| `Permissions-Policy`        | `geolocation=(), microphone=(), camera=()`                  |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` (если HTTPS) |

CSP — два профиля:

**Узкий (без внешних скриптов):**

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
...
```

**Широкий (внешние https-источники: Yandex.Метрика, api-maps.yandex.ru, smartcaptcha.yandexcloud.net, Google Analytics):**

```
default-src 'self' https:;
script-src 'self' 'unsafe-inline' https:;
style-src 'self' 'unsafe-inline' https:;
font-src 'self' https:;
connect-src 'self' https: wss:;
...
```

Расширяйте до широкого ТОЛЬКО если в проекте подключаются внешние https-скрипты. Иначе оставляйте узкий.

---

## 14. Error handling

`HttpErrorHandler` (404/405/etc.) → рендерит соответствующий `pages/{code}.twig` (`pages/404.twig`).  
`ServerErrorHandler` (Exception) → пишет в Monolog + 500-страницу.

Конфиг ошибок в `config/errors.php`:

```php
return [
    404 => 'pages/404.twig',
    405 => 'pages/405.twig',
    500 => 'pages/500.twig',
];
```

В `dev` окружении (`twig.debug == true`) `displayErrorDetails` включается — Slim показывает stack trace.

---

## 15. События (league/event)

```php
PageLoaded($pageId, $langCode, $pageData, $status)
EntityResolved($entityType, $slug, $entity, $config)
SeoBuilt($pageId, $seoData, $hasEntity)
```

Подписчики в `src/EventListener/`. Регистрируются через DI:

```php
EventDispatcherInterface::class => function ($c) {
    $dispatcher = new \League\Event\EventDispatcher();
    $dispatcher->subscribeTo(PageLoaded::class, $c->get(PageLoadedListener::class));
    return $dispatcher;
},
```

Использование: метрики, кэш-инвалидация, обогащение данных. **Не для** изменения response (это middleware).

---

## 16. CSRF / Forms / Mailer

- CSRF: `PageAction::ensureCsrfToken()` кладёт токен в сессию, `csrf_token` доступен в Twig. Форма HTML включает `<input type="hidden" name="_csrf" value="{{ csrf_token }}">`.
- API-эндпоинт `POST /api/send` (`ApiSendAction`) проверяет:
  1. CSRF-токен совпадает с сессионным.
  2. Yandex.SmartCaptcha валидна (если настроена).
  3. Rate limit (10 req / 60s по IP, см. `rate_limit_api_send` в settings).
- Mailer: Symfony Mailer DSN из env (`MAILER_DSN=smtp://...` или `sendmail://default`). Конфиг `mail.to / mail.from / mail.from_name / mail.subject_prefix` в settings.

---

## 17. Rate limiting

`RateLimitMiddleware` — простой counter по IP в `cache/rate_limit/{ip-hash}.json` (без БД). Применяется только к POST-маршрутам, для которых это сконфигурировано (через DI bind).

Конфиг:

```php
'rate_limit_api_send' => ['max_requests' => 10, 'window_seconds' => 60],
```

---

## 18. Конфиг: settings.php vs project.php

**`settings.php`** — общий каркас (одинаковый между проектами):

- пути (paths)
- языки (default_lang, available_langs)
- twig (cache, debug)
- mail
- rate_limit
- cors

**`project.php`** — проект-специфичное (грузится из settings.php через `require`):

- collections
- route_map
- sitemap_pages
- integrations (analytics IDs, captcha sitekey)

Если делите неправильно — community-projects будут трогать settings.php при добавлении коллекций, что усложняет synchronization core-логики.

---

## 19. Нейминг (общие правила)

Полные гайды: `docs/guides/css-naming.md`, `twig-naming.md`, `html-naming.md`, `json-naming.md`, `js-naming.md`.

Шорт:

| Уровень         | Правило                                                                              |
| --------------- | ------------------------------------------------------------------------------------ |
| Имена файлов    | kebab-case (`card-news.twig`, `news-list.css`)                                       |
| BEM-классы      | `block__element--modifier`                                                           |
| CSS-переменные  | `--color-1`, `--md` (с `@custom-media`)                                              |
| JS-хуки         | `js-foo` (не пересекаются со стилевыми классами)                                     |
| Twig-переменные | snake_case (`page_id`, `lang_code`)                                                  |
| JSON-ключи      | kebab-case в URL/slug, snake_case в payload (`category_id`, `og_type`)               |
| PHP-классы      | PascalCase, suffix по роли (`PageAction`, `DataLoaderService`, `RedirectMiddleware`) |
| PHP-методы      | camelCase (`loadEntity`, `processTemplates`)                                         |

---

## 20. Когда что добавлять

| Задача                            | Куда                                                                                                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Новая статичная страница (`/foo`) | `data/json/{lang}/pages/foo.json` + `data/json/{lang}/seo/foo.json`; зарегистрировать в `routes.php` (или авто-цикл по списку)                                                                              |
| Новый тип сущности (collection)   | `config/project.php`: `'collections' => ['foo' => [...]]` (см. §5). Если нужен спец-шаблон — `pages/foo.twig` + `'template' => 'pages/foo.twig'`                                                            |
| Новая секция                      | `templates/sections/{name}.twig` + `assets/css/sections/{name}/` + (опционально) `assets/js/sections/{name}.js`. Использование: добавить блок `{name, visible, data}` в `pageData.sections` нужной страницы |
| Новый компонент                   | `templates/components/{name}.twig` + `assets/css/components/{name}/`. Включается через `{% include %}`                                                                                                      |
| Новый язык                        | Запись в `available_langs`; создать `data/json/{newlang}/{pages,seo,...}/`; обновить routes-цикл; убедиться, что `LanguageMiddleware` его видит                                                             |
| Новый редирект                    | `config/redirects.json`: `{"from": "/old", "to": "/new", "status": 301}` или `{"from_prefix": "/old/", "to_prefix": "/new/", "status": 301}`                                                                |
| Новое внешнее API                 | Расширить CSP в `SecurityHeadersMiddleware`; добавить URL в `csp_extra_origins` если нужны явные origin'ы                                                                                                   |
| Новый формат события              | `src/Event/{Name}Event.php` + listener в `src/EventListener/`; регистрация в DI                                                                                                                             |

---

## 21. Pitfalls (типовые грабли)

1. **Middleware order.** `addRoutingMiddleware()` ПОСЛЕ user middleware → префиксные редиректы 404'ятся (см. §7).
2. **Data migration с дублирующимися id.** Если legacy id повторяются (per-category), при flat-миграции в `{id}.json` файлы перезатирают друг друга. Используйте составной slug `{cat_id}-{id}`. Всегда сверяйте `count(legacy_items) == count(new_files)` в скрипте миграции.
3. **CSP блокирует внешние скрипты молча.** Симптом: «Yandex.Метрика не работает», «карта не показывается». Чек: DevTools → Console → ищите `Refused to load … because it violates the following Content Security Policy`.
4. **Captcha + defer.** `<script defer>` для captcha.js + `<script>` без defer для form.js → form.js видит `window.smartCaptcha === undefined`. Либо обоим defer, либо обоим без defer.
5. **PageAction перезатирает sections при entity-резолюции.** Для bp-style (детальный layout с секциями) НЕ обнуляйте `pageData.sections` — сохраняйте из загруженного `pages/{list_page_id}.json`. Для kumho-style (явный template) — обнуляйте.
6. **Twig `merge` на не-массиве.** Если `pageData.items` — массив строк, не объектов, `inner | merge({...})` упадёт. Чек `is_array($items[0])` перед merge.
7. **Trailing slash через 2 hop'а.** `/foo/` (с slash) → 301 → `/foo` (TrailingSlash) → 301 → `/foo` куда-то ещё (RedirectMiddleware). Это OK для SEO, но пишите prefix-правила без trailing slash (`/img/`, не `/img//`).
8. **Сессии и CLI.** `PageAction::ensureCsrfToken()` вызывает `session_start()`. В CLI-тестах это даёт `Warning: session_start(): Cannot start after headers`. Не критично, но шумит.
9. **Симлинки в публичной папке.** При деплое через rsync/FTP убедитесь, что `public/data` и `public/assets` создаются как симлинки, а не как пустые директории.
10. **Cache twig в dev.** При `twig.debug = true` авто-reload включается, но кэш `cache/twig/` всё равно может «залипать» при глубоких include. `rm -rf cache/twig/` решает.

---

## 22. Запуск нового проекта (быстрый чек-лист)

1. `composer create-project` или клон template-репозитория (если есть).
2. `cp .env.example .env`, заполнить `MAILER_DSN`, `APP_ENV`.
3. `composer install`, `npm install`.
4. `npm run build` — соберёт CSS/JS в `public/assets/build/`.
5. `php tools/build/setup-public-links.php` — создаст `public/data` и `public/assets` симлинки.
6. Запустить локальный сервер на `public/` (Valet, `php -S`, nginx).
7. Адаптировать `config/project.php` (collections, route_map). `config/settings.php` НЕ трогать (общий каркас).
8. Заполнить `data/json/global.json` и пару страниц в `data/json/ru/pages/` и `data/json/ru/seo/`.
9. Пройти `docs/guides/page-add.md` для добавления первой страницы.
10. Пройти `docs/guides/local-setup.md` для проверки окружения (typecheck, validate-json, smoke).

---

## 23. Совместимость и эволюция

- **PHP 8.2 → 8.5+.** Используем readonly/promoted props/match. Не обновляйте до experimental-версий PHP — Twig/Slim тестируются на stable.
- **Slim 4 → 5.** При выходе Slim 5 апгрейд — отдельной веткой. Pre-checks: middleware-сигнатуры, route-сигнатуры, error handling.
- **Backwards compat.** Не оставляем `// removed` комментарии и переименованные `_var`. Если что-то выпиливаем — выпиливаем целиком.

---

## 24. См. также

- `docs/guides/multi-project-sync.md` — правила синхронизации между несколькими экземплярами этой архитектуры.
- `docs/guides/page-add.md`, `seo-add.md` — пошаговые инструкции для типовых задач.
- `docs/guides/css-naming.md`, `twig-naming.md`, `html-naming.md`, `json-naming.md`, `js-naming.md` — нейминг.
- `docs/architecture/structure.md` — короткий обзор структуры каталогов.
- `docs/architecture/config.md` — детали settings.php.
- `docs/architecture/images.md` — обработка изображений.
- `docs/architecture/performance-metrics.md` — метрики и бюджеты.
