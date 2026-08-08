# Миграция: legacy iSmart-boilerplate → ismart-platform

Подробный пошаговый гайд переноса существующих iSmart-сайтов с legacy-стека (`dev/+project/`, gulp, vanilla PHP, Twig 1.x) на текущий baseline `ismart-platform` (Slim 4 + Twig 3 + scaffold + sections-architecture).

Гайд универсальный — рассчитан на любой legacy-сайт студии (armstrong, doublestar, landsail, авто-дилерские service.*/sales.*, trazano-orig, mirage-orig и т.п.).

> Связано: [ADR-0005](../architecture/decisions/0005-notification-channel-dispatcher.md), [ADR-0006](../architecture/decisions/0006-manifest-driven-images.md), [ADR-0007](../architecture/decisions/0007-raw-source-picture.md), [ADR-0008](../architecture/decisions/0008-multi-deployment-docs.md), [ADR-0009](../architecture/decisions/0009-css-js-deployment-local.md), [platform-reference](../architecture/platform-reference.md).

---

## 0. TL;DR

Boilerplate (legacy iSmart) → platform (Slim 4 baseline) — это:

- **path mapping** (`templates/parts/` → `templates/sections/`, `dev/src/components/X/X.css` → `assets/css/sections/X.css`, `data/content/` → `data/json/{lang}/`)
- **JSON формат**: flat-page → `sections: [{name, visible, data}]`
- **Routing**: vanilla `index.php` switch → Slim 4 `PageAction` + `config/project.php :: collections/route_map`
- **Forms**: `form.php` (Guzzle + Ismart\Form\Form) → `ApiSendAction` + `NotificationDispatcher` (4 channels)
- **Templates**: Twig 1.x → Twig 3, `layout.twig` → `base.twig`, удалить critical-twigs
- **Images**: hardcode `data/img/X/Y.webp` → raw-source contract + manifest gating
- **CSS/JS**: gulp+webpack → npm scripts (postcss + webpack 5 + code splitting)
- **Anti-patterns** к удалению: inline `<style>`, CDN-script-теги, `vendor/` коммит, `data/production/X-production.json` слой, mixed-bag globals

Объём миграции — обычно **3-7 дней** на сайт (зависит от количества секций и custom-логики). См. `§12 Step-by-step checklist` ниже.

---

## 1. Anatomy: legacy boilerplate vs platform

### 1.1 Legacy iSmart-boilerplate

```
<deployment>/
├── dev/                          # build sources, отдельная папка
│   ├── package.json              # gulp + webpack + ismart-gulp.js
│   ├── webpack.config.js
│   ├── gulpfile.js
│   ├── composer.json             # twig 1.x, guzzlehttp/guzzle, ismart/form
│   └── src/
│       ├── components/{name}/    # BEM-папка-на-компонент: name.css + name.js
│       ├── pages/{name}/         # page-specific CSS (включая X-critical.css)
│       └── assets/               # static (fonts, vendor.js)
└── project/                      # runtime
    ├── index.php                 # vanilla router (uri parse, switch by $page_name)
    ├── form.php                  # form submit (Guzzle CallTouch + Ismart\Form\Form)
    ├── json.php / read-json.php  # JSON read helpers
    ├── copy.php                  # admin/копирование
    ├── config.php                # paths, mail
    ├── .htaccess                 # rewrite на index.php
    ├── vendor/                   # composer install committed
    ├── cache/twig/               # Twig 1.x cache
    ├── data/
    │   ├── content/{page}.json   # source content (1 язык)
    │   ├── production/{page}-production.json   # post-build content
    │   ├── img/                  # медиа
    │   └── docs/                 # PDF
    ├── assets/                   # built CSS+JS (gulp out)
    ├── templates/
    │   ├── layout.twig           # base wrapper
    │   ├── pages/{name}.twig     # page template
    │   └── parts/{name}.twig     # компонент/секция (BEM)
    └── logs/
```

**Соглашения boilerplate (совпадают с platform):**

- BEM-классы: `section`, `section__item`, `section__subitem`, `card`, `card__item`, `card__title`, `card__line`
- kebab-case в filenames и CSS-classes (`cookie-panel`, `articles-list`)
- JS-хуки `.js-X` (`.js-profit`, `.js-show-modal`)
- Container pattern: `<section class="X"><div class="container">...</div></section>`
- Animation: `animate__animated animate__fadeInUp` (Animate.css)
- Utility classes: `.uppercase`, `.text-center`, `.nowrap`, `.height-N`, `.width-N`, `.bg-color-N`, `.opacity-N` (iSmart-utility-стек)
- Twig: `{{ data.X | raw }}`, `{% for item in data.items %}`, `{% include 'parts/X.twig' %}`

**Соглашения boilerplate (требуют адаптации к platform):**

- `templates/parts/` (под platform: `templates/sections/`)
- `dev/src/components/X/X.css` (под platform: `assets/css/sections/X.css`)
- `data/content/{page}.json` flat (под platform: `data/json/{lang}/pages/{page}.json` с sections-форматом)
- `templates/layout.twig` (под platform: `templates/base.twig`)
- Twig 1.x синтаксис `Twig_Loader_Filesystem`, `Twig_Environment` (под platform: `Twig\Loader\FilesystemLoader`, `Twig\Environment`)
- inline `style="background-image: url(...)"` (под platform: CSS-классы или `picture.twig`)
- CDN `<script>`-теги Swiper/GLightbox/Animate (под platform: npm + webpack ui-vendors chunk)
- vanilla `index.php` router (под platform: Slim 4 + middleware)
- `form.php` + Guzzle (под platform: `ApiSendAction` + `NotificationDispatcher` + Symfony HttpClient)
- 1 язык (под platform: `data/json/{lang}/` + `LanguageMiddleware`)

### 1.2 Platform (ismart-platform)

См. [docs/architecture/platform-reference.md](../architecture/platform-reference.md) — главный референс. Кратко:

```
<deployment>/
├── public/                       # DocumentRoot
│   ├── index.php                 # Slim bootstrap
│   ├── .htaccess
│   ├── assets → ../assets        # symlink
│   └── data → ../data            # symlink
├── src/                          # PHP (Action, Service, Middleware, Notification, Twig)
├── config/
│   ├── settings.php              # core
│   ├── project.php               # deployment-specific (collections, route_map)
│   ├── container.php             # DI
│   ├── routes.php
│   ├── middleware.php
│   └── redirects.json
├── data/
│   ├── json/
│   │   ├── global.json           # nav, contacts, langs, forms
│   │   └── {lang}/
│   │       ├── pages/{page}.json # sections-format
│   │       ├── seo/{page}.json
│   │       └── {collection}/{slug}.json
│   └── img/
│       └── X/raw/Y.webp          # raw-source contract (ADR-0007)
├── assets/                       # CSS/JS sources (deployment-local, ADR-0009)
│   ├── css/{base,components,sections}/
│   └── js/{components,sections}/
├── templates/
│   ├── base.twig                 # head/body wrapper
│   ├── pages/page.twig           # generic sections-driven renderer
│   ├── pages/{entity}.twig       # collection-specific
│   ├── sections/{name}.twig
│   └── components/{name}.twig
├── tools/
│   ├── distill/                  # sync с baseline
│   ├── orchestrator/             # cross-deployment analysis
│   ├── build/                    # css-hash, setup-public-links, build-images
│   ├── scaffold/                 # create-* generators
│   └── ops/                      # validate-json, etc.
├── tests/{php,js,smoke}/
├── docs/                         # baseline + deployment-specific (ADR-0008)
├── composer.json
├── package.json
└── webpack.config.cjs
```

