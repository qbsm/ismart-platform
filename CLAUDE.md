# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

All responses, questions, and explanations must be in Russian (русский язык).

## Project Overview

**iSmart Platform** — тиражируемая многоязычная веб-платформа на PHP 8.5+ (Slim 4, Twig 3, Webpack 5, PostCSS). JSON-управляемый контент, content-agnostic ядро.

Этот репозиторий — **canonical baseline** платформы. Конкретные production deployment'ы (kumho-tires.ru, italycommunity.ru, beepitron.com и т.д.) — отдельные репозитории, дистиллированные от этого baseline'а. Стратегия дистилляции и инструменты sync описаны в `docs/architecture/distillation.md`. Соглашения по нейму и стилю — в `docs/conventions/`. Живой журнал улучшений — в `docs/notes/improvements.md`.

Три компонента целевой системы:
- **PHP (этот репозиторий)** — UI, контент, SEO, формы, API-прокси
- **n8n** (будущее) — маршрутизация, триггеры, интеграции (max 10-15 нод на workflow)
- **Django** (будущее) — бизнес-логика, AI-агенты, ML, REST API, Celery

## Development Commands

```bash
# Инициализация проекта
npm run init                    # npm install + composer install + init-env

# Разработка (watch CSS + JS)
npm run dev

# Сборка
npm run build:dev               # Dev: CSS + JS + clean + symlinks
npm run build                   # Production: check + lint + test + build + clean + symlinks

# Тестирование
npm test                        # validate-json + PHPUnit + Vitest
npm run test:php                # vendor/bin/phpunit --no-coverage
npm run test:js                 # vitest run
npm run test:smoke              # node tests/smoke/smoke.js (требует запущенный сервер)

# Линтинг и форматирование
npm run lint                    # ESLint (JS)
npm run lint:css                # Stylelint (CSS)
npm run lint:php                # PHPStan
npm run format                  # Prettier (JS/JSON/MD)
npm run format:php              # PHP-CS-Fixer
npm run check                   # Все линтеры + форматирование + тесты

# Scaffold-генераторы
npm run create-page -- <slug>          # Создать страницу
npm run create-collection -- <slug>    # Создать коллекцию (tires, news и т.д.)
npm run create-section -- <name>       # Создать секцию (Twig + JS + CSS)
npm run create-component -- <name>     # Создать компонент (Twig + JS + CSS)
npm run create-deployment -- <slug>    # Создать deployment для нового клиента

# Утилиты
npm run validate-json           # Валидация всех JSON в data/json/
npm run build:images            # Оптимизация изображений через Sharp
npm run generate-llms           # Генерация llms-full.txt для AI-контекста

# PHP dev-сервер
php -S localhost:8080 -t public
```

## Architecture

### Жизненный цикл запроса

```
public/index.php → DI Container → Middleware Stack → Routes → PageAction
  → DataLoaderService (загружает JSON)
  → LanguageService (определяет язык)
  → SeoService (SEO-данные)
  → TemplateDataBuilder (собирает контекст)
  → Twig render (templates/pages/page.twig)
```

### Content-Agnostic ядро

Ядро (`src/`) не содержит упоминаний конкретного контента (tires, news, kumho). Вся контент-специфика — в `config/project.php` и `data/json/`.

**Коллекции** (tires, news и др.) параметризуются через `config/project.php`:
```php
'collections' => [
    'tires' => [
        'nav_slug' => 'tires',
        'list_page_id' => 'tires-list',
        'template' => 'pages/tire.twig',
        'item_key' => 'tire',
        'data_dir' => 'tires',
        'slugs_source' => 'items',
        'og_type' => 'product',
    ],
],
```

`PageAction` обрабатывает все коллекции единым циклом — без if/switch на тип контента.

### Конфигурация проекта (два уровня)

- **`config/settings.php`** — ядро платформы (пути, кэш, Twig, rate limit, CORS, языки из global.json)
- **`config/project.php`** — конфигурация конкретного deployment'а (route_map, collections, sitemap_pages, integrations). Шаблон: `config/project.php.dist`

