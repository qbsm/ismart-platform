# Гайд: миграция legacy-boilerplate (ismart-platform v1) → baseline (v2)

Документ описывает **полную миграцию** проекта с legacy-boilerplate (которым построены `trazano-tires.ru`, `mirage-russia.ru`, и др.) на новую архитектуру `ismart-platform` (Slim 4 + Twig 3 + scaffold).

Написано **по итогам реальной миграции** trazano и mirage в мае 2026. Содержит все грабли, на которые наступили, и проверенные решения.

---

## 0. Понимание legacy-boilerplate

Все проекты на старой архитектуре (`trazano`, `mirage`, ранние варианты) построены по одному шаблону:

### Структура файлов

```
<project>/
  project/                     # Production runtime
    index.php                    # Точка входа (НЕ Slim, свой роутинг)
    config.php                   # Custom config
    form.php, json.php           # Кастомные endpoints (без Slim Action)
    read-json.php                # Утилиты
    templates/
      layout.twig
      pages/{index,about,catalog,product,...}.twig
      parts/                     # Включаемые куски
        logo.twig, form.twig
    data/
      content/
        index.json, catalog.json, ...  # Контент страниц
        seo.json                       # SEO для всех страниц
      img/                       # Изображения
      docs/
    vendor/                      # Composer (Twig 1.x, PHPMailer, ismart/form)
    assets/                      # Production assets (CSS/JS/fonts собранные)
    sitemap.xml                  # Статический
    llms.txt, llms-full.txt      # GEO для AI

  dev/                         # Build-time исходники
    src/
      assets/
        css/base/               # variables.css, typography.css, ...
        css/fonts/              # @font-face definitions
        fonts/, img/
        brands/<brand>/         # ← BRAND-СПЕЦИФИЧНОЕ (цвета, шрифты)
          variables.css         # Brand colors, font-family aliases
      components/<name>/        # Component-folder
        <name>.twig             # Twig 1.x markup
        <name>.css              # Стили
        <name>.js               # Поведение
      pages/<name>/             # Page-specific assets
        <name>.css, <name>.js
    composer.json, package.json, gulpfile.js, webpack.config.js
```

### Стек

- **Twig 1.x** через `Twig_Environment` / `Twig_Loader_Filesystem` (deprecated в PHP 8.5)
- **PHPMailer 6.x** для писем
- **Guzzle 7** для HTTP
- **`ismart/form` dev-master** — внутренний пакет валидации форм
- **Gulp + Webpack** гибридная сборка
- **Свой index.php-роутинг** без middleware

### Паттерны Twig (что отличает legacy)

1. **`{{root}}{{path}}`** для URL'ов — `root` ставится глобально (`/` или пусто), `path` — относительный.
2. **Глобальные переменные** в Twig: `brand`, `phone`, `email`, `nav`, `models`, `articles`, `types` — из `globals` блока `data/content/index.json`.
3. **Sections-by-globals**: `cataloglist.twig` использует `{% for model in models %}` — массив моделей берётся из глобала.
4. **`firstScreen` + `secondaryScreen`** в JSON-контенте: каждая страница имеет два массива секций, объединяемых при рендере.
5. **`name` без `type`**: каждая секция = `{name: 'header', visible: true, ...}` (поля плоские, без обёртки `data`).
6. **Brand-vars** через `dev/src/assets/brands/<brand>/variables.css` — `--color-3`, `--color-4`, шрифты.

---

## 1. Архитектурные различия с baseline

| Аспект | Legacy | baseline (ismart-platform) |
|---|---|---|
| **Framework** | свой `index.php` + ручной routing | Slim 4 + PSR-15 middleware |
| **DI** | нет, прямые `require` | PHP-DI с container.php |
| **Twig** | 1.x (Twig_Environment) | 3.x (slim/twig-view) |
| **Mailer** | PHPMailer | Symfony Mailer 8 |
| **Forms** | `ismart/form` + кастомный `form.php` | `ApiSendAction` + `MailService` |
| **Build** | Gulp + Webpack | Webpack 5 only |
| **Структура entry** | `index.php` в корне `project/` | `public/index.php` |
| **Контент JSON** | `firstScreen[] + secondaryScreen[]`, поля плоские | `sections[{name, type, data: {...}}]` |
| **Entity** | плоский (`{slug, name, cover, sizes, ...}`) | обёрнут (`{slug, item: {name, ...}, desc: {short, full}, cover}`) |
| **Twig globals** | `brand`, `phone`, `models`, ... отдельно | только `global` + `base_url` |
| **URL paths** | `{{root}}{{path}}` (root='/' или '') | `<img src="{{path}}">`, `JsonProcessor` уже даёт полный URL |
| **Sitemap** | статический `sitemap.xml` | динамический `SitemapAction` |
| **SEO** | один `seo.json` со всеми pages | `data/json/{lang}/seo/{page}.json` per-страница |

