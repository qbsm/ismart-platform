# 0005 — Asset entrypoints `main.css`/`main.js` всегда deployment-specific

**Status**: Proposed
**Date**: 2026-05-24
**Scope**: distill — `tools/distill/lib.mjs`, `.distill/state.json` overrides convention

---

## Контекст

`assets/css/main.css` и `assets/js/main.js` — корневые entrypoint'ы Webpack/PostCSS, которые перечисляют импорты секций, компонентов, страниц **конкретного deployment'а**:

italy `main.css`:
```css
@import "sections/intro.css";
@import "sections/restaurants.css";
@import "sections/owners.css";
@import "sections/us.css";
@import "sections/navigation.css";
...
```

kumho `main.css`:
```css
@import "sections/hero.css";
@import "sections/tires.css";
@import "sections/news.css";
@import "pages/tires.css";
@import "pages/news.css";
...
```

Аналогично `main.js` импортирует `./sections/intro.js`, `./pages/tire-detail.js` etc — разные у каждого deployment'а.

**Проблема:** при `distill sync` baseline-версия `main.css`/`main.js` затёрла italy-версии (sync `085578e`). Результат:
- italy `main.css` стал ссылаться на `sections/hero.css` (kumho-секция, отсутствует в italy)
- `npm run build:dev` ломался с `Failed to find sections/hero.css`
- main.bundle.js не пересобирался → swiper, формы работали на старой версии May 18
- Спустя ~2 недели обнаружено пользователем (визуально — слайдеры не работают, формы разваливаются)

## Решение

### Часть А — глобальный SKIP в distill manifest

В `tools/distill/lib.mjs` есть `BRAND_SPECIFIC_PREFIXES` — список путей которые **никогда** не предлагаются на sync. Добавить туда `main.css` / `main.js`:

```js
const BRAND_SPECIFIC_PREFIXES = [
  'data/',
  'config/project.php',
  'config/secrets/',
  // ...
  'assets/css/main.css',  // ← entrypoint, deployment-specific
  'assets/js/main.js',    // ← entrypoint, deployment-specific
];
```

Это **жёсткий gate**: даже если файл помечен identical, distill sync его **не предложит**. Защищает от случайной synchronization.

### Часть Б — диагностика: deployments без overrides на entrypoint'ы

`distill status` дополнительно проверяет: если `main.css` / `main.js` помечен `identical` или `drifted`, но НЕ в `state.json::overrides` → WARN «entrypoint не помечен как deployment-specific, рискует затереться следующим sync».

### Часть В — миграция

1. **Baseline**: правка `lib.mjs::BRAND_SPECIFIC_PREFIXES` + расширение `cmdStatus` с дополнительным WARN.
2. **На каждом deployment**:
   - Убедиться что `main.css`/`main.js` соответствуют контенту deployment'а (sections/components которые реально используются)
   - `distill mark-override` для обоих файлов с reason «entrypoint, deployment-specific»
3. **На italy** уже сделано (e2959e4 — mark-override двух файлов после восстановления).

## Acceptance

- [ ] `tools/distill/lib.mjs::BRAND_SPECIFIC_PREFIXES` содержит `assets/css/main.css` и `assets/js/main.js`
- [ ] `distill status` печатает WARN если entrypoint не в overrides конкретного deployment'а
- [ ] kumho и beepitron: `distill mark-override` применён для main.css/main.js
- [ ] `tools/distill/distill.mjs --dry-run sync` на любом deployment'е не предлагает main.css/main.js
- [ ] Unit-тест на `BRAND_SPECIFIC_PREFIXES` (если уже есть pattern-coverage тесты — добавить case)
- [ ] ADR `docs/architecture/decisions/0009-entrypoints-as-overrides.md` после принятия

## Альтернативы

- **Шаблон `main.css.dist` / `main.js.dist` в baseline** — deployment копирует и заполняет; baseline shipped без default entrypoint. Минус: новый deployment должен помнить про этот шаг (можно автоматизировать в `distill init`).
- **Конфиг-driven entrypoints** — `main.css` baseline, но импорты собираются в зависимости от `config/project.php::sections`. Усложнение, runtime-resolution, нестандартный paradigm для webpack.

`distill exclude` + явные overrides — самое простое и идиоматичное.

## Связано

- ADR-0006 / 0007 — раскатка фронт-фич через manifest-driven (тоже синкаются, но не entrypoint'ы)
- `feedback-orphan-overrides` memory — детектор уже добавлен (`distill status` 1a9dac5)
