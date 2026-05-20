# Конфигурация приложения

Единый источник настроек — `config/settings.php`. Переменные окружения загружаются через `vlucas/phpdotenv` из `.env` (см. `.env.example`).

## Окружение (APP_ENV)

- **development** (по умолчанию) — кэш Twig выключен, авто-перезагрузка шаблонов, уровень логов DEBUG.
- **production** — кэш Twig в `cache/twig`, уровень логов WARNING.

Установка: в `.env` задать `APP_ENV=production` на продакшене.

## Ключевые настройки (config/settings.php)

| Ключ              | Описание                                                             | Источник                                                                   |
| ----------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `env`             | Окружение: `production` \| `development`                             | APP_ENV                                                                    |
| `debug`           | Режим отладки (влияет на ErrorMiddleware)                            | APP_DEBUG или по умолчанию из env                                          |
| `default_lang`    | Язык по умолчанию (без префикса в URL)                               | APP_DEFAULT_LANG или первый язык из `global.json` → lang                   |
| `available_langs` | Список кодов языков для alternate и навигации                        | **Единый источник:** `data/json/global.json` → массив `lang` (поле `code`) |
| `twig.cache`      | Путь к кэшу Twig или `false`                                         | При production — `cache/twig`                                              |
| `twig.debug`      | Включить Twig debug (dump и т.д.)                                    | APP_DEBUG / env                                                            |
| `paths.*`         | Пути к шаблонам, JSON, кэшу, логам                                   | От `project_root`                                                          |
| `image_sizes`     | Ключи и ширины для адаптивных изображений (picture, сборка)          | **Единый источник:** `config/image-sizes.json` (`keys`, `widths`)          |
| `route_map`       | Соответствие slug в URL → page_id (файл в `data/json/{lang}/pages/`) | Задаётся под проект (универсальное ядро)                                   |
| `sitemap_pages`   | Массив page_id страниц для включения в sitemap.xml                   | Задаётся под проект; без 404                                               |

## Доступ в шаблонах

В Twig доступны:

- **config.settings** — те же настройки (в т.ч. `config.settings.available_langs`, `config.settings.default_lang`).
- **settings** — дубликат для обратной совместимости.

Используются в `base.twig` (canonical, alternate), в `burger-menu.twig` (префикс языка).

## Добавление языка

**Единый источник:** только `data/json/global.json`.

1. Добавить объект в `data/json/global.json` → массив `lang`: `{ "title": "English", "code": "en", "direction": "ltr" }`.
2. Добавить данные навигации и текстов для нового кода в том же файле (напр. `nav.en`, блоки с ключом по коду языка).
3. Создать каталоги `data/json/{lang}/pages/` и `data/json/{lang}/seo/` с контентом.

Список `available_langs` и порядок языков в приложении берутся из `global.json` → `lang` при загрузке `config/settings.php`. Переменная `APP_DEFAULT_LANG` при необходимости переопределяет язык по умолчанию (иначе используется первый язык из `lang`).

## GEO: sitemap и llms-full (универсальное ядро)

- **sitemap.xml** — список страниц берётся из `config/settings.php` → `sitemap_pages`. URL формируются по `route_map` (slug => page_id) и `available_langs`.
- **llms-full.txt** — конфиг в `config/llms-full.php`: массив коллекций (list_path, item_dir, name_key, fields и т.д.). Генератор не привязан к типу контента; под любой проект задаются свои коллекции.