---

## 2. Pre-migration audit

Перед началом миграции собери:

### 2.1 Brand-палитра

`dev/src/assets/brands/<brand>/variables.css` — **единственный источник правды по бренду**. Содержит:

```css
:root {
  --color-3: #f39910;        /* Brand accent color */
  --color-4: #332c2b;        /* Secondary brand */
  --color-5: ...
}

:root {
  --font-1-light: "Gilroy-Light", sans-serif;
  --font-1-bold: "Gilroy-Bold", sans-serif;
  ...
}
```

**Не путать с `dev/src/assets/css/base/variables.css`** — там generic-defaults (`--color-1: white`, `--color-2: black`). Brand-цвета именно в `brands/<brand>/`.

### 2.2 Шрифты

Проверь физическое наличие шрифтов:

```bash
find <legacy>/project/assets/fonts -type f -name "*.woff2"
find <legacy>/dev/src/assets/fonts -type f
```

Если шрифты в `project/assets/fonts/<family>/<font>-<hash>.woff2` — production-versions с хешами. Если только css-defs с `https://static.ismart.pro/fonts/<family>/...` — CDN-шрифты (Gilroy всегда из CDN, не локальные).

### 2.3 Контент (data/json)

```bash
find <legacy>/project/data/content -name "*.json"
```

Должен дать:
- `index.json`, `about.json`, `catalog.json`, `product.json`, `contacts.json`, и т.д. (по странице)
- `seo.json` (общий для всех страниц)
- `buy.json` с `dealers` массивом (если есть `/buy/{city}/`)

Внутри `index.json` — `globals.models` (entity-список шин), `globals.articles` (статьи).

### 2.4 Изображения

```bash
du -sh <legacy>/project/data/img/
find <legacy>/project/data/img -type d -maxdepth 2
```

Структура обычно: `data/img/{intro,about,models,dealers,articles,frame,ui,range}/`.

### 2.5 URL-структура

Прогуляться по существующим страницам:
- `/`, `/about/`, `/contacts/`, `/policy/`
- `/catalog/`, `/catalog/<slug>/`
- `/articles/`, `/articles/<slug>/`
- `/buy/`, `/buy/<city>/`
- `/guarantee/`, `/cookies-policy/`

Зафиксировать какие URL **должны остаться неизменными** (для SEO).

---

## 3. Migration plan — пошагово

### Шаг 1 — Bootstrap нового deployment

```bash
cd <ismart-platform>
npm run distill -- init <slug>-v2 \
  --name "<Brand Display Name>" \
  --domain <slug>.ru
```

Создаст sibling-каталог `<slug>-v2/` с CORE baseline.

**Сразу после init:**

```bash
cd ../<slug>-v2

# Фикс баги distill init с MAIL_SUBJECT_PREFIX brackets — обязательно
sed -i '' 's|^MAIL_SUBJECT_PREFIX=\[.*\]|MAIL_SUBJECT_PREFIX="[Brand Name]"|' .env

# Установить корректный APP_BASE_URL для dev (не production!)
sed -i '' "s|^APP_BASE_URL=.*|APP_BASE_URL=http://<slug>-v2.test/|" .env
sed -i '' "s|^APP_ENV=.*|APP_ENV=development|" .env

composer install --no-dev --optimize-autoloader
npm install
```

### Шаг 2 — Brand assets

Из `<legacy>/dev/src/assets/brands/<brand>/variables.css` достать:

```css
:root {
  --color-3: #f39910;
  --color-4: #332c2b;
  ...
  --font-1-light: "Gilroy-Light", ...;
  ...
}
```

Создать `<v2>/assets/css/base/variables.css`:

