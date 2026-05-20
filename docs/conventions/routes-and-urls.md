# Routes и URLs — нейминг

URL — это API сайта для пользователя и для SEO. Структура URL'а важнее имени класса.

## Общие принципы

- `kebab-case` для slug'ов: `/cookies-policy/`, не `/cookies_policy/` и не `/cookiesPolicy/`.
- Нижний регистр всегда.
- Trailing slash на страницах: **с** (`/contacts/`, `/buy/spb/`). Slim middleware `TrailingSlashMiddleware` редиректит без-slash → со-slash.
- API endpoints — **без** trailing slash в каноне (`/api/send`), но Slim принимает обе формы (`[/]` в route).
- `.xml` / `.txt` / `.json` для машинных ресурсов — без trailing slash: `/sitemap.xml`, `/robots.txt`, `/llms-full.txt`.

## Структура URL

| Паттерн | Назначение | Пример |
|---|---|---|
| `/` | Главная | `/` |
| `/{page-slug}/` | Простая страница | `/contacts/`, `/policy/`, `/cookies-policy/` |
| `/{collection-slug}/` | Список сущностей коллекции | `/tires/`, `/news/`, `/restaurants/` |
| `/{collection-slug}/{entity-slug}/` | Детальная страница сущности | `/tires/at52/`, `/news/launch-2026/` |
| `/{lang}/{path}` | Локализованная версия (если language ≠ default) | `/en/contacts/` (когда default-lang=ru) |
| `/api/{endpoint}` | API endpoint | `/api/send` |
| `/{system-file}` | Системные машинные ресурсы | `/sitemap.xml`, `/robots.txt`, `/health` |

## Slug сущности

- Только `[a-z0-9-]+`.
- Без двойных дефисов (`at52` ✓, `at--52` ✗).
- Без leading/trailing дефиса.
- Не начинается с цифры (для совместимости с CSS-классами, если slug используется как CSS-id).
- Уникален в рамках коллекции (`tires/at52` и `news/at52` могут сосуществовать, но `tires/at52` и `tires/at52` — нет).

Для русскоязычных названий — транслитерация через `Support\CitySlugger` (или другой Slugger при необходимости):
- `Москва` → `moskva`
- `Санкт-Петербург` → `sankt-peterburg` (через дефис, не sankt_peterburg)

## Route map

Связь URL-slug → page_id (имя JSON-файла) задаётся в `config/project.php`:

```php
'route_map' => [
    'tires' => 'tires-list',    // /tires/ → data/json/{lang}/pages/tires-list.json
    'news' => 'news',           // /news/ → data/json/{lang}/pages/news.json
    'buy' => 'dealers',         // /buy/ → data/json/{lang}/pages/dealers.json
],
```

Если slug совпадает с page_id — `route_map` можно не указывать (`/contacts/` → `pages/contacts.json` автоматически).

## URL в коде

### Twig

Через `page_url()` и `base_url()` (расширения `App\Twig\UrlExtension`):

```twig
<a href="{{ page_url('contacts') }}">Контакты</a>
<a href="{{ base_url ~ 'data/img/logo.svg' }}">Logo</a>
```

Не хардкодить `/{slug}/` в twig — Twig-расширения учитывают `is_lang_in_url` (если язык в URL — добавят префикс).

### PHP

```php
$url = $this->urlExtension->pageUrl('contacts');   // /contacts/ или /en/contacts/
```

### JSON

Внутри JSON для ссылок:

```json
{ "href": "/contacts/" }              // абсолютный относительно домена — для внутренних
{ "href": "https://external.com/" }   // абсолютный для внешних
```

Не использовать `./contacts/` или `../contacts/` — относительные пути ломаются после переноса на другой URL.

## Internal vs External

- Внутренние ссылки в JSON — относительные от корня (`/contacts/`), без домена. Это упрощает миграцию между окружениями.
- Внешние — полный URL с протоколом.
- В Twig — через хелперы `page_url`/`base_url`, которые добавляют base URL только когда нужно (например, для open graph meta).

## Кейсы из реальных deployments

### kumho

```
/                              → index
/tires/                        → tires-list (коллекция)
/tires/at52/                   → tire detail
/news/                         → news (коллекция)
/news/launch-2026/             → news detail
/buy/                          → dealers (с city-filter)
/buy/moskva/                   → dealers filtered by Moscow
/contacts/                     → contacts
/policy/                       → policy (PDF)
/cookies-policy/               → cookies-policy
/api/send                      → ApiSendAction
/sitemap.xml                   → SitemapAction
/health                        → HealthAction (для мониторинга)
```

### italy

```
/                              → index
/restaurants/                  → коллекция
/restaurants/italy-bolshaya-morskaya/   → restaurant detail
```

### beepitron

```
/service/{slug}                → service detail
/product/{slug}                → product detail
/category/{slug}               → category detail
/category/{cat}/product/{slug} → nested product (особый кейс с двумя уровнями)
```

## Перенаправления

`config/redirects.json` — список 301-редиректов. Формат:

```json
{
  "/old-url": "/new-url",
  "/legacy-path/": "/contacts/"
}
```

Применяется `App\Middleware\RedirectMiddleware`. Используется для миграции старых URL при переезде на платформу.

## SEO

- Один URL — одна страница. Дублирование (`/tires` и `/tires/`) уничтожается через 301-redirect (TrailingSlashMiddleware).
- Hreflang для языковых версий — генерируется автоматически в `SitemapAction`.
- canonical URL — всегда абсолютный, в Twig через `base_url ~ '/' ~ slug ~ '/'`.

## Запрещено

- URL'ы с расширениями `.php` (`/contacts.php`) — мы за clean URLs.
- URL'ы с query-параметрами для основной навигации (`?page=contacts`) — query только для опциональных фильтров (`/tires/?season=summer`).
- Кириллические slug'и в URL — браузеры показывают, но в логи попадают percent-encoded.
- Magic numeric IDs (`/news/123`) — slug должен быть читаемым.