---

## 2. Pre-migration inventory

Перед началом миграции — собрать инвентарь legacy-сайта.

### 2.1 Pages inventory

```bash
cd <legacy-deployment>/project
ls data/content/ | grep -v production | sed 's/\.json$//' | sort > /tmp/pages.txt
# Также проверить — какие $page_name возможны в index.php
grep -oE '\$page_name == ["\x27]([a-z0-9-]+)' index.php
```

Заметить:
- какие страницы статичные (about, contacts, guarantee)
- какие — entity-страницы (product, article)
- какие — list-страницы коллекций (catalog, articles)
- 404, 500, sitemap.xml

### 2.2 Templates inventory

```bash
ls templates/parts/ > /tmp/parts.txt
ls templates/pages/ > /tmp/pages-tw.txt
```

Заметить:
- какие parts — секции (intro, range, about, digits, articleslist) → пойдут в `templates/sections/`
- какие — компоненты (card, modal, form) → пойдут в `templates/components/`
- какие — critical (`X-critical.twig`) → **удалить**, в platform critical-CSS не используется
- какие — page-template (`pages/X.twig`) → большинство сводятся к `pages/page.twig` через sections-формат, только entity-страницы (`pages/tire.twig`, `pages/news.twig`) остаются специальными

### 2.3 Components inventory (dev/src)

```bash
cd <legacy-deployment>/dev/src
ls components/ > /tmp/components.txt
ls pages/ > /tmp/css-pages.txt
```

Каждой папке `components/{X}/` соответствует `X.css` + `X.js`. Это пойдёт в `assets/css/sections/X.css` + `assets/js/sections/X.js` (или `assets/css/components/X.css` если это reusable-компонент).

### 2.4 Data inventory

```bash
ls data/content/ > /tmp/data-content.txt
ls data/img/ > /tmp/data-img.txt
# Проверить mixed-bag globals
grep -l "globals" data/content/*.json
```

Заметить:
- какие JSON-файлы — pages (один файл = одна страница)
- есть ли `seo.json` (один файл со всеми SEO) → разнесём по страницам
- есть ли `globals` bag в `index.json` (nav, brand, articles, models, types, contacts) → разнесём в `global.json` + коллекции
- какие папки в `data/img/` — какие коллекции (`articles`, `models`/`tires`, `dealers`, `restaurants`)

### 2.5 Forms inventory

Открыть `project/form.php` и записать:
- какие поля формы (`$_POST` ключи)
- какие каналы отправки (mail, CallTouch, Telegram, Google Sheets, custom)
- какие env-переменные/секреты используются (CallTouch routeKey/accessToken, Telegram tokens)
- какие emailRecipients (захардкожены или из JSON)

### 2.6 Integrations inventory

- Yandex.Метрика ID
- Yandex.SmartCaptcha sitekey/secret
- Yandex.Maps API key
- Google Analytics
- Calltouch
- Любые другие external scripts в `layout.twig`

---

## 3. Skeleton creation

Создать deployment-папку на baseline-архитектуре.

```bash
cd <baseline-platform>
npm run create-deployment -- <deployment-slug>
```

Это создаст `deployments/<deployment-slug>/` (или клонирует репо если так настроен скрипт). Альтернатива — клонировать существующий deployment (kumho/italy/beepitron) как template и переименовать.

После создания:

```bash
cd ../<deployment-slug>
cp config/project.php.dist config/project.php
cp .env.example .env
```

В `.env` заполнить:

```
APP_ENV=development
APP_BASE_URL=http://<deployment-slug>.test
APP_LOCALE=ru
MAIL_DSN=sendmail://default
MAIL_TO=info@<domain>
MAIL_FROM=noreply@<domain>
MAIL_FROM_NAME=<Brand>
CALLTOUCH_ROUTE_KEY=
CALLTOUCH_ACCESS_TOKEN=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
GOOGLE_SHEETS_ID=
GOOGLE_CREDENTIALS_PATH=
```

---

## 4. Path mapping

Опорная таблица для всех последующих шагов.

| Legacy boilerplate | Platform |
|---|---|
| `project/templates/parts/X.twig` | `templates/sections/X.twig` |
| `project/templates/pages/X.twig` (generic content) | удалить, заменить на `pages/page.twig` через sections |
| `project/templates/pages/{entity}.twig` (продукт/статья) | `templates/pages/{entity}.twig` + collection block в `config/project.php` |
| `project/templates/layout.twig` | `templates/base.twig` |
| `project/templates/parts/X-critical.twig` | удалить — critical CSS не используется (preload + cssnano) |
| `project/templates/parts/header.twig`, `footer.twig`, `cookie-panel.twig` | `templates/sections/header.twig`, `footer.twig`, `cookie-panel.twig` (уже есть в baseline) |
| `dev/src/components/X/X.css` | `assets/css/sections/X.css` (если секция) или `assets/css/components/X.css` (если компонент) |
| `dev/src/components/X/X.js` | `assets/js/sections/X.js` или `assets/js/components/X.js` |
| `dev/src/pages/X/X.css` | импортить в `assets/css/main.css` если нужно, либо разнести в sections |
| `dev/src/pages/X/X-critical.css` | удалить |
| `dev/src/assets/js/*.js` | `assets/js/vendor/` если действительно vendor, иначе разнести по components/sections |
| `project/data/content/{page}.json` (flat) | `data/json/ru/pages/{page}.json` (sections-format) |
| `project/data/content/seo.json` (один файл) | `data/json/ru/seo/{page}.json` (по странице) |
| `project/data/content/index.json :: globals` | `data/json/global.json` (nav, contacts, langs, forms) + `data/json/ru/{collection}/{slug}.json` (коллекции — articles, models/tires) |
| `project/data/production/X-production.json` | **удалить слой** — `DataLoaderService` грузит напрямую из `data/json/` |
| `project/data/img/X/Y.webp` | `data/img/X/raw/Y.webp` (raw-source contract) + manifest |
| `project/index.php` (vanilla router) | Slim 4: `public/index.php` (bootstrap) + `config/routes.php` + `src/Action/PageAction.php` |
| `project/form.php` (vanilla + Guzzle) | `src/Action/ApiSendAction.php` + `src/Notification/NotificationDispatcher.php` + 4 channels |
| `project/json.php`, `read-json.php`, `copy.php` | удалить — `DataLoaderService` |
| `project/config.php` | разнести: пути → `config/settings.php`, mail → `.env::MAIL_DSN` |
| `project/vendor/` (committed) | удалить, `composer install` |
| `project/cache/twig/` | `cache/twig/` (имя совпадает) — путь из `settings.php` |
| `dev/gulpfile.js`, `dev/ismart-gulp.js` | удалить — `npm run build` через webpack + postcss |
| `dev/webpack.config.js` | заменить на `webpack.config.cjs` baseline (code splitting, asset-manifest) |
| `dev/package.json` | мерж с `package.json` baseline (зависимости из dev/ + scripts baseline) |
| CDN `<script src="https://cdn.../swiper">` | `npm install swiper`, импорт в `assets/js/main.js` → ui-vendors chunk |
| CDN jQuery | `npm install jquery` (если нужен для inputmask/форм), util-vendors chunk |
| `<link rel="stylesheet" href="https://cdn.../animate.min.css">` | `npm install animate.css`, импорт в `assets/css/main.css` |

