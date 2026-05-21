# Миграция trazano-tires.ru на iSmart Platform

**Статус:** ✅ Выполнена (2026-05-21)
**Ветка:** `feat/migrate-to-ismart-platform` @ qbsm/trazano-tires.ru
**Локальная папка:** `~/Sites/trazano-tires.ru-v2/` (cutover на основной путь ещё не делался)
**Детали:** `~/Sites/trazano-tires.ru-v2/MIGRATION-STATUS.md`
**Дата плана:** 2026-05-20 (исходный план ниже — для истории)
**Источник-донор:** `kumho-tires.ru` (та же тематика — шины)

> Аналогичная миграция `mirage-russia.ru` выполнена параллельно — ветка
> `feat/migrate-to-ismart-platform` @ qbsm/mirage-russia.ru,
> папка `~/Sites/mirage-russia.ru-v2/`.

> Cводка по всем deployments: `docs/notes/migrations/status-by-deployment.md`.

---

## 0. Контекст

`trazano-tires.ru` — production-сайт каталога шин Trazano. Активный (свежие коммиты, 626 MB контента), репо `github:qbsm/trazano-tires.ru`.

### Текущий стек (legacy)

| Слой | Сейчас | Целевое (ismart-platform) |
|---|---|---|
| **Framework** | Самописный `index.php` + ручной роутинг | Slim 4 + PSR-7 + PSR-15 |
| **DI** | Нет, прямые `require` | PHP-DI |
| **Twig** | 1.x (`Twig_Environment`, `Twig_Loader_Filesystem`) | 3.x |
| **Mailer** | PHPMailer 6.1 | Symfony Mailer 8 |
| **Forms** | `ismart/form` (внутренний пакет, dev-master) | `ApiSendAction` + `MailService` baseline |
| **Build** | Gulp + Webpack (гибрид) | Webpack 5 + PostCSS |
| **Structure** | `project/index.php` + `dev/src/` (исходники) + `parts/` | `public/index.php` + `assets/` + `templates/{components,sections,pages}/` |
| **Cache** | `project/cache/twig` (ручной mkdir + auto_reload) | Slim Twig + автоматический cache |
| **Sitemap** | Статический `sitemap.xml` | Динамический `SitemapAction` |

### Контент trazano (что переносим как есть)

Страницы (`project/templates/pages/`): `about`, `article`, `articles`, `buy`, `catalog`, `contacts`, `cookies-policy`, `guarantee`, `index`, `product` (всего 10).

Данные (`project/data/{content,docs,img,production}`) — JSON-контент, документы, изображения, продакшен-ассеты.

GEO-задел уже есть: `llms.txt`, `llms-full.txt` — нужно конвертировать в `tools/ops/generate-llms-full.php` формат baseline'а.

---

## 1. Ключевая идея: kumho — архитектура, trazano — оформление

**Принцип:** оформление сайта сохраняется от trazano, архитектура полностью заменяется на kumho-структуру.