```css
:root {
  --color-1: #fff;
  --color-2: #000;
  --color-3: #f39910;      /* из brands/<brand>/variables.css */
  --color-4: #332c2b;
  ...

  /* Font family aliases (из того же файла) */
  --font-default: 'BlinkMacSystemFont', -apple-system, 'Helvetica Neue', sans-serif;
  --font-1-light: 'Gilroy-Light', var(--font-default);
  --font-1-medium: 'Gilroy-Medium', var(--font-default);
  ...

  /* z-index — обязательно (используется в header etc.) */
  --z-index-1: 1000;
  --z-index-2: 990;
  ...
  --z-index-10: 910;
}
```

### Шаг 3 — Шрифты

**Вариант A: CDN** (Gilroy всегда). Создать `<v2>/assets/css/base/fonts.css`:

```css
@font-face {
  font-family: 'Gilroy-Light';
  src: url('https://static.ismart.pro/fonts/gilroy/Gilroy-Light.woff2') format('woff2');
  font-display: swap;
}
/* ...все веса */
```

**Вариант B: Локальные** (Futura PT, custom). Скопировать в правильную папку:

```bash
mkdir -p assets/fonts/<family>
cp <legacy>/project/assets/fonts/<family>/*.woff2 assets/fonts/<family>/
```

И в `fonts.css` указать локальные пути (`../../fonts/<family>/<file>.woff2`).

### Шаг 4 — Типография (kumho-style + brand-размеры)

`<v2>/assets/css/base/typography.css`:

```css
html { font-size: 10px; }
* { font-size: 1em; }

body, input, select, textarea {
  font-size: 1.6rem;
  font-family: var(--font-1-regular);
  line-height: 1.4;
  color: var(--color-2);
  @media (--lg) { font-size: 1.8rem; }
}

h1, h2, h3, h4, h5, h6, .heading, .title {
  margin-block: 0;
  font-family: var(--font-1-medium);
  line-height: 1.2;
}

h1, .h1 { font-size: 2.4em; @media (--lg) { font-size: 4em; } }
h2, .h2 { font-size: 2em;   @media (--lg) { font-size: 3em; } }
h3, .h3 { font-size: 1.6em; @media (--lg) { font-size: 2.2em; } }
/* ...h4-h6 */

/* Utility classes */
.font-1-light    { font-family: var(--font-1-light); }
.font-1-medium   { font-family: var(--font-1-medium); }
.weight-400      { font-family: var(--font-1-regular); }
.weight-700      { font-family: var(--font-1-bold); }
.uppercase       { text-transform: uppercase; }
.opacity-70      { opacity: 0.7; }
```

**Принцип**: размеры через `em`, responsive через `@media (--lg)`. h1-h6 = .h1-.h6 (класс можно ставить на любой элемент).

### Шаг 5 — Изображения

```bash
rsync -a <legacy>/project/data/img/ <v2>/data/img/
# rsync -a (БЕЗ --info=stats0 — macOS rsync 2.6.9 не поддерживает)
```

Проверить размер: `du -sh data/img/` — должен быть сопоставим с legacy (обычно 10-700 MB).

### Шаг 6 — Контент адаптация (главное)

**Структура JSON в baseline:**

```json
{
  "title": "Page title",
  "sections": [
    {
      "name": "intro",                     // имя файла templates/sections/<name>.twig
      "data": {                            // всё что было плоско в legacy — теперь в data
        "slider": {
          "items": [
            { "cover": "data/img/intro/1.webp", "alt": "..." }
          ]
        },
        "heading": {"tag": "h1", "title": "..."}
      }
    },
    {
      "name": "footer",
      "data": {}
    }
  ]
}
```

**Из legacy → в baseline:**

```javascript
// legacy
{
  "page": "index",
  "title": "...",
  "globals": { "brand": {...}, "phone": {...}, "models": [...], "articles": [...] },
  "firstScreen": [
    { "name": "header", "visible": true, "logo": "...", "button": {...} },
    { "name": "intro", "visible": true, "wave": {...}, "slides": [...] }
  ],
  "secondaryScreen": [
    { "name": "range", "visible": true, "heading": "...", "items": [...] },
    { "name": "footer", "visible": true, "logo": "...", ... }
  ]
}

// → baseline
{
  "title": "...",
  "sections": [
    { "name": "header", "data": {} },
    { "name": "intro", "data": { "slider": {"items": [/* slides → переименовать */]} } },
    { "name": "actions", "data": { "heading": {"tag":"h2","title":"..."}, "items": [/* range.items */] } },
    { "name": "footer", "data": {} }
  ]
}
```