### Структура данных (JSON)

```
data/json/
  global.json                   # Навигация, контакты, языки, формы, cookie — общее для всех страниц
  {lang}/
    pages/{page_id}.json        # Контент страницы: sections[] с type + data
    seo/{page_id}.json          # SEO: title, description, og:*, json-ld
    {collection_dir}/           # Сущности коллекции (tires/at52.json, news/launch-2026.json)
```

Каждая страница — массив `sections`, каждая секция имеет `type` (имя Twig-шаблона) и `data`. Шаблон `pages/page.twig` рендерит секции циклом.

### Frontend

- **Entry point:** `assets/js/main.js` → Webpack → `assets/js/build/`
- **CSS:** `assets/css/` → PostCSS (import, nesting, preset-env, autoprefixer, cssnano) → `assets/css/build/`
- **Webpack code splitting:** runtime, util-vendors (jQuery, Inputmask), ui-vendors (Swiper, GLightbox, Animate.css), vendors (остальное), main
- **Manifest:** `assets/js/build/asset-manifest.json` — маппинг чанков, используется Twig-расширением `AssetExtension`
- **CSS hash:** `assets/css/build/css-manifest.json` — маппинг CSS-файлов с хешами

### Middleware Stack (порядок важен)

RequestDuration → CorrelationId → SecurityHeaders → CORS → BodyParsing → RateLimit → Language → Redirect → TrailingSlash → Routing → ErrorHandling

### Event Dispatcher (PSR-14, league/event)

Три события в `PageAction`: `EntityResolved`, `PageLoaded`, `SeoBuilt` — точки расширения для будущих интеграций.

### Twig Extensions

- **AssetExtension** — `asset()` для JS/CSS с manifest lookup
- **UrlExtension** — `page_url()`, `base_url()` для построения URL
- **DataExtension** — `picture()`, `image_dimensions()` для адаптивных изображений

## Key Patterns

- **Весь контент на русском** — UI, JSON-данные, документация
- **Многоязычность** — языки из `global.json`, данные в `data/json/{lang}/`, middleware определяет язык из URL
- **Progress хранится в localStorage** — нет бэкенда для пользовательского состояния
- **Изображения** — адаптивные через `picture.twig`, размеры в `config/image-sizes.json`, dimensions в `data/img/image-dimensions.json`
- **Symlinks/Junction** — на Windows используются junction вместо symlink (`setup-public-links.js`)
- **Windows-специфика** — нормализация путей `str_replace('\\', '/')` в `BaseUrlResolver` и `container.php`

## Testing

- **PHPUnit** — `tests/php/Unit/` и `tests/php/Integration/`. Конфиг: `phpunit.xml`
- **Vitest** — `tests/js/` (debounce-throttle, url, validation)
- **Smoke** — `tests/smoke/smoke.js` (проверка HTTP-статусов основных URL)

## Important Files

- `config/project.php` — **главный файл для кастомизации** deployment'а (route_map, collections, sitemap_pages)
- `data/json/global.json` — глобальные данные (навигация, контакты, языки, формы)
- `src/Action/PageAction.php` — основной обработчик всех страниц
- `src/Service/DataLoaderService.php` — загрузка JSON-данных (loadPage, loadEntity, loadEntitySlugs)
- `src/Service/TemplateDataBuilder.php` — сборка контекста для Twig
- `templates/pages/page.twig` — data-driven рендеринг секций
- `templates/base.twig` — базовый layout (SEO, preload, Schema.org, analytics)

## Добавление нового контента

### Новая страница
```bash
npm run create-page -- <slug>
# Затем добавить slug в sitemap_pages в config/project.php
```

### Новая коллекция
```bash
npm run create-collection -- <slug>
# Затем добавить блок в collections и route_map в config/project.php
```

### Новый deployment (клиент)
```bash
npm run create-deployment -- <client-slug>
# Создаст deployments/<client-slug>/ с docker-compose, nginx, .env, project.php, данными
```