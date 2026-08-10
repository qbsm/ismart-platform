# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

All responses, questions, and explanations must be in Russian (русский язык).

## Project Overview

**iSmart Platform** — тиражируемая многоязычная веб-платформа на PHP 8.5+ (Slim 4, Twig 3, Webpack 5, PostCSS). JSON-управляемый контент, content-agnostic ядро.

Этот репозиторий — **canonical baseline** платформы. Конкретные production deployment'ы (kumho-tires.ru, italycommunity.ru, beepitron.com и т.д.) — отдельные репозитории, дистиллированные от этого baseline'а. Документация платформы — на docs.ismart.pro (раздел `ismart-platform`), в репозитории её не держим: стратегия дистилляции и инструменты sync — `architecture/distillation.md`, соглашения по нейму и стилю — `conventions/`, живой журнал улучшений — `notes/improvements.md`.

Три компонента целевой системы:
- **PHP (этот репозиторий)** — UI, контент, SEO, формы, API-прокси
- **n8n** (будущее) — маршрутизация, триггеры, интеграции (max 10-15 нод на workflow)
- **Django** (будущее) — бизнес-логика, AI-агенты, ML, REST API, Celery

## Development Commands

Полный список — `package.json scripts`. Смоук-тесты (`npm run test:smoke`) требуют запущенный сервер.

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

**Коллекции** (tires, news и др.) параметризуются через `config/project.php`.

`PageAction` обрабатывает все коллекции единым циклом — без if/switch на тип контента.

### Конфигурация проекта (два уровня)

- **`config/settings.php`** — ядро платформы (пути, кэш, Twig, rate limit, CORS, языки из global.json)
- **`.env`** — секреты и параметры deployment'а. Полный справочник — `reference/env.md` на docs.ismart.pro; правило имён: префикс = имя канала (`MAIL_`, `CALLTOUCH_`, `TELEGRAM_`, `SHEETS_`, `RESCUE_`)
- **`config/project.php`** — конфигурация конкретного deployment'а (route_map, collections, sitemap_pages, integrations). Шаблон: `config/project.php.dist`

### Структура данных (JSON)

Каждая страница (`data/json/{lang}/pages/{page_id}.json`) — массив `sections`, каждая секция имеет `type` (имя Twig-шаблона) и `data`. Шаблон `pages/page.twig` рендерит секции циклом. `global.json` — общее для всех страниц (навигация, контакты, языки, формы).

### Middleware Stack (порядок важен)

RequestDuration → CorrelationId → SecurityHeaders → CORS → BodyParsing → RateLimit → Language → Redirect → TrailingSlash → Routing → ErrorHandling

### Event Dispatcher (PSR-14, league/event)

Три события в `PageAction`: `EntityResolved`, `PageLoaded`, `SeoBuilt` — точки расширения для будущих интеграций.

### Notification Channels (ADR-0005)

`ApiSendAction` отправляет submit формы в 4 базовых канала через `NotificationDispatcher`: `mail`, `calltouch`, `telegram`, `google_sheets`. Каждый канал — отдельный класс под `ChannelInterface` (`src/Notification/Channel/`). Канал без credentials отдаёт `disabled` через `isEnabled()`, не падает. JSON response содержит `channels: {name: status}`. Throwable одного канала изолируется и не блокирует остальные.

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
- **Inline `<style>` в JSON-контенте — запрещён без необходимости.** Правила для классов контента (`.content-policy`, `.content-warranty` и т.п.) держим в `assets/css/sections/content.css` (или соответствующем модуле). Inline `<style>` дублирует селекторы, разрастает HTML, мешает кэшу/CSP и нарушает разделение data/style.

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