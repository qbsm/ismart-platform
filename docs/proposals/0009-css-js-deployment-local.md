# 0009 — `assets/css/` и `assets/js/` целиком deployment-local

**Status:** Migrated to ADR-0009 (2026-05-24)
**Date:** 2026-05-24
**Финальный ADR:** [`docs/architecture/decisions/0009-css-js-deployment-local.md`](../architecture/decisions/0009-css-js-deployment-local.md)

> 📋 Принят одновременно — повторяющийся регресс требует системного решения.

---

## Контекст

Это **второй** регресс CSS в italy за две недели:

- **23 мая** (sync `085578e`) — baseline CSS затёр italy-specific вёрстку. Revert `9bf0d56` (git checkout 3c270b8 -- assets/css/) — массовый возврат 17 файлов.
- **24 мая** (sync `2ac09b2`) — тот же класс bug'а. Опять revert.

Корень: `tools/distill/distill.mjs::SKIP_PREFIXES` исключает только:
```js
'assets/css/sections/', 'assets/css/pages/',
'assets/js/sections/', 'assets/js/pages/',
```

При этом `assets/css/{base,components,critical.css,main.css}` и `assets/js/{components,base,utils,vendor.js}` — синкаются автоматически. Каждый sync приходит и затирает italy/kumho/beepitron оформление.

**Семантически** это противоречит multi-project-sync.md §2: «вёрстка и стили — project-specific». ADR-0008 это тоже фиксировал (main.css/main.js — entrypoint'ы). Но фактическое поведение шире — **все** components/base/utility CSS-файлы deployment-specific:

- `assets/css/base/buttons.css` — кнопки italy используют свой палеттаrm (bg-color-N, classes)
- `assets/css/components/form-callback.css` — italy форма подписки, другой layout (см. ADR-0005 + override ApiSendAction)
- `assets/css/components/card-gradient.css` — italy card-restaurant, не kumho card-tire
- `assets/css/critical.css` — компонент-зависимый, deployment-specific

JS аналогично: `form-callback/*.js` мы решили оставить общим (архитектура — ADR-0005), но это **исключение**, а не правило.

## Решение

`assets/css/` и `assets/js/` целиком **исключены** из baseline distill sync.

`SKIP_PREFIXES`:
```js
// Vёрсточные ассеты — deployment-specific целиком. Baseline предоставляет
// только tooling (build-images.js, postcss.config.js, webpack.config.js
// — они под tools/build/).
'assets/',
```

**Исключение точечное (sync-on-request):**

Если конкретный модуль нужно держать общим (как `assets/js/components/form-callback/*.js` после ADR-0005) — синкать **руками** через `distill sync --only=assets/js/components/form-callback/`. Не автоматически.

Baseline хранит **reference implementation** этих модулей в своём `assets/js/components/form-callback/`. При раскатке после ADR — `distill sync --only=` целевой подпапки.

### Что НЕ меняется

- `tools/build/`, `tools/distill/`, `tools/orchestrator/` — всё ещё синкаются (это shared tooling).
- `templates/components/{X}.twig` — всё ещё под общим sync'ом. (ADR-0008 описывает их как component-уровень). Если нужны deployment-specific Twig'и — точечные overrides через `distill mark-override`.
- `data/img/{tools/}`, `config/{settings.php, container.php, middleware.php, routes.php}` — синкаются.

### Existing overrides не теряются

Файлы помеченные `.distill/state.json::overrides` (например italy `assets/css/main.css`, `assets/js/main.js` — помечены 23 мая) — сохраняют статус. После принятия ADR-0009 они **избыточны** (skip-prefix покрывает целиком), но не ломают логику.

## Миграция

1. Baseline: расширить `SKIP_PREFIXES` в `tools/distill/distill.mjs`.
2. `distill scan` + `distill status` показать что drift в `assets/css/` / `assets/js/` теперь **identified as deployment-local** (не помечен на sync).
3. Italy/kumho/beepitron: следующий `distill sync` НЕ предлагает их → CSS остаётся локальным.
4. Cleanup existing overrides (опционально): для краткости state.json можно удалить overrides на `assets/css/main.css` и `assets/js/main.js` — теперь дублируют общий skip. Но безопаснее оставить.

## Acceptance

- [x] `tools/distill/distill.mjs::SKIP_PREFIXES` содержит `assets/`
- [x] `distill scan` манифест собирает (без изменений)
- [x] `distill sync --dry-run` не предлагает `assets/css/**` или `assets/js/**` к copy
- [x] ADR-0009 в `docs/architecture/decisions/`
- [x] Memory `feedback-assets-deployment-local` зафиксировано

## Связано

- ADR-0008 (multi-deployment docs) — здесь же концептуально расширяется на assets
- ADR-0005, 0006, 0007 (notification, picture) — точечные подсинки JS-кода (form-callback, DataExtension) делаются вручную
- Memory `feedback-orphan-overrides` — overrides не гарантируют файл