- **От kumho** — Twig-разметка (структура шаблонов, имена секций/блоков, JSON-структура), JS-поведение (сборка swiper'ов, GLightbox, формы), конфиг коллекций (`tires`, `news`, `dealers` с CitySlugger), URL-механизм через `route_map`.
- **От trazano** — CSS целиком (цвета, шрифты, типографика, layout-композиция, отступы, тени, анимации), логотипы, фавиконы, фирменные изображения, юр-контент, тексты, фотки шин.

### Что переносим от kumho (архитектура и поведение)

| Файл | Что даёт |
|---|---|
| `templates/pages/tire.twig` | Twig-структура детальной страницы шины (галерея, размеры, аккордеоны) |
| `templates/pages/news.twig` | Twig-структура статьи (используется для trazano `articles`) |
| `templates/sections/{tires,dealers,news,partners}.twig` | разметка секций (HTML-классы, scaffold вызовов компонентов) |
| `templates/components/{card-tire,card-dealer,card-news,...}.twig` | компоненты карточек (внутренняя разметка) |
| `config/project.php` | `route_map` + `collections` (tires, news, dealers) + sitemap-config |
| `src/Support/CitySlugger.php` | транслитерация городов для `/buy/{city}/` |
| `assets/js/sections/{tires,dealers}.js` | поведение секций (фильтры, переключатели) |
| `assets/js/pages/tire-detail.js` | галерея + zoom детальной шины |
| `tools/scaffold/create-collection.js` (через baseline) | dev-tool для будущих коллекций |

### Что переносим от trazano (оформление)

| Источник trazano | Целевой файл baseline |
|---|---|
| `project/data/content/styles/` или `dev/src/assets/css/` | `assets/css/base/{variables,fonts,typography,...}.css` |
| Цветовая палитра (CSS variables) | `assets/css/base/variables.css` |
| Шрифты `.woff2` | `assets/fonts/` |
| `project/data/img/` (фотки шин, иконки UI) | `data/img/` |
| Логотипы Trazano (SVG, разные размеры) | `data/img/ui/logos/` |
| Тексты страниц (Twig в trazano) | секции внутри `data/json/ru/pages/*.json` |
| Каталог шин (контент trazano) | `data/json/ru/tires/*.json` |
| Юр-документы (cookies-policy, garantee) | `data/json/ru/pages/{slug}.json` |

### Что **не** переносим

- **Из kumho:** `assets/css/sections/*.css`, `assets/css/pages/*.css` (это **визуал kumho**, заменяется на trazano-визуал), kumho-brand assets (logo-h-color-1.svg и т.д.), Photoroom-action (kumho-only).
- **Из trazano:** весь PHP-код (`form.php`, `index.php`, `read-json.php`, `json.php`, `copy.php`), Gulp-конфиги, кастомные ismart/form/phpmailer, Twig 1.x template logic (если они с `Twig_*` API — переписываем).

То есть **trazano-v2 = baseline + kumho-architecture-overrides + trazano-visual-overrides + trazano-content**.

---

## 2. Mapping страниц

| trazano (legacy) | ismart-platform (target) | Тип | Заметки |
|---|---|---|---|
| `pages/index.twig` | `data/json/ru/pages/index.json` | data-driven | секции: intro, partners, tires, dealers, news, contacts |
| `pages/catalog.twig` | `data/json/ru/pages/tires-list.json` | list-collection | использует kumho-механику `tires-list` |
| `pages/product.twig` | `data/json/ru/tires/{slug}.json` + рендер через `pages/tire.twig` | entity (tire) | kumho `tire.twig` подходит как есть |
| `pages/articles.twig` | `data/json/ru/pages/news.json` | list-collection | переименовать в `news` или оставить `articles` через `route_map` |
| `pages/article.twig` | `data/json/ru/news/{slug}.json` | entity (news) | kumho `news.twig` подходит |
| `pages/buy.twig` | `data/json/ru/pages/dealers.json` | list-collection | kumho `/buy/{city}/` уже работает с CitySlugger |
| `pages/about.twig` | `data/json/ru/pages/about.json` | static | новая generic-страница |
| `pages/contacts.twig` | `data/json/ru/pages/contacts.json` | static | в kumho тоже есть |
| `pages/guarantee.twig` | `data/json/ru/pages/guarantee.json` | static | новая страница, нет в kumho |
| `pages/cookies-policy.twig` | `data/json/ru/pages/cookies-policy.json` | static | в kumho тоже есть |

**URL-структура остаётся** (то же `/`, `/about/`, `/articles/`, `/articles/{slug}/`, `/buy/`, `/buy/{city}/`, `/catalog/`, `/catalog/{slug}/`, `/contacts/`, `/cookies-policy/`, `/guarantee/`) — это критично, чтобы не ломать SEO и не нужны 301-redirects.

Если в kumho `route_map` сейчас `tires => tires-list`, для trazano это будет `catalog => tires-list`, а `articles => news`. Один config-файл, без изменений в коде.

---

## 3. Этапы миграции

### Этап A — Audit & Mapping (1 день)

- [ ] Inventory всех 10 страниц trazano: какие секции, какой контент, какие интеракции.
- [ ] Inventory всех data/content JSON-файлов: сколько шин, сколько статей, какие города/дилеры.
- [ ] Inventory всех assets: фирменные шрифты, иконки, изображения.
- [ ] Список kumho-overrides — что берём, что заменяем (см. §1).
- [ ] Решить про URL — оставляем как есть (`catalog/` vs `tires/` в kumho — нужен `route_map`).

**Артефакт:** обновлённая `§2 Mapping` в этом документе + список deltas.

### Этап B — Bootstrap нового deployment (0.5 дня)

```bash
cd /Users/danich/Sites/ismart-platform
npm run distill -- init trazano-tires.ru-v2 \
  --name "Trazano Tires" \
  --domain trazano-tires.ru
```

- [ ] Деплоймент создан в `/Users/danich/Sites/trazano-tires.ru-v2/`.
- [ ] `composer install` + `npm install` + `npm run build:dev`.
- [ ] Smoke: `php -S localhost:8080 -t public` отдаёт baseline главную.
- [ ] `git init`, commit init.

### Этап C — Перенос архитектурных overrides от kumho (1 день)

Берём только **структуру** (Twig + JS + конфиг), CSS оставляем baseline'а — позже заменится trazano-визуалом:

```bash
KUMHO=/Users/danich/Sites/kumho-tires.ru
NEW=/Users/danich/Sites/trazano-tires.ru-v2

# Twig — markup-структура шаблонов и компонентов (БЕЗ CSS-стилей)
cp $KUMHO/templates/pages/tire.twig $NEW/templates/pages/
cp $KUMHO/templates/pages/news.twig $NEW/templates/pages/
cp $KUMHO/templates/sections/{tires,dealers,news,partners}.twig $NEW/templates/sections/
cp $KUMHO/templates/components/{card-tire,card-dealer,card-news,card-action,card-doc}.twig $NEW/templates/components/

# JS — поведение (фильтры каталога, галерея, дилеры, формы)
cp $KUMHO/assets/js/sections/{tires,dealers}.js $NEW/assets/js/sections/
cp $KUMHO/assets/js/pages/tire-detail.js $NEW/assets/js/pages/

# config — структура коллекций и роутинг
cp $KUMHO/config/project.php $NEW/config/project.php
# (затем редактирование под trazano: route_map "catalog → tires-list", и т.д.)
```

Затем — `distill mark-override` для каждого:

```bash
npm run distill -- mark-override $NEW templates/pages/tire.twig "архитектура из kumho: детальная страница шины"
npm run distill -- mark-override $NEW templates/pages/news.twig "архитектура из kumho: статьи"
# ... для остальных
```

- [ ] 10–12 файлов скопированы (только Twig + JS + config; CSS оставляем baseline).
- [ ] Все помечены через `distill mark-override` с обозначением "архитектура из kumho".

### Этап D — Перенос визуала от trazano (2–3 дня)

**Полный CSS-перенос целиком:**

```bash
TRAZANO=/Users/danich/Sites/trazano-tires.ru
NEW=/Users/danich/Sites/trazano-tires.ru-v2

# CSS — все исходники trazano (палитра, типографика, layout, секции, страницы)
cp -r $TRAZANO/dev/src/assets/css/* $NEW/assets/css/   # если структура подходит
# или per-file перенос: variables.css, fonts.css, typography.css, sections/*.css, pages/*.css

# Шрифты
cp -r $TRAZANO/project/data/fonts/ $NEW/assets/fonts/   # либо где они лежат

# Логотипы / иконки UI
cp -r $TRAZANO/project/data/img/ui/ $NEW/data/img/ui/

# Фотографии (шины, дилеры, статьи) — большой объём, через rsync
rsync -a $TRAZANO/project/data/img/{tires,dealers,news,about}/ $NEW/data/img/
```

- [ ] `assets/css/base/variables.css` — палитра Trazano (NOT kumho).
- [ ] `assets/css/base/fonts.css` — `@font-face` Trazano-шрифтов.
- [ ] `assets/css/base/typography.css` — типографика Trazano (заголовки, тело, ссылки).
- [ ] `assets/css/sections/*.css` — стили секций под Trazano-вёрстку (НЕ kumho-стили).
- [ ] `assets/css/pages/*.css` — page-specific layout.
- [ ] `assets/css/components/*.css` — фирменные компоненты (button, card, form-callback и т.д.).
- [ ] Сверить с production trazano-tires.ru: визуально страницы выглядят как сейчас.

**Проверка соответствия архитектуре kumho**: вёрстка trazano использует те же HTML-классы что в kumho-шаблонах? Скорее всего нет — потребуется адаптация CSS к новому markup'у. Делаем за **page-by-page**:

- [ ] index — главная: hero, секции tires/dealers/news соответствуют Twig-вёрстке kumho.
- [ ] catalog (tires-list) — список + фильтры.
- [ ] product (tire detail) — галерея + размеры.
- [ ] articles (news) — список и detail.
- [ ] buy (dealers) — карта/список дилеров по городам.
- [ ] about, guarantee, contacts, cookies-policy — простые секции.

### Этап E — Перенос контента (2–3 дня)

- [ ] **Каталог шин:** конвертация `project/data/content/tires/*` (или где они) → `data/json/ru/tires/*.json` в формате baseline. Использовать тот же item-обёртку (`item: { code, series, name, ... }`).
- [ ] **Статьи:** `project/data/content/articles/*` → `data/json/ru/news/*.json` (либо переименовать роут на `articles/` через `route_map`).
- [ ] **Дилеры:** `project/data/content/dealers/*` → `data/json/ru/pages/dealers.json` (items[].city).
- [ ] **Статичные страницы:** about, guarantee, contacts — каждая → `data/json/ru/pages/{slug}.json` с секциями.
- [ ] **Изображения:** `project/data/img/` → `data/img/` нового deployment'а (или symlink).

Параллельно — обновление `config/project.php`:

```php
'route_map' => [
    'catalog' => 'tires-list',     // URL trazano /catalog/ → page_id tires-list
    'articles' => 'news',           // URL trazano /articles/ → page_id news
    'buy' => 'dealers',
],

'collections' => [
    'tires' => [
        'nav_slug'     => 'catalog',
        'list_page_id' => 'tires-list',
        'template'     => 'pages/tire.twig',
        'item_key'     => 'item',
        'data_dir'     => 'tires',
        'entity_url_pattern' => '/catalog/{slug}',
        // ...
    ],
    'news' => [
        'nav_slug'     => 'articles',
        'list_page_id' => 'news',
        'template'     => 'pages/news.twig',
        'item_key'     => 'news',
        'data_dir'     => 'news',
        'entity_url_pattern' => '/articles/{slug}',
        // ...
    ],
],

'sitemap_pages' => ['index', 'about', 'guarantee', 'contacts', 'cookies-policy', 'tires-list', 'news', 'dealers'],

'sitemap_dynamic_pages' => [
    'dealers' => ['data_page' => 'dealers', 'list_key' => 'items', 'value_key' => 'city', 'slugger' => 'city'],
],
```

### Этап F — SEO + GEO (1 день)

- [ ] `data/json/ru/seo/*.json` — мета-теги, OG, JSON-LD для каждой страницы.
- [ ] `config/llms-full.php` — конфиг для AI-краулеров (как kumho).
- [ ] `public/robots.txt` — стандартный (X-Robots-Tag через middleware закроет staging автоматом).
- [ ] Сверить sitemap.xml через `SitemapAction` — должен покрывать все URL'ы.
- [ ] Если URL'ы поменялись (например, `/catalog` вместо `/tires`) — `config/redirects.json` с 301-редиректами.

### Этап G — QA + Staging (1–2 дня)

- [ ] Staging deploy на `trazano-tires.ru.ismart.pro`:
  - `ssh root@ismart.pro` → создать `/var/www/ismart/trazano-tires.ru.ismart.pro/`
  - git clone, composer install, npm install, build
  - nginx vhost (по шаблону kumho)
  - certbot SSL
- [ ] Smoke checklist:
  - Главная 200
  - `/catalog/` 200, видны шины
  - `/catalog/{slug}/` 200 — детальная шина с image gallery + zoom
  - `/articles/` + `/articles/{slug}/` 200
  - `/buy/` + `/buy/{city}/` 200
  - `/contacts/` 200, форма обратной связи — submit → email пришёл
  - `/about/`, `/guarantee/`, `/cookies-policy/` 200
  - `/sitemap.xml` — полный список URL
  - `/health` → `{"status":"ok"}`
  - `X-Robots-Tag: noindex, nofollow` на staging (`*.ismart.pro`)
- [ ] Cross-browser: Chrome, Safari, Firefox, мобильный браузер.
- [ ] Lighthouse perf — сравнить с legacy trazano (должен быть на уровне или лучше).
- [ ] Формы — проверить mail приходит, валидация работает, CSRF не падает.

### Этап H — Production cutover (1 день)

- [ ] DNS не трогаем (домен тот же), переключаем nginx на новую папку.
- [ ] Или: rsync новый код на тот же production-host, swap symlink.
- [ ] Мониторинг 30 минут — 1 час: 5xx errors, email отправка, search в каталоге.
- [ ] Если что-то падает — быстрый rollback (legacy папка не удалена).

### Этап I — Cleanup (0.5 дня)

- [ ] Старый код `project/` + `dev/` — архивировать в branch `legacy-v1` или tag `legacy-trazano-v1`.
- [ ] Удалить устаревшие зависимости (`twig/twig: ~1.0`, `phpmailer`, `ismart/form`).
- [ ] Обновить README.md / CLAUDE.md под новую архитектуру.
- [ ] Финальный `distill diff` против baseline — все overrides помечены.

---

## 4. Риски и митигация

| Риск | Вероятность | Митигация |
|---|---|---|
| **URL'ы поменяются → SEO просадка** | Средняя | Сохранять старые URL через `route_map` + `redirects.json` для всех 301-редиректов |
| **Twig 1.x → 3.x breaking changes** | Низкая (мы не конвертируем templates, а используем kumho-готовые) | Per-template review только если нужно перенести специфичный шаблон |
| **Контент потеряется при переносе** | Средняя | Скрипт-конвертер из старого JSON формата в новый baseline-формат + тесты соответствия |
| **Performance regression** | Низкая | Slim DI + Twig 3 + PostCSS — производительность kumho уже измерена. Twig cache включён в production |
| **Формы перестанут работать** | Средняя | E2E тест submit'а формы перед cutover, сравнение с старой версией |
| **GEO/llms.txt контент потеряется** | Низкая | Перенести через `generate-llms-full.php` config с тем же контентом, что в старом llms-full.txt |
| **Production downtime** | Средняя | Rsync + swap symlink — секунды. Старый код в `_old/` папке для rollback |

---

## 5. Что НЕ переносим

- Кастомные `form.php`, `read-json.php`, `json.php`, `copy.php` — заменяются ApiSendAction + DataLoaderService.
- `dev/gulpfile.js`, `dev/ismart-gulp.js` — Gulp заменяется Webpack-only сборкой.
- `project/cache/twig` — Slim сам управляет.
- Зависимости: `phpmailer`, `ismart/form`, `twig/twig: ~1.0` — заменяются baseline-стеком.

---

## 6. Возможные улучшения по ходу

- **`distill init --from <existing-deployment>`** — расширение CLI: копировать не только baseline, но и overrides существующего deployment'а как стартовую точку. Тогда Step C (перенос kumho-overrides) становится одной командой:

  ```bash
  npm run distill -- init trazano-tires.ru-v2 --from ../kumho-tires.ru
  ```

  Кандидат на реализацию **после** trazano-миграции (валидируется на реальном кейсе).

- **`distill sync <deployment>`** — синхронизировать CORE-файлы из baseline в deployment. После trazano-миграции — применять регулярно по drift-репорту.

- **Генератор данных tire → news → page** — если в trazano-data есть нестандартный формат, написать в `tools/scaffold/migrate-trazano-data.js` (одноразовый, оставить в commits для audit).

---

## 7. Чек-лист готовности к старту

Перед началом этапа A:

- [ ] PR #1 в ismart-platform смержен (или baseline стабилен в `distill/initial-baseline` ветке).
- [ ] Production staging baseline'а работает (https://ismart-platform.ismart.pro/).
- [ ] `distill init` smoke-протестирован (см. session 2026-05-20).
- [ ] Согласован slug (`trazano-tires.ru` для прода, `trazano-tires.ru.ismart.pro` для staging).
- [ ] Согласован цвет/брендинг с дизайнером (если меняется).
- [ ] Backup текущего trazano (full rsync) перед началом cutover'а.

---

## 8. Метрика успеха

- Сайт `trazano-tires.ru` доступен на новом стеке без downtime'а > 5 минут.
- Все 10 страниц рабочие, 200 OK, контент идентичен legacy-версии.
- SEO sitemap покрывает все URL'ы.
- Lighthouse perf score ≥ legacy baseline.
- Формы отправляют email без ошибок (E2E проверка).
- `distill diff trazano-tires.ru-v2` показывает чёткую картину: ~15 overrides (kumho-based), 0 unreviewed drift.