**Маппинг секций legacy → baseline:**

| Legacy | Baseline | Заметки |
|---|---|---|
| `header` | `header` | без data — данные из global |
| `burger` | (часть header) | удалить, baseline header умеет burger сам |
| `intro` (slides) | `intro` (data.slider.items) | переименовать slides → slider.items |
| `range` (items) | `actions` | items с cover/title/href |
| `about` | `us` или `content` | text-section |
| `articleslist` | `news` | items = slugs новостей |
| `cataloglist` | `tires` | filter + items автоматически из коллекции |
| `digits` | `trust` | items с title/desc |
| `cap` | (отбросить) | декоративная секция, баseline её не требует |
| `dealers` | `dealers` | items с city, location, address, phones |
| `footer` | `footer` | без data — данные из global |

**globals → global.json** (один раз, не в каждой странице):

```json
// data/json/global.json
{
  "lang": [{"title":"Русский","code":"ru","direction":"ltr"}],
  "phones": [{"title": "8 (800) ...", "href": "tel:..."}],
  "email": "info@<domain>",
  "nav": { "ru": { "items": [{"title":"О нас","href":"/about/"}, ...] } },
  "logo": {
    "horizontal": {
      "white": {"src":"data/img/ui/logos/logo-h-color-1.svg","alt":"Brand"},
      "black": {"src":"data/img/ui/logos/logo-h-color-2.svg","alt":"Brand"}
    },
    "vertical": { /* то же */ }
  },
  "copyright": {"ru": "© Brand Name"},
  "cookie-panel": {"ru": {"desc": "...", "button": {...}}}
}
```

### Шаг 7 — Entity-данные (tires)

Legacy:

```json
{
  "name": "SPORT SA-37",
  "slug": "sport-sa-37",
  "visible": true,
  "types": ["Легковая"],
  "season": "Лето",
  "desc": "...full HTML...",
  "cover": "data/img/models/sport-sa-37/cover.webp",
  "images": [...],
  "sizes": [...]
}
```

→ baseline `data/json/ru/tires/<slug>.json`:

```json
{
  "slug": "sport-sa-37",
  "visible": true,
  "item": {
    "name": "SPORT SA-37",
    "code": "SA-37",
    "series": "TRAZANO SPORT",
    "season": "Лето",
    "types": ["Легковая"]
  },
  "desc": {
    "short": "Краткое описание для карточки и SEO",
    "full": "...full HTML..."
  },
  "cover": "data/img/models/sport-sa-37/cover.webp",
  "images": [...],
  "sizes": [...]
}
```

**Ключевое**: `item` обёртка с базовыми атрибутами, `desc.short/full` separated.

**Source slugs** для коллекции (нужно для baseline `injectListItems`):

```json
// data/json/ru/pages/<nav_slug>.json — например catalog.json
{
  "items": ["sport-sa-37", "radial-h188", "zupereco-z-107", ...]
}
```

### Шаг 8 — config/project.php

```php
return [
    'route_map' => [
        'catalog' => 'tires-list',     // /catalog/ → tires-list.json
        'articles' => 'articles',
        'buy' => 'dealers',
        'about' => 'about',
        'contacts' => 'contacts',
        'guarantee' => 'guarantee',
        'cookies-policy' => 'cookies-policy',
    ],

    'collections' => [
        'tires' => [
            'nav_slug'     => 'catalog',      // первый сегмент URL
            'list_page_id' => 'tires-list',
            'template'     => 'pages/tire.twig',   // важно: должен существовать (взять из kumho)
            'item_key'     => 'item',
            'data_dir'     => 'tires',
            'slugs_source' => 'items',
            'og_type'      => 'website',
            'entity_url_pattern' => '/catalog/{slug}',
        ],
        'news' => [
            'nav_slug' => 'articles',
            'list_page_id' => 'articles',
            'template' => 'pages/news.twig',
            'item_key' => 'news',
            'data_dir' => 'news',
            'slugs_source' => 'items',
            'og_type' => 'article',
            'entity_url_pattern' => '/articles/{slug}',
        ],
    ],

    'sitemap_pages' => ['index', 'about', 'contacts', 'guarantee', 'cookies-policy', 'tires-list', 'articles', 'dealers'],

    'sitemap_dynamic_pages' => [
        'dealers' => [
            'data_page' => 'dealers',
            'list_key' => 'items',
            'value_key' => 'city',
            'slugger' => 'city',
        ],
    ],

    'integrations' => [],
];
```