---

## 5. Templates migration

### 5.1 `layout.twig` → `base.twig`

Старый `layout.twig` обычно содержит:

```twig
<!doctype html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <title>{{title}}</title>
    {% if canonical %}<link rel="canonical" href="{{canonical}}">{% endif %}
    <meta name="viewport" content="...">
    {% for item in seo %}<meta ...>{% endfor %}
    <link rel="icon" ... href="{{root}}favicon.ico">
    {% include "parts/" ~ page ~ "-critical.twig" %}
    <link rel="stylesheet" href="{{root}}assets/css/{{manifest[page ~'.css']}}" media="none" onload="...">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/glightbox/dist/css/glightbox.min.css">
    <?php $currentUrl = ...; ?>
    {% block content %}{% endblock %}
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>
    ...
</body>
</html>
```

В platform `templates/base.twig`:

```twig
<!doctype html>
<html lang="{{ current_lang.iso }}">
<head>
  {% include 'partials/head-meta.twig' %}
  <link rel="stylesheet" href="{{ asset('main.css', 'css', true) }}">
  {# Preload main.js #}
  <link rel="preload" href="{{ asset('main.js', 'js', true) }}" as="script">
  {% include 'partials/analytics.twig' %}
</head>
<body class="page-{{ pageData.name | default(page_id) }}">
  {% block content %}{% endblock %}
  <script src="{{ asset('runtime.js', 'js', true) }}" defer></script>
  <script src="{{ asset('vendors.js', 'js', true) }}" defer></script>
  <script src="{{ asset('main.js', 'js', true) }}" defer></script>
</body>
</html>
```

Изменения:
- `<title>{{title}}</title>` → `<title>{{ seoData.title }}</title>` (через `partials/head-meta.twig`)
- `{% for item in seo %}` → переехало в `partials/head-meta.twig`, берёт из `seoData.meta`
- `{% include "parts/" ~ page ~ "-critical.twig" %}` → **удалить**
- CDN-теги Swiper/GLightbox/Animate → **удалить**, они теперь в `ui-vendors` chunk через webpack
- `{{root}}` → `{{ base_url() }}` или `{{ asset(...) }}`
- jQuery CDN → удалить если не нужен, или подключить через npm (`util-vendors` chunk)
- inline `<?php $currentUrl = ... ?>` PHP — **удалить**, у нас pure Twig, переменные приходят из `TemplateDataBuilder`

### 5.2 `parts/X.twig` → `sections/X.twig`

Пример: `parts/intro.twig` (canonical trazano):

```twig
<section class="intro">
    <div class="swiper" id="intro-swiper">
        <div class="swiper-wrapper">
            {% for slide in data.slides %}
            <div class="swiper-slide intro-slide">
                <div class="section__item cover-wrap">
                    <div class="cover" style="background-image: url({{root}}{{slide.cover}});"></div>
                </div>
                ...
            </div>
            {% endfor %}
        </div>
    </div>
</section>
```

Адаптация в `templates/sections/intro.twig`:

```twig
<section class="intro">
    <div class="swiper js-intro-swiper">
        <div class="swiper-wrapper">
            {% for slide in data.slides %}
            <div class="swiper-slide intro-slide">
                <div class="section__item cover-wrap">
                    {% include 'components/picture.twig' with {image: slide.cover, class: 'cover'} %}
                </div>
                ...
            </div>
            {% endfor %}
        </div>
    </div>
</section>
```

Изменения:
- `{{root}}{{slide.cover}}` → `picture.twig` обёртка с raw-source (для адаптивных) или просто `{{ base_url() }}/{{slide.cover}}` (для статичных)
- `style="background-image: url(...)"` (inline) → CSS-класс с `--bg-image` variable или `<picture>` (см. anti-pattern §11.1)
- `id="intro-swiper"` (DOM-id) → `class="js-intro-swiper"` (JS-хук) — если множественные инстансы возможны
- `onclick=""` (legacy plug) → удалить, event listener в `assets/js/sections/intro.js`

### 5.3 Twig 1.x → 3 syntax

Большинство совместимо. Точки внимания:

| Twig 1.x | Twig 3 |
|---|---|
| `{{ var|raw }}` | `{{ var|raw }}` ✅ |
| `{% include 'X.twig' %}` | `{% include 'X.twig' %}` ✅ |
| `{% if foo is string %}` | `{% if foo is iterable == false and foo %}` (Twig 3 не поддерживает `is string`) |
| `{% spaceless %}` | `{% apply spaceless %}{% endapply %}` |
| `{{ form.X | escape('html_attr') }}` | `{{ form.X | e('html_attr') }}` (короткий синонимом) |
| `{# comment #}` | `{# comment #}` ✅ |

В PHP-коде:
- `Twig_Loader_Filesystem` → `Twig\Loader\FilesystemLoader`
- `Twig_Environment` → `Twig\Environment`
- `Twig_Extension_Core` → `Twig\Extension\CoreExtension`

В platform это уже сделано в `config/container.php` — просто игнорировать.

### 5.4 Удалить critical-twigs

`parts/X-critical.twig` файлы содержат inline `<style>` с critical-path-CSS. В platform critical-CSS не используется — main.css preload'ится в head, cssnano минифицирует.

Действие: удалить все `*-critical.twig` и references в `layout.twig`.

---

## 6. Data (JSON) migration

### 6.1 Pages — flat → sections-format

Legacy `data/content/index.json`:

```json
{
  "page": "index",
  "title": "Trazano Tyres",
  "globals": { "brand": {...}, "nav": [...], "articles": [...], "models": [...] },
  "intro": {
    "slides": [{ "cover": "data/img/intro/1.webp", "heading": "..." }]
  },
  "range": {
    "heading": "...",
    "items": [{ "cover": "...", "title": "..." }]
  },
  "about": {...},
  "digits": {...}
}
```

Platform `data/json/ru/pages/index.json`:

```json
{
  "name": "index",
  "sections": [
    {
      "name": "intro",
      "visible": true,
      "data": {
        "slides": [{ "image": "data/img/intro/raw/1.webp", "heading": "..." }]
      }
    },
    {
      "name": "range",
      "visible": true,
      "data": {
        "heading": "...",
        "items": [{ "image": "data/img/range/raw/X.webp", "title": "..." }]
      }
    },
    { "name": "about", "visible": true, "data": {...} },
    { "name": "digits", "visible": true, "data": {...} }
  ]
}
```

