# Чеклист продакшн-выкатки

Проверка перед выкладкой на production.

## Окружение и конфигурация

- [ ] В `.env` на сервере задано:
  - `APP_ENV=production`
  - `APP_DEBUG=0`
  - `APP_BASE_URL` — итоговый URL сайта (например `https://example.com/`)
  - `APP_DEFAULT_LANG` при необходимости
  - `YANDEX_METRIC_ID` при использовании счётчика
- [ ] Файл `.env` не попал в репозиторий и не отдаётся веб-сервером (DocumentRoot = `public/`)

## Сборка

- [ ] Выполнена продакшн-сборка: `NODE_ENV=production npm run build`
- [ ] Симлинки в `public/` созданы: `npm run setup:public-links` (создаёт `assets` → `../assets`, `data` → `../data`, `robots.txt` → `../robots.txt`; входит в `npm run build`)
- [ ] В репозитории есть каталог `tools/build/` и скрипт `setup-public-links.js`
- [ ] В `public/assets` лежат хешированные CSS/JS (манифесты актуальны)

## Веб-сервер

- [ ] DocumentRoot указывает на каталог **public/** (не на корень проекта)
- [ ] HTTPS включён; редирект с HTTP на HTTPS настроен (в `.htaccess` или конфиге сервера)
- [ ] Поддержка PHP 8.5+ (или выше, как в проекте)

## Безопасность и заголовки

- [ ] Проверены заголовки: X-Content-Type-Options, X-Frame-Options, HSTS (в production через SecurityHeadersMiddleware)
- [ ] При ошибочном DocumentRoot корневой `.htaccess` закрывает доступ к `.env`, `.git`, `config/`, `src/`

## Данные и кэш

- [ ] Каталоги `cache/` и `logs/` существуют и доступны для записи процессом веб-сервера
- [ ] Кэш Twig в production включён (при `APP_ENV=production` задаётся в `config/settings.php`)

## Проверки после выкатки

- [ ] Главная и ключевые страницы открываются, отдаётся 200
- [ ] Несуществующий URL отдаёт 404 (страница из `data/json/.../404.json`)
- [ ] Статика (CSS, JS, картинки) отдаётся с кэшированием (Cache-Control в `public/.htaccess`)
- [ ] В ответах есть заголовок X-Request-Id (CorrelationIdMiddleware)
- [ ] При ошибке приложения отображается брендированная страница 500, а не стек-трейс

## Опционально

- [ ] Резервное копирование `data/json`, медиа и `.env`
- [ ] Мониторинг (логи, метрики, алерты при 5xx)
