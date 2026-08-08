# Proposal 0013: Performance & rendering hardening (jank, LCP, вес ресурсов)

**Status:** Proposed
**Дата:** 2026-05-31
**Reference implementation:** `tank-avilon` — сессия `docs/sessions/2026-05-31-performance.md` (3 раунда борьбы с jank + LCP/бандл)
**Scope:** core — `assets/css/base/`, `src/Service/TemplateDataBuilder.php`, `templates/base.twig`, `assets/js/components/deg360.js`, `assets/js/base/expose-vendors.js`, `webpack.config.js`, `package.json`
**Related:** `docs/architecture/performance-metrics.md`, `docs/guides/fonts-audit.md`, `docs/guides/images-lazy-loading.md`, `docs/proposals/0012-overlay-card-container-height.md`

---

## Контекст

На деплойменте `tank-avilon` пользователь сообщил о подёргивании при скролле («местами сайт подёргивается») и был проведён перф-аудит (три параллельных агента: CSS/рендеринг, JS-бандл, HTML/изображения/шрифты). Большинство найденного — **не deployment-специфика, а дыры в baseline-паттернах**, которые повторятся в любом deployment'е с теми же ингредиентами: `fixed`-фон + полупрозрачные («стеклянные») секции, intro-слайдер на первом экране, 360°-вьювер моделей, Yandex Maps, общий vendor-бандл.

Это ровно тот класс, который роль оркестратора (`docs/roles/orchestrator.md`) должна ловить и поднимать в baseline: фикс обкатан на одном deployment'е → проблема системная → перенести, чтобы не чинить по месту в каждом форке.

Пять отдельных baseline-кандидатов ниже сгруппированы по природе. Каждый самодостаточен — baseline-команда может брать их по отдельности.

---

## Решение

### A. GPU-промоушн стеклянных элементов над `fixed`-фоном  ◀── headline pattern

**Боль.** Любой элемент с `backdrop-filter: blur(...)`, проезжающий при скролле над `fixed`-фоном страницы, заставляет браузер **пересчитывать размытие каждый кадр** — главный источник jank. На `tank-avilon` это давали хедер, карточки моделей/комплектаций, countdown, profits, callback, combomap, footer, intro-benefit.

**Антипаттерны, которые перепробовали и отвергли:**
- уменьшать радиус блюра глобально (`--glass-blur` 2rem → 10px) — портит дизайн, боль не уходит, а маскируется;
- гасить блюр на время скролла через JS-класс `html.is-scrolling` (раунд 2) — фактически «убирание» эффекта в движении, мерцание при остановке.

**Решение (подсмотрено в `sales.omoda-asc.ru`, `offer.css`).** Промоутить стеклянный элемент в отдельный GPU-слой — тогда `backdrop-filter` рендерится на GPU **один раз**, а не покадрово. Блюр сохраняется как есть (`--glass-blur` = 2rem):

```css
transform: translateZ(0);
backface-visibility: hidden;
```

(если у элемента уже есть свой `transform` — совмещать значения или использовать `will-change: transform`.)

Аналогично — сам `fixed`-фон (`body::before`) промоутится в свой слой + `contain: paint`, чтобы не перерисовываться под полупрозрачными секциями (`general.css`).

Reference (tank-avilon): 13 деклараций `translateZ(0)`+`backface-visibility` — `general.css:38`, `header.css:31`, `countdown.css:17`, `callback.css:70`, `profits.css:52`, `combomap.css:28`, `footer.css:9`, `intro.css:207`, `card-model.css:8`, `card-complectation.css:9`, `spoiler.css:55/82`.

### B. Корректный preload первого экрана (LCP) — баги в `TemplateDataBuilder`

Два бага в `src/Service/TemplateDataBuilder.php`, из-за которых preload-блок `base.twig` **молча не срабатывал** (CORE, бьёт по всем deployments с intro-слайдером и кастомными шрифтами):

1. `extractHeroPreloadImage()` искал картинку по `data.slider.items[0].cover`, а реальный JSON intro хранит её как `data.slides[0].cover` → preload hero-изображения никогда не вставлялся. Исправлено: чтение `slides[]` с фоллбэком на `slider.items[]` + guard'ы `is_array` (`TemplateDataBuilder.php:88-91`).
2. `extractFontPathsFromCss()` вёл на несуществующие пути шрифтов (source-sans/manrope/tt-norms из другого деплоймента) → `<head>` не получал preload шрифтов.

**Системность:** список критических шрифтов и ключ hero-картинки — deployment-specific, но **способ их извлечения** — baseline-логика. Нужно сделать её устойчивой: поддержать оба ключа (`slides`/`slider.items`), а пути шрифтов брать не из захардкоженного списка, а из реального CSS/`config` deployment'а (или валидировать `is_file` и тихо пропускать отсутствующие — без «мёртвых» preload).