Ключевые отличия:
- `sections: []` — массив в порядке отображения
- `name`, `visible`, `data` — единый формат на каждую секцию
- `cover` → `image` (платформенная конвенция, см. `data-json-structure.md`)
- `data/img/X/Y.webp` → `data/img/X/raw/Y.webp` (raw-source contract, ADR-0007)
- `title` и `globals` — переехали в `data/json/global.json` и SEO

Скрипт автоматизации (TODO `tools/migrate/legacy-page-to-sections.mjs`) — пока вручную.

### 6.2 Globals → `global.json` + коллекции

Legacy `data/content/index.json::globals`:

```json
{
  "globals": {
    "brand": { "short": "TRAZANO", "full": "TRAZANO Tyres" },
    "phone": { "href": "tel:+78002505604", "title": "8 (800) 250-56-04" },
    "email": { "href": "mailto:info@trazano-tires.ru", "title": "info@trazano-tires.ru" },
    "nav": [{ "title": "О нас", "href": "/about" }, ...],
    "articles": [{ "id": 1, "title": "...", "cover": "...", "full": "..." }, ...],
    "models": [{ "slug": "sport-sa-37", "name": "...", ... }, ...]
  }
}
```

Разносится в:

**`data/json/global.json`**:
```json
{
  "brand": { "short": "TRAZANO", "full": "TRAZANO Tyres" },
  "contacts": { "phone": {...}, "email": {...} },
  "nav": [{ "title": "О нас", "href": "/about" }, ...],
  "langs": { "ru": { "iso": "ru-RU", "title": "Русский" } },
  "forms": { "fields": [...] }
}
```

**`data/json/ru/articles/{slug}.json`** (по статье):
```json
{ "id": 1, "slug": "kak-prodlit-srok-shin", "title": "...", "image": "data/img/articles/raw/3.webp", "body": "..." }
```

**`data/json/ru/tires/{slug}.json`** (по шине):
```json
{ "slug": "sport-sa-37", "title": "...", "image": "...", "types": [...], ... }
```

### 6.3 SEO — один файл → по страницам

Legacy `data/content/seo.json`:

```json
{
  "index": { "title": "Trazano — главная", "description": "..." },
  "about": { "title": "О компании Trazano", "description": "..." },
  "contacts": { "title": "Контакты Trazano", "description": "..." }
}
```

Platform — на каждую страницу:

**`data/json/ru/seo/index.json`**:
```json
{
  "title": "Trazano — главная",
  "meta": [
    { "name": "description", "content": "..." },
    { "property": "og:title", "content": "Trazano" },
    { "property": "og:image", "content": "{base_url}/data/img/meta/og.jpg" }
  ],
  "json_ld": { "@context": "schema.org", "@type": "Organization", "name": "Trazano" }
}
```

`{base_url}` — placeholder, разворачивается `JsonProcessor::processJsonPaths()`.

### 6.4 Collections-config

В `config/project.php`:

```php
'collections' => [
    'tires' => [
        'nav_slug' => 'catalog',
        'list_page_id' => 'catalog',
        'template' => 'pages/tire.twig',
        'item_key' => 'tire',
        'data_dir' => 'tires',
        'slugs_page' => 'catalog',
        'slugs_source' => 'items',
        'og_type' => 'product',
    ],
    'articles' => [
        'nav_slug' => 'articles',
        'list_page_id' => 'articles',
        'template' => 'pages/article.twig',
        'item_key' => 'article',
        'data_dir' => 'articles',
        'slugs_source' => 'items',
        'og_type' => 'article',
        'sort_by' => 'date',
        'sort_format' => 'd.m.Y',
        'sort_dir' => 'desc',
    ],
],
```

### 6.5 Route_map (легаси URL → новые page_id)

Если в legacy `/catalog` грузит `data/content/catalog.json`, а в platform хочется называть страницу `tires-list`:

```php
'route_map' => [
    'catalog' => 'tires-list',
    'article' => 'articles-list',
],
```

### 6.6 Sitemap_pages

```php
'sitemap_pages' => [
    'index', 'about', 'contacts', 'guarantee', 'articles', 'catalog', 'buy',
],
```

Этот список регистрируется в Slim routes автоматически (см. `config/routes.php`).

---

## 7. CSS migration

### 7.1 components → sections

Legacy `dev/src/components/intro/intro.css`:

```css
.intro { position: relative; height: 100vh; }
.intro .swiper-slide { ... }
.intro .section__item.cover-wrap { ... }
.intro .heading { font-size: 4rem; }
```

Перенос в `assets/css/sections/intro.css` — обычно без изменений (BEM-classes совместимы). Проверить:

- `@import url("animate.min.css")` → npm `animate.css`, импорт в `main.css`
- `@import url("swiper.min.css")` → npm `swiper`, импорт в `main.css`
- Утилитарные классы (`.uppercase`, `.text-center`) — должны быть в `assets/css/base/utilities.css`. Если в platform нет — портировать из legacy `dev/src/assets/css/base.css` или подобного.
- BEM-классы — keep as-is

### 7.2 Регистрация в main.css

В `assets/css/main.css`:

```css
@import "swiper/css/bundle";
@import "animate.css/animate.min.css";
@import "glightbox/dist/css/glightbox.min.css";

@import "./base/reset.css";
@import "./base/typography.css";
@import "./base/utilities.css";
@import "./base/variables.css";

@import "./sections/header.css";
@import "./sections/intro.css";
@import "./sections/range.css";
@import "./sections/about.css";
@import "./sections/digits.css";
@import "./sections/articleslist.css";
@import "./sections/dealers.css";
@import "./sections/footer.css";

@import "./components/picture.css";
@import "./components/card.css";
@import "./components/form.css";
```

### 7.3 Utility-classes layer

Если legacy использует `.bg-color-1`, `.height-20`, `.width-1`, `.opacity-70` — это утилитарный слой, который надо переехать в `assets/css/base/utilities.css`. Альтернатива — переписать на CSS-переменные в каждой секции (более явно, меньше utility-классов).

### 7.4 Свёртывание `<style>` атрибутов

Legacy: `style="background-image: url({{root}}{{slide.cover}});"`

Platform: вынести в class-modifier + CSS-variable. В Twig:

```twig
<div class="cover" style="--bg-image: url({{ base_url() }}/{{ slide.cover }})"></div>
```

И в CSS:

```css
.cover {
    background-image: var(--bg-image);
    background-size: cover;
    background-position: center;
}
```

(Это легитимный inline-`style` для динамического URL — не data-style, а CSS-variable. Анти-паттерн `inline-<style>` в `CLAUDE.md` касается JSON-контента, а не Twig-разметки.)

---

## 8. JS migration

### 8.1 components → sections

Legacy `dev/src/components/intro/intro.js`:

```js
$(document).ready(function() {
    new Swiper('#intro-swiper', {
        slidesPerView: 1,
        pagination: { el: '.swiper-pagination', clickable: true },
        navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' },
        autoplay: { delay: 5000 },
    });
});
```