### Шаг 9 — Templates (entity-pages)

baseline по дефолту имеет только `pages/page.twig`. Для entity-страниц нужны `tire.twig`, `news.twig` — скопировать из kumho:

```bash
cp <ismart-platform>/../kumho-tires.ru/templates/pages/tire.twig templates/pages/
cp <ismart-platform>/../kumho-tires.ru/templates/pages/news.twig templates/pages/
```

И пометить как override (это deployment-specific layouts):

```bash
npm run distill -- mark-override $(pwd) templates/pages/tire.twig "Tire entity layout (заимствован из kumho)"
npm run distill -- mark-override $(pwd) templates/pages/news.twig "News entity layout (заимствован из kumho)"
```

### Шаг 10 — Build + smoke

```bash
mkdir -p logs cache
npm run build:dev
php -S 127.0.0.1:8080 -t public &
sleep 1
curl -sI http://127.0.0.1:8080/ | head -3
curl -sI http://127.0.0.1:8080/catalog | head -3
curl -sI http://127.0.0.1:8080/catalog/<first-tire-slug> | head -3
curl -sI http://127.0.0.1:8080/health
```

Ожидаемое: все 200, главная >15 KB, catalog содержит карточки.

---

## 4. Типичные проблемы и решения

### 4.1 `.env` `MAIL_SUBJECT_PREFIX=[Name]` — vlucas/phpdotenv падает

`distill init` подставляет `MAIL_SUBJECT_PREFIX=[Brand Name]` — квадратные скобки парсер dotenv не принимает.

**Фикс**: всегда оборачивать в кавычки:

```bash
sed -i '' 's|^MAIL_SUBJECT_PREFIX=\[.*\]|MAIL_SUBJECT_PREFIX="[Brand Name]"|' .env
```

(Постоянный фикс в `tools/distill/distill.mjs` — в opportunities.)

### 4.2 `APP_BASE_URL=https://<domain>/` в dev

`distill init` подставляет production-URL. В dev на `.test`-домене все assets ссылки уходят на production-сайт → ERR_BLOCKED_BY_ORB.

**Фикс**: для dev — `APP_BASE_URL=http://<slug>-v2.test/` (с протоколом http и .test).

### 4.3 `public/assets/` пустая директория

После `composer install` иногда создаётся пустая `public/assets/` (если PSR-4 autoload зацепил). Baseline `setup-public-links.js` не справляется с заменой непустой директории на symlink.

**Фикс**:

```bash
rm -rf public/assets
ln -s ../assets public/assets
```

`.gitignore` исключает `public/assets` — это нормально, symlink создаётся при сборке.

### 4.4 Корневой `.htaccess` блокирует `/assets/` и `/data/`

Baseline `.htaccess` имеет защиту для случая когда DocumentRoot=корень проекта вместо public/. Valet/простой Apache обслуживает корень → /assets, /data блокируются.

**Фикс** в `.htaccess`:

```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteRule ^(config|src|tools|cache|logs|vendor|docs|tests|node_modules)/ - [F,L]
    # /assets/ и /data/ — публичные, не блокируем

    # Существующие файлы — отдавать как есть
    RewriteCond %{REQUEST_FILENAME} -f
    RewriteRule ^ - [L]
    RewriteCond %{REQUEST_FILENAME} -d
    RewriteCond %{REQUEST_URI} ^/(assets|data)/
    RewriteRule ^ - [L]

    # Всё остальное — на public/index.php
    RewriteRule ^ public/index.php [QSA,L]
</IfModule>
```

И **`index.php` wrapper в корне**:

```php
<?php require __DIR__ . '/public/index.php';
```

### 4.5 Brand colors красные/неправильные

**Источник** brand-цветов — НЕ `dev/src/assets/css/base/variables.css` (там generic-defaults). А **`dev/src/assets/brands/<brand>/variables.css`** — содержит `--color-3`, `--color-4`, `--color-5` и font-family aliases (Gilroy/Futura PT/...).

**Не пропустить**: всегда проверять brand-папку перед переносом.

