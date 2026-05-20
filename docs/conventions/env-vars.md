# Environment variables — нейминг и организация

Все переменные окружения живут в `.env` (не закоммичено, в `.gitignore`). Шаблон с описанием — в `.env.example` (закоммичен).

## Формат имени

- `SCREAMING_SNAKE_CASE` — единственный допустимый стиль.
- Префикс по подсистеме (см. ниже).
- Без префикса `ISMART_` или `APP_` к подсистемам, которые не «приложение в целом» — иначе теряется группировка.

## Префиксы по подсистемам

| Префикс | Назначение | Примеры |
|---|---|---|
| `APP_*` | Глобальные настройки приложения | `APP_ENV`, `APP_DEBUG`, `APP_BASE_URL`, `APP_DEFAULT_LANG` |
| `MAILER_*` | Транспорт (Symfony Mailer) | `MAILER_DSN` |
| `MAIL_*` | Параметры письма (отправитель, получатель) | `MAIL_TO`, `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_SUBJECT_PREFIX` |
| `YANDEX_*` | Яндекс-сервисы (метрика и т.д.) | `YANDEX_METRIC_ID` |
| `<VENDOR>_*` | Интеграция со сторонним API (по имени вендора) | `PHOTOROOM_API_KEY` (kumho-only), `N8N_BASE_URL` (этап 4) |
| `DJANGO_*` | Будущая Django-подсистема (этап 4) | `DJANGO_CORE_URL`, `DJANGO_SERVICE_TOKEN` |
| `JWT_*` | Авторизация (этап 2) | `JWT_SECRET`, `JWT_TTL` |

## Стандартный набор baseline

```bash
# Application
APP_ENV=development          # production | development
APP_DEBUG=1                  # 0 | 1
APP_DEFAULT_LANG=ru          # код языка по умолчанию
APP_BASE_URL=https://example.test/   # базовый URL (с trailing slash)

# Mailer
MAILER_DSN=smtp://localhost:25       # или sendmail://default, native://default
MAIL_TO=info@example.com
MAIL_FROM=noreply@example.com
MAIL_FROM_NAME="Site Name"
MAIL_SUBJECT_PREFIX=[Site]

# Analytics (опционально)
# YANDEX_METRIC_ID=12345678
```

Для нового deployment'а — `cp .env.example .env`, заполнить значения, проверить через `npm run check:env`.

## Значения

### Boolean

- Только `0` / `1` для bool-переменных (`APP_DEBUG=1`).
- Не использовать `true`/`false` строки — путаются с PHP-`getenv()` (возвращает string).
- Парсинг: `(bool) ($_ENV['APP_DEBUG'] ?? 0)` или `Arr::bool($_ENV, 'APP_DEBUG')` (последнее уже понимает `'1'`/`'true'`).

### URL

- Всегда с протоколом (`https://`).
- Trailing slash консистентно либо есть, либо нет — лучше **с** trailing slash для base-URL'ов (`APP_BASE_URL=https://site.com/`).
- Для service endpoints (Django, n8n) — без trailing slash (`DJANGO_CORE_URL=http://core-api:8000`).

### Секреты

- API-ключи, токены, пароли — **только в `.env`**, никогда в коде или в коммитах.
- В `.env.example` оставлять пустыми (`PHOTOROOM_API_KEY=`) или с placeholder (`JWT_SECRET=change-me`).
- Не использовать одни и те же значения в development и production.

## .env.example правила

- Каждая переменная — с комментарием справа или над строкой (для чего она).
- Опциональные переменные — закомментированы (`# YANDEX_METRIC_ID=12345678`).
- Группировка пустой строкой по подсистеме.
- Не дублировать значения между секциями.

## Чтение в коде

### PHP

Используется `vlucas/phpdotenv` через `Dotenv::createUnsafeImmutable()` (важно: **unsafe**, потому что `getenv()` нужен в `config/settings.php` — обычный `createImmutable` пишет только в `$_ENV/$_SERVER`).

```php
$value = (string) (getenv('APP_BASE_URL') ?: 'https://example.test/');
$debug = (bool) (getenv('APP_DEBUG') ?: 0);
```

### Node.js (build-tools)

```javascript
const baseUrl = process.env.APP_BASE_URL || 'http://localhost:8080';
```

### .htaccess / nginx

Передавать через `SetEnv` / `fastcgi_param`. Не дублировать в `.env`.

## Платформа vs deployment

- `.env.example` живёт в baseline и в каждом deployment'е. В deployment'е может быть **дополнен** deployment-specific переменными.
- При `distill init <slug>` — `.env.example` копируется из baseline в новый deployment с подстановкой `--name` и `--domain`.

## Запрещено

- Кастомные префиксы под одного разработчика (`DANIL_DEBUG=1`).
- Тяжёлые JSON-значения внутри `.env` (там должны быть только строки/числа). Сложный конфиг — в `config/project.php`.
- Дублирование env-переменной в нескольких подсистемах (`MAIL_HOST` и `MAILER_HOST` — выбрать одно).
- Использование переменных без объявления в `.env.example` — это создаёт скрытую зависимость.