Перенос в `assets/js/sections/intro.js` как ES module:

```js
import Swiper from 'swiper';
import { Pagination, Navigation, Autoplay } from 'swiper/modules';

export function initIntroSwiper() {
    const el = document.querySelector('.js-intro-swiper');
    if (!el) return;
    new Swiper(el, {
        modules: [Pagination, Navigation, Autoplay],
        slidesPerView: 1,
        pagination: { el: el.querySelector('.swiper-pagination'), clickable: true },
        navigation: {
            nextEl: el.querySelector('.swiper-button-next'),
            prevEl: el.querySelector('.swiper-button-prev'),
        },
        autoplay: { delay: 5000 },
    });
}
```

### 8.2 Регистрация в main.js

В `assets/js/main.js`:

```js
import { initIntroSwiper } from './sections/intro.js';
import { initDigits } from './sections/digits.js';
import { initRange } from './sections/range.js';
import { initForm } from './components/form-callback.js';

document.addEventListener('DOMContentLoaded', () => {
    initIntroSwiper();
    initDigits();
    initRange();
    initForm();
});
```

### 8.3 jQuery — оставлять или нет

Если legacy использует jQuery для:
- form-validation + Inputmask (`$('input').inputmask(...)`)
- AJAX (`$.post`)
- DOM-traversal

И если объём jQuery-кода значителен — оставить (через npm + util-vendors chunk). Если используется только для `$(document).ready(...)` — заменить на `addEventListener('DOMContentLoaded', ...)` и удалить jQuery.

### 8.4 inline `onclick=""` → event listeners

Legacy: `<button class="..." onclick="showModal()">`

Platform: `<button class="... js-show-modal" data-modal="#modal-1">`

В JS:
```js
document.querySelectorAll('.js-show-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        const modalSelector = btn.dataset.modal;
        document.querySelector(modalSelector)?.classList.add('is-open');
    });
});
```

---

## 9. Forms migration

Legacy `project/form.php` обычно содержит:

```php
$form = new Form($config["mail"]);
$form->send($data, null, null);

// CallTouch
$client = new GuzzleHttp\Client(['base_uri' => 'https://api.calltouch.ru']);
$client->post('/calls-service/RestAPI/requests/orders/register', [
    'json' => [...]
]);
```

Платформа использует `ApiSendAction` + `NotificationDispatcher` (ADR-0005) с 4 channels:

- **Mail** (`src/Notification/Channel/MailChannel.php`) — Symfony Mailer
- **CallTouch** (`src/Notification/Channel/CallTouchChannel.php`) — Symfony HttpClient
- **Telegram** (`src/Notification/Channel/TelegramChannel.php`) — Symfony HttpClient
- **GoogleSheets** (`src/Notification/Channel/GoogleSheetsChannel.php`) — native `openssl_sign` для JWT

В `.env`:

```
MAIL_DSN=sendmail://default
MAIL_TO=info@<domain>
MAIL_FROM=noreply@<domain>
MAIL_FROM_NAME=<Brand>
MAIL_SUBJECT_PREFIX=[<Brand>]

CALLTOUCH_ROUTE_KEY=<from-calltouch-panel>
CALLTOUCH_ACCESS_TOKEN=<from-calltouch-panel>

TELEGRAM_BOT_TOKEN=<bot-token>
TELEGRAM_CHAT_ID=<chat-id>

GOOGLE_SHEETS_ID=<spreadsheet-id>
GOOGLE_CREDENTIALS_PATH=data/json/google-credentials.json  # вне public, в data/json/ или config/
```

JSON-формат ответа `POST /api/send`:

```json
{
  "ok": true,
  "channels": {
    "mail": "success",
    "calltouch": "success",
    "telegram": "success",
    "google_sheets": "disabled"
  }
}
```

Канал без credentials → `disabled`, не падает.

---

## 10. Images migration

ADR-0006 (manifest-driven) + ADR-0007 (raw-source contract).

### 10.1 Шаги

1. **Положить исходники**: `data/img/X/raw/Y.webp` (или `.jpg`, `.png`, `.avif`), желательно >= 1920w для адаптивности.
2. **Build images**: `npm run build:images` → создаст ресайзы (180/360/720/1080/1920) в `assets/img/build/` + `image-dimensions.json` manifest.
3. **JSON**: переписать поля через `tools/migrate/json-to-raw-paths.js`:
   ```bash
   node tools/migrate/json-to-raw-paths.js data/json/ru/pages/index.json
   ```
   Это превратит `"image": "data/img/X/Y.webp"` → `"image": "data/img/X/raw/Y.webp"`.
4. **Inline HTML в JSON-полях**: если в `body`/`text` есть inline `<img src="data/img/X/Y.webp">` — мигрировать через `tools/migrate/sources-to-raw.js` (v3 с pre-scan inline HTML, см. memory `feedback-json-inline-html`).
5. **Twig**: использовать `{% include 'components/picture.twig' with {image: section.image} %}` — он автоматически подхватит `<source>` варианты из manifest через `image_has()` / `image_variants()`.

### 10.2 Расчёт image-sizes

В `config/image-sizes.json` (если ещё нет):

```json
{
  "keys": ["180", "360", "720", "1080", "1920"],
  "sizes": {
    "180": { "width": 180 },
    "360": { "width": 360 },
    "720": { "width": 720 },
    "1080": { "width": 1080 },
    "1920": { "width": 1920 }
  }
}
```

---

## 11. Anti-patterns (что НЕ переносить)

### 11.1 inline `<style>` в Twig для background-image

❌ Legacy: `<div style="background-image: url({{root}}{{X}})">`
✅ Platform: CSS-class + CSS-variable (см. §7.4) или `<picture>` через `picture.twig`

**Reason**: inline-`<style>` в JSON-контенте — запрещён без необходимости (см. CLAUDE.md). Для Twig — допустимо для динамического URL через `--bg-image`, но прямой `style="..."` с захардкоженным background-position/size — выносить в CSS-класс.

### 11.2 `parts/X-critical.twig` критический CSS inline

❌ Legacy: `{% include "parts/" ~ page ~ "-critical.twig" %}` в `<head>` — inline `<style>` с critical-path CSS
✅ Platform: удалить. main.css preload + cssnano достаточно.

**Reason**: critical-CSS добавлял сложность поддержки (нужно держать одинаковые правила в двух местах), а выгода маржинальная при cssnano + HTTP/2 preload.

### 11.3 CDN-теги в `<head>`

❌ Legacy: `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css">`
✅ Platform: npm `swiper`, импорт в `main.css`/`main.js`, webpack code-splitting в `ui-vendors` chunk.

**Reason**: CDN — security (CSP allow https), доступность (кэш в браузере не гарантирован), отсутствие сборки с tree-shaking. Webpack-чанки решают всё.

### 11.4 inline `onclick=""`

❌ Legacy: `<button onclick="showModal('#modal-1')">`
✅ Platform: `<button class="js-show-modal" data-modal="#modal-1">` + event listener в `assets/js/sections/X.js`.