### C. Условная загрузка тяжёлых сторонних скриптов по наличию секции

Yandex Maps JS API (`api-maps.yandex.ru/2.1/`) грузился на **всех** страницах, хотя карта есть только на странице с секцией `combomap`. В `base.twig` добавлен проход по `sections` → флаг `has_map` (по `section.name == 'combomap'`), скрипт выводится только при `has_map` (`base.twig`).

**Обобщение для baseline:** паттерн «тяжёлый сторонний скрипт грузится только если на странице есть секция, которой он нужен». Кандидат — декларативная карта `section → required_script` в `config/project.php` вместо ручного `if has_map` (см. «Пример расширения»).

### D. Ленивый 360°-вьювер (`deg360.js`)

`assets/js/components/deg360.js` при первом hover/drag создавал `new Image()` для ВСЕХ 36 кадров цвета разом (~3.3 МБ, 36 параллельных запросов на карточку; смена цвета перезагружала набор заново). Масштаб: `data/img/range` = 2206 файлов / 238 МБ.

Переписано на:
- кэш наборов по цвету `Map<color, {frames[], done}>` (повторный выбор цвета — 0 новых запросов);
- приоритет: текущий кадр + 2 соседа, остальное — фоновыми чанками по 6 через `requestIdleCallback` (fallback `setTimeout 32ms`); смена цвета останавливает старую цепочку;
- graceful во время drag (`nearestSrc()` — ближайший уже загруженный кадр);
- `decoding = 'async'`.
- Итог: ~5 запросов вместо 36 при первом взаимодействии; скрытые фильтром карточки не грузят.

Компонент `deg360` — общий для всех deployments с галереей моделей/товаров → ленивая стратегия должна жить в baseline.

### E. Дедуп vendor-бандла + удаление jQuery

- `main.js` импортировал и `vendor.js`, и `base/expose-vendors.js` (оба экспонировали Swiper/GLightbox/Inputmask/jQuery в `window`). Оставлен один источник — `expose-vendors.js`; `assets/js/vendor.js` удалён.
- jQuery удалён полностью (потребителей 0; Inputmask v5 — vanilla): из экспонирования, из `webpack.config.js` (cacheGroup `utils`: `(inputmask|jquery)` → `(inputmask)`), из `package.json`. `util-vendors` ужался до ~234 KiB.

### F. Блик `wave` на кнопках — GPU-композит + масштаб по ширине

`assets/css/base/buttons.css` — анимация блика `.button-3::before` / `.animation-wave`. Эволюция в рамках сессии (важно зафиксировать, чтобы не ходить по кругу):

1. было `left` (layout-свойство → постоянный repaint во вьюпорте, jank);
2. Этап 1 перевёл на `transform: translateX(1200%)` (GPU-композит) — **но** `%` в `translateX` относительно собственной ширины блика (`5rem`), фиксированный путь ~60rem. На узких кнопках хватало, а на широких (`form-callback__submit` в finance-карточках, `width:100%`) блик не доезжал до края и **«застывал» полоской** у правого края на оставшиеся ~83% цикла;
3. финал: псевдоэлемент `inset: 0` (ширина = ширина кнопки) с прозрачной полосой-градиентом, анимация `translateX(-100% → 100%)`. `%` теперь относительно ширины кнопки → блик уезжает за край при **любой** ширине, оставаясь на GPU (только `transform`, без layout).

```css
.button.button-3::before,
.animation-wave.button-animated::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg,
    transparent calc(50% - 2.5rem),
    hsl(0deg 0% 80% / 10%) calc(50% - 2.5rem),
    hsl(0deg 0% 80% / 40%) calc(50% + 2.5rem),
    transparent calc(50% + 2.5rem));
  transform: translateX(-100%) skewX(-45deg);
  will-change: transform;
  pointer-events: none;
  animation: wave 9s ease-in-out infinite;
}
@keyframes wave {
  0%   { transform: translateX(-100%) skewX(-45deg); }
  17%  { transform: translateX(100%)  skewX(-45deg); }
  100% { transform: translateX(100%)  skewX(-45deg); }
}
```

**Урок для baseline:** анимировать `translateX(N%)` на узком элементе нельзя, если контейнер варьируется по ширине — `%` относительно собственной ширины элемента, не контейнера. Полнометражный псевдоэлемент + `translateX(±100%)` масштабируется автоматически.

---

## Структура файлов (baseline)

