# iSmart Platform

Тиражируемая многоязычная веб-платформа на PHP 8.5+ (Slim 4, Twig 3, Webpack 5, PostCSS).

Content-agnostic ядро: всё, что связано с бизнес-предметкой конкретного сайта, живёт в JSON-данных и одном файле `config/project.php` — ядро (`src/`) о них ничего не знает.

Этот репозиторий — **canonical baseline** платформы, дистиллированный из трёх production deployment'ов. Подробности — в [`docs/`](docs/).

## Production deployment'ы

| Deployment | Бизнес | Репо |
|---|---|---|
| `kumho-tires.ru` | шины (Kumho) | `github:qbsm/kumho-tires.ru` |
| `italycommunity.ru` | сеть ресторанов | `github:qbsm/italy-platform` |
| `beepitron` (beepitron.com) | электротехника | `bitbucket:ismart-team/bp` |

## Быстрый старт (baseline)

```bash
# Установка зависимостей
npm install
composer install

# Подготовка окружения
cp .env.example .env
# отредактировать .env

# Сборка assets
npm run build:dev

# Локальный dev-сервер
php -S localhost:8080 -t public
```

## Создание нового deployment'а

```bash
npm run create-deployment -- <slug>
# например: npm run create-deployment -- retail-logistik
```

Создастся отдельный каталог `deployments/<slug>/` с docker-compose, nginx-конфигом, `.env`, и заготовкой `config/project.php`.

## Стек

- **PHP 8.5+** + Slim 4 + PHP-DI
- **Twig 3** для шаблонов
- **Webpack 5** + PostCSS для assets
- **Monolog** для логирования
- **league/event** + PSR-14 для doменных событий
- **vlucas/phpdotenv** для конфига
- **Symfony Mailer** для писем

## Архитектура

См. `CLAUDE.md` для подробного описания (жизненный цикл запроса, content-agnostic ядро, конфигурация проекта, middleware-стек, event dispatcher, Twig extensions).

## Документация

- [`docs/README.md`](docs/README.md) — оглавление документации
- [`docs/architecture/distillation.md`](docs/architecture/distillation.md) — стратегия дистилляции, file-level tracking, CLI `distill`, roadmap миграции
- [`docs/inventory/core.md`](docs/inventory/core.md) — таблица ядра + статус во всех deployments (генерится `npm run distill:inventory`)
- [`docs/conventions/best-practices.md`](docs/conventions/best-practices.md) — принципы развития (минимализм, type-safety, immutability)
- [`docs/conventions/naming.md`](docs/conventions/naming.md) — соглашения имён классов и папок
- [`docs/notes/improvements.md`](docs/notes/improvements.md) — журнал улучшений (applied / open opportunities)
- [`CLAUDE.md`](CLAUDE.md) — гайд для Claude Code (русский язык, архитектура, ключевые файлы)

## Лицензия

Внутренняя разработка iSmart (ismart.pro).
