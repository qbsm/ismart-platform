# iSmart Platform

Тиражируемая многоязычная веб-платформа на PHP 8.5+ (Slim 4, Twig 3, Webpack 5, PostCSS).

Content-agnostic ядро: всё, что связано с бизнес-предметкой конкретного сайта, живёт в JSON-данных и одном файле `config/project.php` — ядро (`src/`) о них ничего не знает.

Этот репозиторий — **canonical baseline** платформы, дистиллированный из трёх production deployment'ов. Подробности — в [`DISTILLATION.md`](DISTILLATION.md).

## Production deployment'ы

| Deployment | Бизнес | Репо |
|---|---|---|
| `kumho-tires.ru` | шины (Kumho) | `github:qbsm/kumho-tires.ru` |
| `italycommunity.ru` | сеть ресторанов | `github:qbsm/italy-platform` |
| `bp` (beepitron.com) | электротехника | `bitbucket:ismart-team/bp` |

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

- [`DISTILLATION.md`](DISTILLATION.md) — стратегия дистилляции, file-level tracking, CLI `distill`, roadmap миграции
- [`CLAUDE.md`](CLAUDE.md) — гайд для Claude Code (русский язык, архитектура, ключевые файлы)

## Лицензия

Внутренняя разработка iSmart (ismart.pro).