**Reason**: inline-handlers не работают с CSP `script-src 'self'`, ломают delegation, дублируют логику, нельзя отвязать.

### 11.5 `vendor/` коммит

❌ Legacy: `project/vendor/` committed в git (15-50MB)
✅ Platform: `composer install`, vendor/ в .gitignore

**Reason**: vendor/ всегда воспроизводим из composer.lock, раздувает репо, конфликты при composer update.

### 11.6 `data/production/X-production.json` слой

❌ Legacy: `data/content/index.json` (source) + `data/production/index-production.json` (built, gulp-обработанный)
✅ Platform: только `data/json/ru/pages/index.json`, грузится напрямую через `DataLoaderService`

**Reason**: дополнительный build-step без необходимости, путаница «какой файл редактировать», два места правды.

### 11.7 Mixed-bag `globals` в `index.json`

❌ Legacy: `data/content/index.json :: globals = { brand, nav, articles, models, types, phone, email }` — всё в одном
✅ Platform: `data/json/global.json` (nav, brand, contacts, langs, forms) + `data/json/ru/{collection}/{slug}.json` (articles, tires) + `data/json/ru/pages/index.json` (только sections для главной)

**Reason**: collection-данные должны жить как отдельные сущности (one slug = one file), а не вложенный массив. Это даёт routes `/{nav_slug}/{slug}` и `DataLoaderService::loadEntity()`.

### 11.8 `{{root}}` placeholder

❌ Legacy: `<img src="{{root}}assets/img/X.svg">` где `{{root}}` = `'/'` или `'/subfolder/'`
✅ Platform: `<img src="{{ base_url() }}/assets/img/X.svg">` или `{{ asset('X.svg', 'img') }}`

**Reason**: `{{root}}` — самописный, требует passing в каждую страницу. `base_url()` Twig-функция (UrlExtension) — единый source of truth, учитывает APP_BASE_URL.

### 11.9 `<img src="data/img/...">` напрямую

❌ Legacy: `<img src="data/img/range/sport-sa-37.webp" alt="...">`
✅ Platform: `{% include 'components/picture.twig' with {image: 'data/img/range/raw/sport-sa-37.webp', alt: '...'} %}`

**Reason**: `picture.twig` через `image_has()`/`image_variants()` добавляет `<source>` для адаптивных размеров (180/360/720/1080/1920) когда manifest их содержит. Без обёртки — браузер всегда грузит full-size картинку.

### 11.10 vanilla Guzzle в формах

❌ Legacy: `new GuzzleHttp\Client([...])->post(...)` в `form.php`
✅ Platform: `ApiSendAction` + `NotificationDispatcher` + `Symfony\Contracts\HttpClient\HttpClientInterface`

**Reason**: Guzzle тащит лишние транзитивные зависимости (guzzlehttp/psr7, guzzlehttp/promises, symfony/deprecation-contracts). Symfony HttpClient уже есть как peer dep у symfony/mailer.

### 11.11 Twig 1.x в новом коде

❌ Legacy: `new Twig_Environment(new Twig_Loader_Filesystem(...))`
✅ Platform: `new \Twig\Environment(new \Twig\Loader\FilesystemLoader(...))`

**Reason**: Twig 1.x EOL, 3.x — actively maintained, syntax 95% совместим (см. §5.3).

---

## 12. Step-by-step checklist

### Phase 1: Inventory & skeleton

- [ ] `git clone <legacy-repo> ../<deployment-slug>-old` — сохранить legacy как reference
- [ ] Inventory pages, parts, components, data, forms, integrations (см. §2)
- [ ] `npm run create-deployment -- <deployment-slug>` в baseline → новая папка `../<deployment-slug>`
- [ ] `cp config/project.php.dist config/project.php` + `.env.example .env`
- [ ] Заполнить `.env` (см. §3)

### Phase 2: Static structure

- [ ] Перенести `project/templates/parts/{intro,range,about,digits,articleslist,cap}.twig` → `templates/sections/`
- [ ] Заменить `{{root}}` на `{{ base_url() }}`
- [ ] Удалить critical-twigs (`parts/X-critical.twig`)
- [ ] Адаптировать `layout.twig` → `base.twig` (см. §5.1)
- [ ] Перенести `dev/src/components/{X}/X.css` → `assets/css/sections/X.css`
- [ ] Импорт в `assets/css/main.css`
- [ ] Перенести `dev/src/components/{X}/X.js` → `assets/js/sections/X.js` как ES module
- [ ] Импорт в `assets/js/main.js`

### Phase 3: Data

- [ ] Конвертировать `data/content/{page}.json` → `data/json/ru/pages/{page}.json` в sections-формат
- [ ] Разнести `data/content/index.json::globals` → `data/json/global.json` + `data/json/ru/{collection}/`
- [ ] Разнести `data/content/seo.json` → `data/json/ru/seo/{page}.json`
- [ ] Перенести `data/img/` (или симлинк на ту же папку)
- [ ] Положить исходники в `data/img/X/raw/Y.webp`
- [ ] `node tools/migrate/json-to-raw-paths.js data/json/ru/pages/*.json`
- [ ] `npm run build:images` → манифест

### Phase 4: Config

- [ ] Заполнить `config/project.php :: collections` (см. §6.4)
- [ ] Заполнить `config/project.php :: route_map` (см. §6.5)
- [ ] Заполнить `config/project.php :: sitemap_pages` (см. §6.6)
- [ ] Опционально: `integrations` (analytics IDs, captcha sitekey)

### Phase 5: Install & build

- [ ] `rm -rf project/vendor` (legacy vendor)
- [ ] `composer install`
- [ ] `npm install`
- [ ] `npm run build:dev`
- [ ] `npm run validate-json` — проверить sections-формат

### Phase 6: Verify

- [ ] `php -S localhost:8080 -t public` (или Valet/nginx)
- [ ] Curl главной — HTTP 200 + проверить наличие `<picture>` элементов (если есть изображения)
- [ ] Curl одной collection-страницы (`/catalog/<first-slug>` или `/articles/<first-slug>`)
- [ ] Curl SEO — `<title>`, `<meta name="description">`, `<link rel="canonical">`
- [ ] Открыть в браузере — визуальный sanity check (intro/about/range/digits)
- [ ] Отправить форму через `/api/send` — проверить JSON-response с `channels: {mail, calltouch, telegram, google_sheets}`
- [ ] `npm run check` — все линтеры + тесты

### Phase 7: Cleanup

- [ ] Удалить `dev/` и `project/` папки legacy (после полного переноса!)
- [ ] Удалить `data/production/` слой
- [ ] Удалить `index.php`, `form.php`, `json.php`, `read-json.php`, `copy.php` legacy в корне
- [ ] `git add -A && git commit -m "feat(migration): legacy → ismart-platform baseline"`

### Phase 8: Distill state

- [ ] `cp ../<baseline>/.distill/state.json.dist ./.distill/state.json` (или из существующего deployment)
- [ ] Установить `platform_commit` = текущий SHA baseline
- [ ] `node ../<baseline>/tools/distill/distill.mjs status .` — проверить overrides
- [ ] Зафиксировать assets/, data/, config/project.php, templates/sections/ как deployment-local (overrides) согласно ADR-0009

