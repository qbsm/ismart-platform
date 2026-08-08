# 0015 — Вендорные префиксы только через autoprefixer (не в исходниках)

- **Status:** Proposed
- **Дата:** 2026-06-01
- **Scope:** `assets/css/**`, сборка CSS (PostCSS: `postcss-preset-env` + `autoprefixer`), линт (`stylelint`)
- **Reference implementation:** `tank-avilon` — сессия `docs/sessions/2026-06-01-npm-check.md` (удаление префиксов + 22 дублей из 13 файлов в рамках чистки `npm run check`)
- **Related:** [conventions/css-vendor-prefixes.md](../conventions/css-vendor-prefixes.md), [conventions/css-naming.md](../conventions/css-naming.md), [0013-performance-rendering-hardening.md](0013-performance-rendering-hardening.md) (раздел A — `backdrop-filter` стеклянные блоки)

## Контекст

В исходниках CSS периодически появляются ручные вендорные префиксы
(`-webkit-backdrop-filter`, `-webkit-mask` и т.п.) рядом с unprefixed-свойствами.
При этом в сборочном конвейере уже есть `postcss-preset-env` + `autoprefixer`
(`postcss.config.js`), которые дописывают нужные префиксы по `browserslist`
автоматически в `assets/css/build/`.

Ручные префиксы в исходниках создают проблемы:

- **Дубли и рассинхрон.** Значение правят в unprefixed-строке, а префиксную
  забывают → расхождение. `stylelint --fix` для `property-no-vendor-prefix`
  при этом **срезает префикс, а не удаляет строку**, оставляя дубликат
  (`backdrop-filter: X;` дважды подряд).
- **Шум в исходнике** и лишний вес до минификации.
- **Двойная ответственность** за совместимость: и руками, и autoprefixer.

В рамках чистки `npm run check` (2026-06-01) из исходников удалены все
flagged-префиксы и 22 образовавшихся дубля в 13 файлах; правило формализуется
этим пропозалом.

## Решение

1. **В исходниках `assets/css/**` пишем только unprefixed-свойства.** Вендорные
   префиксы (`-webkit-*`, `-moz-*`, `-ms-*`) не добавляем — их генерирует
   autoprefixer на сборке.
2. **Enforcement — `stylelint`** (`property-no-vendor-prefix`): `npm run lint:css`
   падает на префиксах в исходниках. Уже в `check:base`.
3. **Исключения** — префиксные свойства без unprefixed-аналога, которые
   autoprefixer не покрывает: `-webkit-font-smoothing`, `-moz-osx-font-smoothing`,
   `-webkit-text-size-adjust`, `-webkit-box-orient`/`-webkit-line-clamp`,
   `-webkit-overflow-scrolling`.
4. **Удаление префиксов — строкой целиком**, а не через `stylelint --fix`
   (он плодит дубли — см. Контекст). Для разовой чистки дублей — схлопывание
   подряд идущих идентичных деклараций.

```css
/* ✅ исходник */
.glass { backdrop-filter: var(--glass-blur); }

/* ❌ исходник */
.glass {
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur); /* добавит autoprefixer */
}
```

## Обоснование

- Единый источник истины по совместимости — `browserslist` + autoprefixer.
- Чистые, короткие исходники; меньше риска рассинхрона и дублей.
- Поведение собранного CSS не меняется: префиксы остаются в
  `assets/css/build/`, генерируются детерминированно.

## Последствия

- **Плюс:** исходники чище, линт ловит регрессии, нет ручной возни с префиксами.
- **Минус/риск:** при редактировании в IDE с автодополнением легко снова
  вписать префикс — ловится на `npm run lint:css` (локально pre-commit /
  в `check:base`).
- **Совместимость целевых браузеров** определяется `browserslist` — при
  изменении таргетов префиксы пересчитаются на сборке без правки исходников.

## Миграция

1. Удалить из исходников `assets/css/**` все вендорные префиксы (строкой целиком),
   кроме списка исключений выше.
2. Схлопнуть подряд идущие идентичные декларации, появившиеся от `stylelint --fix`.
3. `npm run lint:css` → 0 ошибок; `npm run build` → префиксы присутствуют в
   `assets/css/build/` (autoprefixer).

## Пример расширения

Появилось новое свойство, требующее префикса для целевых браузеров → **ничего
не делаем руками**: добавляем unprefixed-свойство, autoprefixer допишет префиксы
по `browserslist` на сборке. Меняется охват браузеров → правим `browserslist`,
не исходники.

## Reference implementation

`tank-avilon`, 2026-06-01: `git` рабочее дерево — затронуты `footer.css`,
`combomap.css`, `card-model.css`, `header.css`, `intro.css`, `profits.css`,
`modal.css`, `glightbox-custom.css`, `burger-menu.css`, `callback.css`,
`cookie-panel.css`, `countdown.css`, `headline.css`. Лог: `docs/sessions/2026-06-01-npm-check.md`.

## Acceptance

- В исходниках `assets/css/**` нет flagged-префиксов (`npm run lint:css` зелёный).
- В собранном `assets/css/build/` префиксы присутствуют (autoprefixer работает).
- Нет дублей деклараций, оставшихся от `--fix`.
- Конвенция `conventions/css-vendor-prefixes.md` + правило `property-no-vendor-prefix`
  в `stylelint.config.mjs` перенесены в baseline.

## Дистилляция в baseline

Правило и enforcement (`property-no-vendor-prefix` в `stylelint.config.mjs`)
переносятся в canonical baseline; конвенция — `conventions/css-vendor-prefixes.md`.
