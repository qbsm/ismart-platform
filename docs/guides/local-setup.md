# Локальный запуск с нуля

Пошаговая настройка окружения для разработки.

## Требования

- PHP 8.5+
- Composer
- Node.js 18+ и npm
- Для локального домена: Laravel Valet (macOS) или аналог (nginx/Apache с виртуальным хостом)

## 1. Клонирование и настройка

После клонирования выполните один раз (установит npm- и composer-зависимости и создаст `.env`):

```bash
cd /path/to/project
npm run init
```

Команда по очереди: `npm install`, `composer install`, интерактивная настройка окружения.

## 2. Настройка окружения

При `npm run init` запрашиваются переменные и создаётся/обновляется `.env` из `.env.example`.

Сначала вводятся **обязательные** переменные, затем по желанию — дополнительные (APP_DEBUG, YANDEX_METRIC_ID и др.). Введите по запросу:

- **APP_BASE_URL** — базовый URL (например `http://example.test/` для Valet)
- **APP_ENV** — `development`
- **APP_DEFAULT_LANG** — язык по умолчанию (например `ru`)

Либо создайте `.env` вручную: `cp .env.example .env` и отредактируйте (в т.ч. **APP_DEBUG=1** для отладки).

## 3. Сборка фронтенда

```bash
npm run build:dev
```

Или для разработки с отслеживанием изменений:

```bash
npm run dev
```

## 4. Создание симлинков в public/

Симлинки `public/assets`, `public/data`, `public/robots.txt` создаются при сборке (`npm run build` / `npm run build:dev`). Если их нет:

```bash
node tools/build/setup-public-links.js
```

## 5. Локальный домен (Valet)

```bash
valet link my-project
# или из каталога проекта:
cd /path/to/project && valet link my-project
```

Сайт будет доступен по адресу `http://my-project.test/` (или `https://...` при `valet secure`). Укажите этот URL в **APP_BASE_URL** при `npm run init`.

## 6. Проверка

- Откройте в браузере `APP_BASE_URL` из `.env`.
- Если сайт не открывается — выполните `npm run init` и укажите **APP_BASE_URL**.
- Запуск проверки JSON: `npm run validate-json`.

## Полезные команды

| Команда                    | Описание                                                                   |
| -------------------------- | -------------------------------------------------------------------------- |
| `npm run init`             | Установка зависимостей (npm, composer) и запрос настроек → создание `.env` |
| `npm run dev`              | Следит за изменениями CSS/JS и пересобирает                                |
| `npm run build`            | Продакшн-сборка (lint + CSS + JS + симлинки)                               |
| `npm run create-page slug` | Создать страницу (JSON + SEO, без нового Twig)                             |
| `npm run validate-json`    | Проверка валидности `data/json`                                            |

Подробнее: [README.md](../../README.md) в корне проекта.