### Phase 9: Production

- [ ] DNS / SSL
- [ ] Deploy (см. `docs/guides/deploy-checklist.md`)
- [ ] Smoke на проде
- [ ] Monitoring через `tools/orchestrator/orchestrate.mjs` — этот deployment должен появиться в health-report

---

## 13. Распространённые сложности

### 13.1 `index.php` имеет custom-логику (не sections-pattern)

Например, legacy `index.php` обрабатывает `?utm_*` параметры или делает редиректы по cookie. Перенос:

- UTM — через JS на клиенте (`assets/js/utm-tracker.js`) или server-side через `RequestDurationMiddleware` extension
- Cookie-redirects — middleware (`src/Middleware/CookieRedirectMiddleware.php`)
- Geo-based-логика — `src/Middleware/GeoMiddleware.php` (по IP)

### 13.2 Custom collection без явного template

Если в legacy есть `?service=...` URL-pattern без `/services/<slug>` — нужно или приводить URL к canonical (`/services/<slug>`) с 301-редиректом, или делать custom Action.

### 13.3 Multi-step forms

Если legacy форма — мультистеп (countdown / quiz), переписать на client-side state + одна финальная отправка через `/api/send`.

### 13.4 Yandex.Maps / интерактивные карты

Legacy: `<script src="https://api-maps.yandex.ru/2.1/?apikey=X">` + inline init.
Platform: `assets/js/sections/map.js` модуль + API-key через `.env` → инжектится в Twig через DI.

### 13.5 Inline analytics scripts

Yandex.Метрика обычно подключается через inline `<script>` в `<head>`. В platform — переместить в `templates/partials/analytics.twig`, который инклюдится в `base.twig`. ID — через `integrations.yandex_metrika_id` из `config/project.php`.

### 13.6 Multi-domain / locales

Если legacy обслуживает несколько доменов (например `trazano-tires.ru` + `trazano-tires.com`) — это разные deployments в platform-модели, по одному папке-deployment'у на домен. Не пытаться сделать один deployment-multi-domain.

### 13.7 Hybrid migration — функционал из соседних deployments

Иногда canonical legacy НЕ имеет нужной страницы/функционала, либо у соседнего deployment'а оно реализовано существенно лучше. В таком случае:

- **Базовая логика и карточки** — берутся из соседнего deployment'а (наиболее зрелого)
- **Стилизация и контент** — адаптируются под целевой бренд

Это нормальный паттерн — позволяет переиспользовать инвестиции в логику между tire-deployments / restaurant-deployments / car-dealer-deployments одного сегмента.

**Зафиксированные кейсы:**

| Целевой deployment | Страница / секция | Источник логики | Замечание |
|---|---|---|---|
| trazano-tires.ru-v2 | `/buy` (карточки дилеров с фильтрами) | kumho-tires.ru | Логика работы и структура карточек — kumho-style. Стилизация — под trazano-бренд (типографика, цвета, акценты). |
| mirage-russia.ru-v2 | `/buy` (по аналогии — если есть) | kumho-tires.ru | По мере миграции — тот же паттерн. |

**Workflow для hybrid-страницы:**

1. Скопировать `templates/sections/{buy-related}.twig` из kumho-tires.ru → trazano-tires.ru-v2
2. Скопировать `assets/css/sections/{buy-related}.css` из kumho → trazano-v2, **переписать color/typography** под бренд (через CSS-переменные)
3. Скопировать `assets/js/sections/{buy-related}.js` — если есть JS-логика фильтров/карты, оставить as-is
4. Скопировать `data/json/ru/pages/buy.json` структуру (только schema!) — заполнить content под бренд
5. Скопировать `data/json/ru/dealers/*.json` структуру entity — заполнить trazano-дилерами
6. Добавить collection `dealers` в `config/project.php` если ещё нет

**Не делать:**
- НЕ копировать содержимое JSON напрямую (бренд-специфика kumho не подходит trazano)
- НЕ копировать assets/css без переопределения CSS-переменных (получится «kumho в trazano-цветах», что и хотим избежать)
- НЕ создавать deployment-specific ветку логики в `src/` — если нужна общая логика для tire-deployments, выносить в baseline через ADR

---

## 14. Сайты-кандидаты для миграции

По данным staging (`/var/www/ismart/*.ismart.pro` на ismart.pro) — десятки legacy iSmart-сайтов:

**Уже мигрированы (на platform):**
- `kumho-tires.ru` (deployment-local in repo)
- `italycommunity.ru` (deployment-local in repo)
- `beepitron.com` (deployment-local in repo)

**В процессе миграции:**
- `trazano-tires.ru` → `trazano-tires.ru-v2`
- `mirage-russia.ru` → `mirage-russia.ru-v2`

**Ждут миграции (выборка):**
- Шинные: armstrongtire.ru, doublestar.ru, landsail.ru
- Авто-дилерские: avtodom-landrover.ru, avtofin.org, citroen-peugeot-asc.ru, nissanasc-service.ru
- Service-сети: service-himki.ru, service-chery.ru, service.audi-avtodom.ru, service.avtodom-gac.ru, service.avtodom-liauto.ru, service.avtodom-landrover.ru, service.himki-exeed.ru, service.omoda-avtodom.ru, service.altufievo-changanauto.ru
- Sales-сети: sales.altufievo-changanauto.ru, sales.jaecoo-altufievo.ru, sales.jaecoo-asc.ru, sales.omoda-asc.ru, sales.solaris-asc.ru, sales.solaris-avtodom.ru
- Прочее: auchan-promo.svr-avto.ru, mgcom-avilon-geely

Каждая миграция — отдельная deployment-Claude сессия (см. `docs/conventions/claude-session-boundaries.md`).

---

## 15. References

- [platform-reference.md](../architecture/platform-reference.md) — главный референс platform
- [data-json-structure.md](./data-json-structure.md) — структура JSON в `data/json/`
- [ADR-0005](../architecture/decisions/0005-notification-channel-dispatcher.md) — Notification Channel Dispatcher
- [ADR-0006](../architecture/decisions/0006-manifest-driven-images.md) — manifest-driven images
- [ADR-0007](../architecture/decisions/0007-raw-source-picture.md) — raw-source picture contract
- [ADR-0008](../architecture/decisions/0008-multi-deployment-docs.md) — multi-deployment docs structure
- [ADR-0009](../architecture/decisions/0009-css-js-deployment-local.md) — assets/ deployment-local
- [claude-session-boundaries.md](../conventions/claude-session-boundaries.md) — границы baseline vs deployment Claude
- [conventions/](../conventions/) — html-/css-/twig-/js-/json-naming, routes-and-urls
- [tools/migrate/json-to-raw-paths.js](../../tools/migrate/json-to-raw-paths.js) — image paths migration
- [tools/migrate/sources-to-raw.js](../../tools/migrate/sources-to-raw.js) — inline HTML image migration

---

## 15a. Lessons learned (накопленные edge cases)

По итогам миграции `trazano-tires.ru` → `trazano-tires.ru-v2` (2026-05-24):