### 4.6 z-index не работает

Legacy использует `var(--z-index-3)` для header'а. Если эти переменные не определены — header без слоя.

**Фикс**: добавить в `variables.css`:

```css
--z-index-1: 1000;
--z-index-2: 990;
/* ...через 10 */
--z-index-10: 910;
```

Legacy-схема: **меньше число = выше слой** (нелогично, но соответствует существующей разметке).

### 4.7 Раздельные section name vs file name

baseline `page.twig` инклудит секции по `section.name` (`{% include 'sections/<name>.twig' ignore missing %}`). Если в JSON `name='cataloglist'`, файл должен быть `templates/sections/cataloglist.twig` — иначе **молча скип** (ignore missing).

Кроме того, baseline `injectListItems` ищет секцию по `name === nav_slug` (например, `catalog`). Двойное требование:

- `name === nav_slug` (для injectListItems)
- `sections/<name>.twig` существует

**Решение**: переименовать секции к **baseline-стандарту**:
- `cataloglist` (legacy) → `tires` (baseline-секция) — данные через `data.items[]`
- `articleslist` → `news`

То же для других legacy-only секций (`range` → `actions`, `about` → `us`/`content`, `digits` → `trust`, `cap` → удалить).

### 4.8 Двойная конкатенация URL `/http://host/...`

Если используешь legacy-twig с `{{root}}{{path}}` + baseline-JsonProcessor (`data/x` → `http://host/data/x`):

```
{{root}} + {{path}} = '/' + 'http://host/data/x' = '/http://host/data/x' → 404
```

**Решение системное (правильное)**: использовать baseline-templates вместо legacy. baseline-templates не имеют `{{root}}` префикса.

**Решение точечное** (если оставляешь legacy-twig): `root=''` + `JsonProcessor` оставляет absolute path `/data/x`. Override `src/Support/JsonProcessor.php`.

### 4.9 Globals `models`, `articles`, `brand` не работают

Legacy-секции (`cataloglist.twig`) ожидают глобальные переменные `models`, `articles`, `brand`, `phone`, `email`, `nav` — baseline не передаёт.

**Решение системное**: **переписать секции на baseline-стиль**, использовать `data.items` вместо `models`, `global.brand` вместо `brand`.

**Точечное** (если legacy-twig сохраняется): в `config/container.php` добавить `$env->addGlobal(...)` для каждой переменной. Загружать models/articles через `glob()` directory.

### 4.10 SEO без title

baseline-SEO ожидает `{title, description, og: {type, title, description}}` на каждую страницу.

Legacy `seo.json` содержит **общий** массив:

```json
{
  "pages": [
    { "name": "index", "meta": [{"name":"description","content":"..."}] },
    ...
  ]
}
```

**Конвертер**:

```python
for page in seo_data['pages']:
    target = name_map.get(page['name'], page['name'])
    title, description = '', ''
    for m in page.get('meta', []):
        if m.get('name') == 'description': description = m['content']
    # Если title не из meta — взять из соответствующей pages/<target>.json title
    pf = Path(f'data/json/ru/pages/{target}.json')
    if pf.exists() and not title:
        title = json.load(open(pf)).get('title', '')
    out = {'title': title, 'description': description, 'og': {'type':'website','title':title,'description':description}}
    json.dump(out, open(f'data/json/ru/seo/{target}.json', 'w'), ensure_ascii=False, indent=2)
```

### 4.11 Dealers без городов

Если `dealers.json` пустой — `/buy/{city}/` ничего не покажет. Items должны быть с `.city`:

```json
{
  "items": [
    { "name": "...", "city": "Москва", "region": "Москва", "address": "...", "phones": [...], "site": {...} }
  ]
}
```

Берётся из legacy `<buy.json>.dealers` массива.

### 4.12 Cover.webp отсутствует у entity

Legacy entity JSON ссылается на `data/img/models/<slug>/cover.webp`, но иногда файла нет (только `1.webp`-`5.webp`).

**Фикс**:

```bash
for d in data/img/models/*/; do
  [ ! -f "$d/cover.webp" ] && [ -f "$d/1.webp" ] && cp "$d/1.webp" "$d/cover.webp"
done
```

Либо — пересинхронизировать через `rsync` (часто файлы на проде есть, в локальной dev копии нет).

### 4.13 `parts/form.twig` — legacy include

