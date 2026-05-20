# Эталонная структура проекта

Единый ориентир для каталогов и ключевых файлов. В документации и скриптах используются только эти пути.

## Корень проекта

```
project/
├── config/              # Конфигурация приложения
├── data/                # Данные и медиа (вне public)
├── docs/                # Документация
├── public/              # DocumentRoot веб-сервера
├── src/                 # PHP-код приложения (Slim 4)
├── templates/           # Twig-шаблоны
├── assets/              # Исходники фронтенда (CSS, JS, шрифты, иконки)
├── tools/               # Утилиты сборки и эксплуатации
├── cache/               # Кэш (Twig и др.), не в git
├── logs/                # Логи, не в git
├── .env.example
├── robots.txt
├── package.json
├── composer.json
├── webpack.config.js
└── postcss.config.js
```

## config/

- `settings.php` — настройки приложения (пути, языки, Twig, APP_ENV)
- `container.php` — определения PHP-DI
- `middleware.php` — порядок middleware
- `routes.php` — маршруты Slim
- `redirects.json` — правила редиректов

Подробнее: [config.md](config.md) (окружение, available_langs, доступ в шаблонах).

## data/

- `data/json/` — JSON-данные:
  - `global.json` — глобальные настройки
  - `{lang}/pages/` — страницы
  - `{lang}/seo/` — SEO-метаданные
  - `{lang}/restaurants/` — данные ресторанов (если есть)
- `data/img/` — изображения: `ui/`, `favicons/`, контент по подкаталогам

## public/

- `index.php` — единственная точка входа
- `.htaccess` — маршрутизация на index.php
- Симлинки (создаются при сборке): `assets` → `../assets`, `data` → `../data`, `robots.txt` → `../robots.txt`

## src/

- `Action/` — HTTP-обработчики (PageAction)
- `Middleware/` — PSR-15 middleware
- `Service/` — сервисы (DataLoader, Seo, Language, TemplateDataBuilder)
- `Twig/` — расширения Twig
- `Support/` — утилиты (JsonProcessor, BaseUrlResolver)

## templates/

- `base.twig` — базовый шаблон (head, canonical, скрипты)
- `pages/page.twig` — единый шаблон страницы (data-driven: секции из JSON)
- `sections/*.twig` — секции (header, footer, intro и т.д.)
- `components/*.twig` — компоненты (form, slider, picture и т.д.)

## assets/

- `assets/css/` — base/, components/, sections/, pages/, main.css, build/
- `assets/js/` — base/, components/, sections/, pages/, vendor.js, main.js, build/
- `assets/fonts/` — веб-шрифты
- `assets/img/` — иконки для сборки

## tools/

- `tools/build/` — css-hash, clean-assets, setup-public-links
- `tools/scaffold/` — create-component, create-section, create-page
- `tools/ops/` — validate-json, generate-favicons, fix-permissions, test-htaccess

## docs/

- `docs/guides/` — инструкции (добавление страниц, SEO)
- `docs/architecture/` — техническая документация (структура, метрики)

---

**Точка входа:** единственная — `public/index.php`. DocumentRoot веб-сервера должен указывать на каталог `public/`.