### CSS / стили

1. **Опечатки selectorов в canonical CSS бывают часто.** Например `cataloglist.css` от trazano-orig имел `.cataloglist .sections__subitem.card-wrap` (лишний `s` в `sections`). HTML twig правильный (`section__subitem`) → правило не применялось → невидимые карточки. **Фикс в твоём CSS, не в twig** (привести к правильному BEM).

2. **PostCSS `color()` function — stage 4 experimental.** PostCSS preset-env stage 2 (наш baseline) не обрабатывает `color(var(--color-3) blackness(15%))`. Без preprocessing'а property invalid → hover background становится прозрачным → button сливается с фоном. **Заменять на `color-mix(in srgb, var(--color-X), black N%)`** (CSS Color 5, поддержка Chrome 111+/Safari 16.2+/Firefox 113+):
   ```bash
   find assets/css -name "*.css" -exec sed -i.bak -E 's/color\(var\((--color-[0-9]+)\) blackness\(([0-9]+)%\)\)/color-mix(in srgb, var(\1), black \2%)/g' {} \;
   ```

3. **`@import "../../../node_modules/X/dist/X.css"` не работает** — postcss-import не resolves cross-package. Использовать pkg-relative: `@import "X/dist/X.css"`. Требует postcss.config.js с `postcss-import({ path: ['node_modules', 'assets/css'] })`.

4. **Канонический header.twig + canonical header.css должны быть согласованы по разметке.** Если переносишь только CSS, оставляя kumho-разметку header.twig — невидимая шапка из-за non-matching BEM-selectors. Переносить **парой**: twig + css.

5. **Kumho `assets/css/components/*.css` и `assets/css/pages/*.css` привносят kumho-look** даже после canonical sections/*. У них свои тёмные фоны, border'ы, padding'и. **Снести из `main.css`** компоненты которые не используются в canonical-разметке. Оставлять минимум: `glightbox-custom`, `card-dealer` (для /buy от kumho), `filter`, `form-callback`.

### Картинки

6. **`build:images` ищет исходники в `data/img/**/raw/`** (ADR-0007 raw-source contract). Cover'ы на корне `data/img/X/Y.webp` **не обрабатываются**, манифест пустой → picture.twig через `image_has()` отбраковывает все варианты → fallback src пустой.

   **Действие**: переместить исходники в `raw/` подпапки + обновить пути в JSON + `npm run build:images`:
   ```bash
   for d in data/img/X/*/; do
     mkdir -p "${d}raw"
     mv "${d}cover.webp" "${d}raw/cover.webp" 2>/dev/null
   done
   ```

7. **`frame.data.cover` обязателен для каждой страницы.** Frame.twig корректно гейтит rendering — пустой cover = пустая секция. Скопировать пути из canonical:
   ```python
   covers = {'about': 'cover8.webp', 'tires-list': 'cover7.webp', 'articles': 'cover14.webp', ...}
   ```

### PageAction inject

8. **`PageAction::injectListItems()` берёт fields из `inner = entity[item_key]`.** Если `item_key='item'`, а cover/season/etc лежат на top-level entity (а не в `entity.item.*`) — они теряются. Положить под `entity.item.cover/season/code` для корректного inject.

9. **PageAction flat default `'cover' => ['src' => '']`** — если cover отсутствует в inner, fallback **массив**. В twig обязательно: `{% set coverPath = item.cover is iterable ? item.cover.src|default('') : item.cover|default('') %}`.

10. **PageAction whitelist в flat — ограниченный** (slug, id, visible, cover, hex, date, title, desc, href, types, feature, tags, category, season). Поля `bg`, `shadow`, `image` и пр. в flat **не попадают**. Если нужны в card-twig: либо использовать path-pattern (`/data/img/X/{slug}/bg.webp`), либо расширить flat-whitelist в PageAction baseline (через ADR).

### kumho-template hard-codes

11. **`kumho/sections/tires.twig` использует `load_json('pages/tires.json')`** (hard-coded path). Если у тебя page_id = `tires-list` (через route_map) — создать `pages/tires.json` алиас со списком slug'ов:
    ```bash
    cp data/json/ru/pages/catalog.json data/json/ru/pages/tires.json
    ```

12. **`kumho/components/card-tire.twig` hard-codes `/tires/<slug>`** в href. Для deployment с nav_slug != 'tires' (trazano: `catalog`, и т.д.) — править href в card-tire.twig:
    ```twig
    {% set href = url('/catalog/' ~ item.slug) %}
    ```
    Это **deployment-local override** (kumho остаётся на /tires/, trazano-v2 на /catalog/).

### SEO

13. **Legacy SEO format `{title, description, og: {...}}` ≠ platform format `{title, meta: [...], json_ld}`**. base.twig итерирует `seoData.meta[]`, генерируя `<meta name="..." content="...">` или `<meta property="og:* ...">`. Конвертация скриптом:
    ```python
    new = {'title': old['title'], 'meta': []}
    if old.get('description'): new['meta'].append({'name': 'description', 'content': old['description']})
    og = old.get('og') or {}
    if og.get('title'): new['meta'].append({'property': 'og:title', 'content': og['title']})
    ...
    ```

14. **`seo/{page_id}.json` нужен для каждой страницы.** Без него base.twig fallback на `'Заголовок страницы по умолчанию'` (даже если pageData.title задан — иногда не подхватывается). Создать seo/{page_id}.json с минимум title + meta description + og:*.

### Twig 1.x deprecation

15. **Canonical-сайты на Twig 1.x** показывают deprecation warnings PHP 8+ (`Return type of Twig\Node\Node::count() should either be compatible with Countable::count()`). Это **legacy issue в самом canonical**, не на нашей миграции. После переноса на platform (Twig 3) — warnings исчезают.

### Hybrid migration — расширенный паттерн

16. **Брать из kumho не только `/buy`** (memory `project-tire-buy-page-from-kumho`), а **весь tire-list functionality** для tire-deployments: `sections/tires.twig` + `components/filter.twig` + `components/card-tire.twig` + `tires.js`. Стилизация card-tire — переписать под canonical-разметку bird (background + cover + skewX title + brand-logo + line) либо адаптировать через CSS-переменные.

---

## 16. Будущие улучшения этого гайда

- [ ] `tools/migrate/legacy-page-to-sections.mjs` — автоматизация конверсии JSON структуры (flat → sections-format)
- [ ] `tools/migrate/legacy-globals-split.mjs` — авто-разнос `globals` bag в global.json + collections
- [ ] `tools/migrate/legacy-seo-split.mjs` — разнос monolithic `seo.json` в per-page файлы
- [ ] `tools/scaffold/migrate-legacy-deployment.mjs` — wrapper по checklist'у §12 с интерактивными prompts
- [ ] Тест-сьют для проверки sections-format после миграции (`tests/php/Integration/MigrationTest.php`)
- [ ] Конкретные примеры миграции (с реального armstrong/landsail) — добавить как secondary references

По мере миграции 2-3 сайтов по этому гайду — фиксировать найденные edge cases в обновлениях документа.
