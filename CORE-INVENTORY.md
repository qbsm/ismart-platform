# CORE INVENTORY — ядро iSmart Platform

Карта файлов **ядра** baseline'а `ismart-platform/` с описанием назначения каждого и статусом в трёх production deployment'ах (kumho, italy, beepitron).

| Метка | Значение |
|---|---|
| `✓`   | файл присутствует и идентичен baseline'у |
| `M`   | файл присутствует, но содержимое расходится (drift) |
| `✗`   | файла нет в deployment'е |

Категории:

- `CORE ✓` — есть во всех 3, идентичен. Безусловное ядро.
- `CORE drift` — есть во всех 3, но содержимое разошлось. Кандидат на унификацию.
- `partial (N/3)` — есть только в части deployments.
- `BASELINE-only` — впервые в baseline'е, ещё не распространён.

Сгенерировано: `node tools/distill/build-inventory.mjs > CORE-INVENTORY.md` (2026-05-20)

---

## Точка входа и роутинг

| Файл | Назначение | kumho | italy | beepitron | Категория |
|---|---|:-:|:-:|:-:|---|
| `public/index.php` | — | ✓ | M | M | CORE drift |
| `config/routes.php` | — | M | M | M | CORE drift |
| `config/middleware.php` | Slim middleware: last added = outermost = runs first. | ✓ | ✓ | M | CORE drift |
| `config/container.php` | За прокси схема приходит в X-Forwarded-Proto; иначе HTTPS | M | M | M | CORE drift |
| `config/settings.php` | APP_ENV: production | development — разделение окружений (кэш Twig, уровень л... | M | M | M | CORE drift |
| `config/errors.php` | Карта доменных ошибок: HTTP-код → заголовок и сообщение для пользователя | ✓ | ✓ | ✓ | CORE ✓ |
| `config/project.php.dist` | — | M | ✗ | ✗ | partial (1/3) |
| `config/llms-full.php.dist` | — | ✗ | ✗ | ✗ | BASELINE-only |
| `config/image-sizes.json` | — | ✓ | M | ✗ | partial (2/3) |
| `config/redirects.json` | — | ✓ | ✓ | M | CORE drift |

## src/Action — контроллеры

| Файл | Назначение | kumho | italy | beepitron | Категория |
|---|---|:-:|:-:|:-:|---|
| `src/Action/ApiSendAction.php` | CSRF | M | M | M | CORE drift |
| `src/Action/HealthAction.php` | Health check для мониторинга (load balancer, uptime, алерты) | ✓ | ✓ | ✓ | CORE ✓ |
| `src/Action/PageAction.php` | — | ✓ | M | M | CORE drift |
| `src/Action/SitemapAction.php` | Генерация sitemap.xml с учётом мультиязычности и hreflang | M | M | M | CORE drift |

## src/Service — сервисный слой

| Файл | Назначение | kumho | italy | beepitron | Категория |
|---|---|:-:|:-:|:-:|---|
| `src/Service/DataLoaderService.php` | Загружает global.json — глобальные данные сайта (навигация, контакты, языки) | ✓ | M | M | CORE drift |
| `src/Service/LanguageService.php` | Определяет язык из первого сегмента URL | ✓ | M | M | CORE drift |
| `src/Service/MailService.php` | Reply-To: email клиента, если есть | M | M | M | CORE drift |
| `src/Service/SeoService.php` | Рекурсивно рендерит Twig-шаблоны внутри SEO-данных | ✓ | M | M | CORE drift |
| `src/Service/TemplateDataBuilder.php` | Собирает финальный массив данных для Twig-шаблона | ✓ | M | M | CORE drift |

## src/Middleware — middleware stack

| Файл | Назначение | kumho | italy | beepitron | Категория |
|---|---|:-:|:-:|:-:|---|
| `src/Middleware/CorrelationIdMiddleware.php` | Добавляет X-Request-Id к запросу и ответу для трассировки (логи, поддержка) | ✓ | ✓ | ✓ | CORE ✓ |
| `src/Middleware/CorsMiddleware.php` | CORS middleware: обрабатывает preflight (OPTIONS) и добавляет CORS-заголовки ... | ✓ | ✓ | ✓ | CORE ✓ |
| `src/Middleware/LanguageMiddleware.php` | — | ✓ | ✓ | ✓ | CORE ✓ |
| `src/Middleware/RateLimitMiddleware.php` | Rate limiting для POST /api/send: ограничение запросов по IP в скользящем окне | ✓ | ✓ | ✓ | CORE ✓ |
| `src/Middleware/RedirectMiddleware.php` | — | ✓ | ✓ | M | CORE drift |
| `src/Middleware/RequestDurationMiddleware.php` | Измеряет время обработки запроса и логирует результат в JSON-формате | ✓ | ✓ | ✓ | CORE ✓ |
| `src/Middleware/SecurityHeadersMiddleware.php` | Добавляет HTTP security headers ко всем ответам, включая базовую Content-Secu... | ✓ | M | M | CORE drift |
| `src/Middleware/TrailingSlashMiddleware.php` | Best practice: без trailing slash для всех ресурсов кроме корня. | ✓ | M | M | CORE drift |

## src/Handler — error handlers

| Файл | Назначение | kumho | italy | beepitron | Категория |
|---|---|:-:|:-:|:-:|---|
| `src/Handler/HttpErrorHandler.php` | Обработчик HTTP-ошибок (404, 405 и др.): отдаёт ответ по карте доменных ошибок | M | M | M | CORE drift |
| `src/Handler/ServerErrorHandler.php` | Единый обработчик необработанных исключений: | M | M | M | CORE drift |

## src/Event — domain events

| Файл | Назначение | kumho | italy | beepitron | Категория |
|---|---|:-:|:-:|:-:|---|
| `src/Event/EntityResolved.php` | Событие: сущность коллекции найдена и загружена | ✓ | ✓ | ✓ | CORE ✓ |
| `src/Event/PageLoaded.php` | Событие: страница загружена и готова к рендерингу | ✓ | ✓ | ✓ | CORE ✓ |
| `src/Event/SeoBuilt.php` | Событие: SEO-данные сформированы | ✓ | ✓ | ✓ | CORE ✓ |

## src/Twig — Twig extensions

| Файл | Назначение | kumho | italy | beepitron | Категория |
|---|---|:-:|:-:|:-:|---|
| `src/Twig/AssetExtension.php` | Читает содержимое CSS-файла из build-директории для inline-вставки в <style> | ✓ | M | M | CORE drift |
| `src/Twig/DataExtension.php` | — | ✓ | M | M | CORE drift |
| `src/Twig/UrlExtension.php` | Статика (data/, assets/) всегда от корня документа (public/), иначе на /ru/ к... | ✓ | ✓ | ✓ | CORE ✓ |

## src/Support — поддерживающие классы

| Файл | Назначение | kumho | italy | beepitron | Категория |
|---|---|:-:|:-:|:-:|---|
| `src/Support/Arr.php` | Утилиты для типизированного извлечения значений из ассоциативных массивов | ✗ | ✗ | ✗ | BASELINE-only |
| `src/Support/BaseUrlResolver.php` | — | ✓ | M | M | CORE drift |
| `src/Support/CitySlugger.php` | Транслитерация русских названий городов в URL-slug | ✓ | ✗ | ✗ | partial (1/3) |
| `src/Support/JsonProcessor.php` | Рекурсивно нормализует пути data/* в абсолютные URL | ✓ | ✓ | ✓ | CORE ✓ |
| `src/Support/PlatformSettings.php` | Типизированный доступ к ключам массива settings | ✗ | ✗ | ✗ | BASELINE-only |
| `src/Support/RequestAttributes.php` | Константы атрибутов request'а и ключей, разбросанных по приложению | ✗ | ✗ | ✗ | BASELINE-only |
| `src/Support/RespondsToContent.php` | Trait для Handler'ов и Action'ов: разбор Accept-заголовка и проставление X-Re... | ✗ | ✗ | ✗ | BASELINE-only |

## src/Api — внешние интеграции (необязательно)

_файлов нет_

## tools/scaffold — генераторы (create-*)

| Файл | Назначение | kumho | italy | beepitron | Категория |
|---|---|:-:|:-:|:-:|---|
| `tools/scaffold/create-collection.js` | --- Аргументы --- | ✓ | ✗ | ✗ | partial (1/3) |
| `tools/scaffold/create-component.js` | Стили для ${component} | ✓ | ✓ | ✗ | partial (2/3) |
| `tools/scaffold/create-deployment.js` | --- Аргументы --- | M | ✗ | ✗ | partial (1/3) |
| `tools/scaffold/create-page.js` | Стили для ${page} | ✓ | M | ✗ | partial (2/3) |
| `tools/scaffold/create-section.js` | Стили для ${section} | ✓ | ✓ | ✗ | partial (2/3) |
| `tools/scaffold/utils.js` | Читает global.json и возвращает массив кодов языков | ✓ | ✗ | ✗ | partial (1/3) |

## tools/build — сборка

| Файл | Назначение | kumho | italy | beepitron | Категория |
|---|---|:-:|:-:|:-:|---|
| `tools/build/build-critical.js` | Build critical CSS: PostCSS processing + minification → assets/css/build/crit... | ✓ | ✗ | ✗ | partial (1/3) |
| `tools/build/build-images.js` | /raw/ (JPG, PNG, WebP). Also JPG/PNG outside raw/ (legacy) | ✓ | M | ✗ | partial (2/3) |
| `tools/build/check-env-build.js` | При финальной сборке (npm run build) проверяет, что в .env указан реальный домен | ✓ | ✗ | ✗ | partial (1/3) |
| `tools/build/clean-assets.js` | Пути к директориям сборки | ✓ | M | M | CORE drift |
| `tools/build/css-hash.js` | Пути к файлам | ✓ | M | M | CORE drift |
| `tools/build/images.js` | Оптимизация изображений и генерация WebP/AVIF при сборке | ✓ | ✓ | ✗ | partial (2/3) |
| `tools/build/setup-public-copy.js` | Копирует в public/ каталоги assets, data, vendor и файл robots.txt | ✓ | ✗ | ✗ | partial (1/3) |
| `tools/build/setup-public-links.js` | Создаёт в public/ симлинки на все директории и файлы из корня проекта, | ✓ | M | M | CORE drift |

## tools/ops — операционные скрипты

| Файл | Назначение | kumho | italy | beepitron | Категория |
|---|---|:-:|:-:|:-:|---|
| `tools/ops/__pycache__/normalize-tire-temperature.cpython-313.pyc` | — | ✓ | ✗ | ✗ | partial (1/3) |
| `tools/ops/check-tires-json.py` | — | ✓ | ✗ | ✗ | partial (1/3) |
| `tools/ops/fix-permissions.sh` | — | ✓ | ✓ | ✗ | partial (2/3) |
| `tools/ops/generate-favicons.js` | Убедимся, что директория существует | ✓ | ✓ | ✗ | partial (2/3) |
| `tools/ops/generate-llms-full.php` | Генерация public/llms-full.txt для GEO (LLM-краулеры) | ✓ | M | ✓ | CORE drift |
| `tools/ops/init-env.js` | npm run init — запрос базовых настроек и создание/обновление .env | ✓ | ✓ | ✗ | partial (2/3) |
| `tools/ops/normalize-tire-temperature.py` | — | ✓ | ✗ | ✗ | partial (1/3) |
| `tools/ops/normalized_models.log` | — | ✓ | ✗ | ✗ | partial (1/3) |
| `tools/ops/test-htaccess.sh` | — | ✓ | ✓ | ✗ | partial (2/3) |
| `tools/ops/validate-json.js` | Рекурсивно валидирует все .json файлы в указанных директориях | ✓ | ✓ | ✗ | partial (2/3) |

## tools/utils — утилиты

| Файл | Назначение | kumho | italy | beepitron | Категория |
|---|---|:-:|:-:|:-:|---|
| `tools/utils/convert-fonts.js` | TTF → WOFF2 conversion with Cyrillic + Latin subset. | ✓ | ✗ | ✗ | partial (1/3) |

## tools/distill — CLI трекинга

| Файл | Назначение | kumho | italy | beepitron | Категория |
|---|---|:-:|:-:|:-:|---|
| `tools/distill/README.md` | tools/distill — file-level tracking между baseline и deployments | ✗ | ✗ | ✗ | BASELINE-only |
| `tools/distill/build-inventory.mjs` | Генератор CORE-INVENTORY.md: per-file карта ядра baseline'а + | ✗ | ✗ | ✗ | BASELINE-only |
| `tools/distill/distill.mjs` | distill — CLI для file-level tracking между ismart-platform (baseline) | ✗ | ✗ | ✗ | BASELINE-only |
| `tools/distill/lib.mjs` | Общая библиотека для CLI distill: обход файлов, sha256, manifest, описания | ✗ | ✗ | ✗ | BASELINE-only |

## Корневые конфиги

| Файл | Назначение | kumho | italy | beepitron | Категория |
|---|---|:-:|:-:|:-:|---|
| `composer.json` | — | ✓ | M | M | CORE drift |
| `package.json` | — | M | M | M | CORE drift |
| `webpack.config.js` | — | ✓ | M | ✗ | partial (2/3) |
| `postcss.config.js` | — | ✓ | M | M | CORE drift |
| `eslint.config.js` | ', 'assets/js/vendor/**', 'node_modules/**'] }, | ✓ | M | ✗ | partial (2/3) |
| `stylelint.config.mjs` | — | ✓ | M | M | CORE drift |
| `vitest.config.js` | @type {import('vitest').UserConfig} | ✓ | ✓ | ✗ | partial (2/3) |
| `phpunit.xml` | — | ✓ | ✓ | M | CORE drift |
| `phpstan.neon` | — | ✓ | ✓ | ✓ | CORE ✓ |
| `.gitignore` | — | M | M | M | CORE drift |
| `.htaccess` | — | ✓ | ✓ | ✓ | CORE ✓ |
| `.env.example` | — | M | M | M | CORE drift |

## Документация и базовые шаблоны

| Файл | Назначение | kumho | italy | beepitron | Категория |
|---|---|:-:|:-:|:-:|---|
| `README.md` | iSmart Platform | M | M | ✗ | partial (2/3) |
| `CLAUDE.md` | CLAUDE.md | M | ✗ | M | partial (2/3) |
| `DISTILLATION.md` | Дистилляция iSmart Platform | ✗ | ✗ | ✗ | BASELINE-only |
| `CORE-INVENTORY.md` | — | ✗ | ✗ | ✗ | BASELINE-only |
| `templates/base.twig` | base.twig | ✓ | M | M | CORE drift |
| `templates/pages/page.twig` | — | ✓ | ✓ | M | CORE drift |

---

## Итоги по ядру

| Категория | Кол-во |
|---|---|
| **CORE ✓** (идентичны во всех 3) | 14 |
| **CORE drift** (есть везде, но разошлось) | 35 |
| **partial** (отсутствует в части deployments) | 29 |
| **BASELINE-only** (новые в baseline) | 11 |

## Ключевые моменты для имплементации

1. **`CORE ✓`** — маркировать в manifest как `sync_policy: strict`. Любой drift = баг.
2. **`CORE drift`** — review per file: какая версия каноническая. Это первоочередная работа `distill sync`.
3. **`partial`** — либо deployment-specific (override), либо CORE-кандидат, не докатился. Решается явной маркировкой.
4. **`BASELINE-only`** — распространяется в deployments после согласования.