| Кандидат | Файлы baseline |
|---|---|
| A. GPU-промоушн стекла | `assets/css/base/general.css` (фон), профильные `sections/*.css` и `components/card-*.css` — добавить `transform: translateZ(0); backface-visibility: hidden;` каждому glass-элементу, проезжающему над фоном. Зафиксировать рецепт в `docs/conventions/css-naming.md` или `docs/guides/`. |
| B. Preload LCP | `src/Service/TemplateDataBuilder.php` — `extractHeroPreloadImage()` (оба ключа + `is_array`), `extractFontPathsFromCss()` (валидировать `is_file`, не хардкодить чужие пути). |
| C. Условные скрипты | `templates/base.twig` + `config/project.php` — декларативная карта `section → required_script`. |
| D. Ленивый 360 | `assets/js/components/deg360.js`. |
| E. Vendor dedup | `assets/js/base/expose-vendors.js`, `webpack.config.js`, `package.json`; удалить `assets/js/vendor.js`. |
| F. Блик кнопок | `assets/css/base/buttons.css`. |

---

## Миграция

- **A** — пройти по deployments: любой элемент с `backdrop-filter`, скроллящийся над `fixed`-фоном, получает GPU-промоушн. Оверлеи (modal/burger/cookie/glightbox/dropdown) НЕ трогать — они fixed-перекрытия, jank при скролле не дают. Предварительно проверять, что у элемента нет своего `transform` (иначе совмещать).
- **B** — после фикса проверить, что в `<head>` реально появляются `<link rel=preload>` для hero-картинки и шрифтов; на deployments без intro-слайдера/кастомных шрифтов — no-op.
- **C** — заменить ручные `if`-ы по тяжёлым скриптам на карту в `config/project.php`.
- **D** — drop-in замена компонента; API (`data-*` атрибуты, разметка) не меняется.
- **E** — при деплое нужен `npm install`/`prune`, чтобы выкинуть jQuery из `node_modules` (на webpack-сборку уже не влияет). Проверить, что в deployment'е нет инлайн-`$(...)` в twig.
- **F** — drop-in; визуал блика идентичен, проверить на широкой кнопке (full-width submit) и узкой (CTA).

---

## Reference implementation

- **Deployment:** `tank-avilon`
- **Сессия:** `docs/sessions/2026-05-31-performance.md` (раунды 1–3, «Рецепт переноса» в §Раунд 3).
- Все правки живые в репозитории tank-avilon, собраны и проверены (см. §Проверки сессии).

---

## Acceptance

- [ ] **A:** в built CSS deployment'а есть `translateZ(0)`+`backface-visibility` на всех glass-элементах, проезжающих над фоном; `--glass-blur` не понижен ради jank; запись DevTools Performance при скролле — нет покадрового repaint backdrop-filter.
- [ ] **B:** `extractHeroPreloadImage()` читает `slides[]` и `slider.items[]`; `extractFontPathsFromCss()` не выдаёт preload для несуществующих файлов; в `<head>` реального deployment'а — корректные preload hero + шрифтов.
- [ ] **C:** тяжёлый сторонний скрипт присутствует в HTML только на странице с нужной секцией (Yandex Maps: страница с картой — 1, без — 0).
- [ ] **D:** при первом взаимодействии с 360 — единицы запросов вместо полного набора; повторный выбор цвета — 0 новых запросов; скрытые карточки не грузят кадры.
- [ ] **E:** в собранных бандлах нет сигнатур jQuery; vendor-бандл не дублируется; формы (Inputmask) работают.
- [ ] **F:** блик уезжает за край на кнопке любой ширины (включая full-width submit), не застывает; анимация только `transform`.
- [ ] Distillation в остальные deployments — diff после применения соответствует ожиданиям (no-op там, где ингредиента нет).
- [ ] После merge — миграция принятых кандидатов в `docs/architecture/decisions/` (next-ADR-номер).

---

## Открытые вопросы

1. **A** — выносить ли GPU-промоушн в общий утилити-класс (напр. `.gpu-layer`) вместо повторения двух строк в каждом `*.css`? Плюс: DRY и единая точка. Минус: класс надо вешать в разметку компонентов, а правило логически принадлежит секции-потребителю (как и высота в proposal 0012). Скорее оставить в CSS секции/компонента.
2. **C** — карта `section → required_script` в `config/project.php` vs событие `PageLoaded` (PSR-14), на которое подписывается интеграция и сама решает, грузиться ли. Второе чище архитектурно, но тяжелее для простого случая «один скрипт под одну секцию».
3. **B** — стоит ли вычислять критические шрифты автоматически из `@font-face` в собранном CSS (как, видимо, и задумывалось имя `extractFontPathsFromCss`), вместо списка? Убрало бы класс «пути из чужого deployment'а».
4. **Фоллбэк-кандидаты, не делалось в сессии** (можно добавить в `opportunities.md`): per-page CSS-split / PurgeCSS (`main.css` ~116 КБ на всех страницах), code-splitting `main.js` (динамические `import()` редких зависимостей), `size-adjust` для шрифтов против CLS.

---

## Rollback

Каждый кандидат откатывается независимо `git revert` своего коммита. B/C/E — чистый откат без потери данных. D — возврат к eager-загрузке 360 (работает, просто тяжелее). A/F — косметика рендеринга, откат безопасен.