Некоторые legacy-секции (`modal.twig`, `offer.twig`) включают `parts/form.twig`. В baseline нет `parts/`.

**Решение** (если legacy-twig сохраняется): создать stub:

```bash
mkdir -p templates/parts
echo '{# заглушка: TODO рефактор на components/form-callback.twig из baseline #}' > templates/parts/form.twig
```

**Системно**: переписать modal/offer на baseline-стиль с `{% include 'components/form-callback.twig' %}`.

---

## 5. Post-migration QA checklist

- [ ] Главная `/` — 200, HTML >15 KB, видны все секции (header/intro/footer + brand-specific)
- [ ] Каталог `/catalog/` (или `/tires/`) — 200, видны карточки шин, изображения подгружаются
- [ ] Tire detail `/catalog/<slug>/` — 200, галерея + размеры + описание
- [ ] Статьи `/articles/` + `/articles/<slug>/` — 200
- [ ] Дилеры `/buy/` + `/buy/<city>/` — 200, есть города и точки
- [ ] Статичные страницы (about, guarantee, contacts, policy, cookies-policy) — 200
- [ ] `/sitemap.xml` — все URL'ы покрыты
- [ ] `/health` — `{"status":"ok"}`
- [ ] Cookie-panel — отображается, кнопка работает
- [ ] Формы — submit отдаёт email (`MAIL_TO` в `.env`)
- [ ] CSS подгружается (`Content-Type: text/css`)
- [ ] JS подгружается (`Content-Type: application/javascript`)
- [ ] Шрифты подгружаются (`woff2` без 404)
- [ ] Изображения подгружаются (cover.webp всех шин и т.д.)
- [ ] Brand colors применились (header/footer/buttons — фирменные)
- [ ] z-index header работает (всегда на верху)
- [ ] No `ERR_BLOCKED_BY_ORB` в DevTools console
- [ ] No `/http://...` или `/data/.../http://...` в src/href
- [ ] No 404 на статике
- [ ] Lighthouse perf score ≥ baseline (или legacy, что выше)

---

## 6. References

- `docs/architecture/distillation.md` — общая стратегия дистилляции
- `docs/conventions/best-practices.md` — принципы кода
- `docs/conventions/naming.md` — PHP-нейминг
- `docs/notes/migrations/trazano.md` — конкретный план миграции trazano (написан до начала, корректировался по ходу)
- `docs/sessions/2026-05-20-distillation.md` — итоги первой сессии создания baseline

## 7. Что сейчас в opportunities (фиксы baseline'а нужны)

После реальной миграции trazano+mirage обнаружены недостатки baseline'а:

1. **`distill init` — кавычки в MAIL_SUBJECT_PREFIX** (`tools/distill/distill.mjs`):
   ```js
   env = env.replace(/^MAIL_SUBJECT_PREFIX=.*/m, `MAIL_SUBJECT_PREFIX="[${opts.name}]"`);
   ```

2. **`distill init --from <deployment>`** — копировать не только baseline, но и overrides существующего deployment'а. Use case: tire-based deployment получает kumho-overrides (`tire.twig`, `CitySlugger`) автоматически.

3. **`distill init --dev-domain <slug>.test`** — отдельный параметр для dev-URL. Сейчас `--domain` ставит prod URL в `.env`, что неудобно для локального dev.

4. **`tools/build/setup-public-links.js` — `rm -rf` перед symlink**. Сейчас падает на EPERM если `public/assets` существует как директория (от composer/PSR-4 autoload).

5. **`.htaccess` baseline шаблон** — слишком строгая защита `/assets/` блокирует Valet. Нужны два варианта: `.htaccess` для DocumentRoot=public/ (текущий) и для DocumentRoot=корень (с разрешением /assets/, /data/, fallback на public/index.php).

6. **Документ `docs/conventions/routes-and-urls.md` устарел**: TrailingSlashMiddleware редиректит `/catalog/` → `/catalog`, а доку говорит наоборот.

7. **`distill init` smoke test** — после создания нового deployment должен запускать `composer install && npm install && npm run build:dev && php -S 127.0.0.1:RANDOM -t public &` и проверять что главная отдаёт 200. Это бы поймало большинство bugs init'а.

Все эти opportunities должны попасть в `docs/notes/improvements.md` как high-priority после следующей сессии в baseline.
