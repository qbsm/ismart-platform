# 0004 — Аудит симлинков `public/`: vendor/src/.env/config exposed

**Status**: Proposed
**Date**: 2026-05-24
**Scope**: security, deployment — `tools/build/setup-public-links.js`, `public/.htaccess`

---

## Контекст

`tools/build/setup-public-links.js` создаёт симлинки в `public/`:

```js
const LINKS = [
  { link: 'src',           target: '../src',           type: 'dir' },
  { link: 'config',        target: '../config',        type: 'dir' },
  { link: 'templates',     target: '../templates',     type: 'dir' },
  { link: 'vendor',        target: '../vendor',        type: 'dir' },
  { link: 'cache',         target: '../cache',         type: 'dir' },
  { link: 'logs',          target: '../logs',          type: 'dir' },
  { link: 'assets',        target: '../assets',        type: 'dir' },
  { link: 'data',          target: '../data',          type: 'dir' },
  { link: 'robots.txt',    target: '../robots.txt',    type: 'file' },
  { link: '.env',          target: '../.env',          type: 'file' },
  { link: 'composer.json', target: '../composer.json', type: 'file' },
  { link: 'composer.lock', target: '../composer.lock', type: 'file' },
];
```

В `public/.htaccess`:
```apache
# Существующие файлы и директории — отдавать как есть
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]
```

**Проблема:** правило отдаёт **любой** существующий файл/директорию. Симлинки на `vendor/`, `src/`, `config/`, `.env`, `composer.json`, `composer.lock`, `cache/`, `logs/` делают их **публично доступными по HTTP**:

- `https://example.com/.env` → утечка паролей SMTP, API-токенов
- `https://example.com/src/Action/PageAction.php` → раскрытие исходного кода
- `https://example.com/vendor/autoload.php` + всё содержимое → можно искать known vulnerabilities в зависимостях
- `https://example.com/config/secrets/google-service-account.json` → утечка credentials
- `https://example.com/composer.json`, `composer.lock` → список версий зависимостей

## Зачем симлинки сейчас

Архитектурное допущение: `DocumentRoot = public/`, но runtime-код снаружи (`/src/`, `/vendor/`). Симлинки создают **видимость** что они «внутри public/».

На самом деле PHP не нуждается в симлинках — `require __DIR__ . '/../vendor/autoload.php'` работает без них (`public/index.php` использует относительный путь к parent).

## Решение

### Часть А — оставить в public/ только то что реально публично

```js
const LINKS = [
  { link: 'assets',     target: '../assets',     type: 'dir' },  // CSS/JS/Img build
  { link: 'data',       target: '../data',       type: 'dir' },  // JSON content + img
  { link: 'robots.txt', target: '../robots.txt', type: 'file' },
  { link: 'llms.txt',   target: '../llms.txt',   type: 'file' },     // если есть
  { link: 'llms-full.txt', target: '../llms-full.txt', type: 'file' }, // если есть
];
```

Удалить симлинки: `src`, `config`, `templates`, `vendor`, `cache`, `logs`, `.env`, `composer.json`, `composer.lock`.

PHP runtime продолжит работать — `public/index.php` обращается к ним через `../`.

### Часть Б — defense-in-depth в `public/.htaccess`

Даже если кто-то по ошибке создаст симлинк — Apache блокирует:

```apache
# Запрет на dot-файлы и чувствительные пути
RedirectMatch 404 ^/\.env(/.*)?$
RedirectMatch 404 ^/(src|config|templates|vendor|cache|logs)(/|$)
RedirectMatch 404 ^/composer\.(json|lock)$
RedirectMatch 404 ^/\.git(/.*)?$
```

### Часть В — миграция

1. **Baseline**: правка `setup-public-links.js`, обновлённый `public/.htaccess`.
2. **На каждом deployment**:
   - `rm public/{src,config,templates,vendor,cache,logs,.env,composer.json,composer.lock}` (только симлинки, не реальные файлы — проверить)
   - `npm run setup:public-links` для перегенерации
   - Smoke-тест: главная открывается, `/.env` → 404, `/src/Action/PageAction.php` → 404
3. **На проде**: убедиться что DocumentRoot реально `public/`, не корень проекта.

## Acceptance

- [ ] `setup-public-links.js` оставляет только assets/data/robots.txt/llms*.txt
- [ ] `public/.htaccess` блокирует чувствительные пути через RedirectMatch 404
- [ ] Smoke на каждом deployment: главная 200, `/.env` 404, `/src/X.php` 404, `/composer.json` 404, `/config/secrets/*.json` 404
- [ ] После применения на kumho/italy/beepitron: visual проверка production-build не сломался
- [ ] ADR `docs/architecture/decisions/0008-public-symlinks-minimal.md` после принятия

## Открытые вопросы

1. **`llms.txt` / `llms-full.txt`** — нужно ли публичны (для AI-краулеров) или нет? Если да — добавить.
2. **DocumentRoot edge case**: если на проде кто-то по ошибке указал DocumentRoot = корень проекта (вместо `public/`), `.htaccess` в `public/` не сработает. Корневой `.htaccess` (если есть) должен блокировать всё кроме `public/`. Проверить наличие.
