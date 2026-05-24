# Сессия 2026-05-24 — Canvas refactor Phase 2 (унифицированные секции в baseline)

## Контекст

Проигрыш предыдущих попыток миграции (mirage-v2 ручной regex-batch, doublestar-v2 trazano-clone) показал что **миграция через копирование canonical-twigs + patching НЕ работает**.

Inventory 47 legacy iSmart-сайтов (`tools/orchestrator/analyzers/legacy-archetype-inventory.py`) выявил 3 архетипа:
- A (3 сайта): trazano/mirage/rabotazotman — `globals.{nav,brand,phone,email,models,articles}`
- B (5 сайтов): doublestar/italyco.rest/goodnord/tank/dongfeng — `globals.{header.menus, footer.links}`
- C (39 сайтов): авто-дилерские — single-page лендинги с другим canvas (map+actions+services+countdown+consultation+profits)

Каждый архетип = свой набор секций. Скаффолдить v2 как clone trazano = неработающий путь.

## Phase 2 implementation план

В baseline:
1. **Canvas templates** в `templates/sections/` — data-driven generic-секции:
   - header (через global.nav), footer (global.nav/policy/contacts)
   - intro (slides[] + опц gradient + items для profits), hero (1 slide)
   - range (cards 3-N), about (cards icon+title+desc)
   - digits (counters), articleslist/news (через items_from)
   - tires/catalog (kumho-фильтр + extended: type/season/bodyType/size)
   - dealers (kumho-map + filter)
   - cap, content (inline HTML items[]), frame
   - banner (image + cta), video (youtube link block) — для архетипа-C
   - actions, advantages, consultation, countdown, profits, services, special, show, offer, panel, modal — авто-дилерские
2. **Entity-templates**:
   - pages/tire.twig — обобщённый productdetail (поддерживает все варианты polей: name/code/season/types/cover/images/bodies/profits/youtube/sizes)
   - pages/news.twig — articledetail с cover/title/lead/body
3. **`tools/scaffold/create-deployment.js`** — переписать на **content-agnostic skeleton** (НЕ clone существующего deployment'а):
   - src/, config/, templates/{base.twig, sections/*, components/*}, assets/{css/base/, js/}, public/, tests/ — bare minimum
   - data/json пустой (только global.json schema-template)
   - .env.example + composer.json + package.json
4. **`tools/migrate/canonical-sync.py`** — multi-archetype:
   - Auto-detect архетип по `globals` keys
   - Per-archetype mappers (A/B/C)
   - Extract brand-vars из `dev/src/assets/brands/<brand>/variables.css` → `<v2>/assets/css/base/variables.css`
   - Extract fonts из `dev/src/assets/fonts/` (если есть)
   - Per-section mappers для каждого типа секции (catalog → tires, productdetail → tire entity, etc.)
5. **Cleanup baseline**: убрать deployment-specific что просочилось (если что-то trazano/kumho specific в `templates/sections/`).

После Phase 2:
- Существующие deployments (trazano-v2, mirage-v2, kumho, italy, beepitron) — distill sync для templates/sections от baseline (через `--only=templates/sections`). Их `data/json` и brand-vars остаются.
- Новые deployments (doublestar-v2, armstrong, ...) — `create-deployment` + `canonical-sync.py` → ~2 часа на сайт.

## Что делаю сейчас

Поэтапно в baseline (текущая ветка `distill/initial-baseline`):

1. Расширить `proposal-0010` с per-archetype mappers + archive-C canvas-set.
2. Refactor `templates/sections/` — pass1: header/footer/intro/range/about/digits — приведение к data.X-only.
3. `tools/scaffold/create-deployment.js` — переписать.
4. `tools/migrate/canonical-sync.py` — multi-archetype detect + mappers.
5. Commit + push.

Не жду одобрений между шагами. Финальный коммит — итоговое summary.

## Известные риски / trade-offs

- Refactor breaks existing deployments — distill sync вернёт их к новому baseline. Это **намеренная** массовая правка. Нужен smoke на каждом после.
- Архетип-C canvas (39 сайтов авто-дилеров) — добавление новых секций (map/actions/services/countdown/...). Это **add**, не break.
- Скаффолд clean-skeleton — нужно убедиться что create-deployment scaffolds минимально-рабочий deployment (просто открывается с empty data).

## Доводка doublestar-v2 визуала до канона (http://doublestar.ru.test/)

Главная и каталог doublestar-v2 приведены к каноническому виду (verify-gate PASSED, 0 console-ошибок на `/`, `/catalog`, entity).

**Структура канонической главной** (archetype-B): на home секция `catalog` совмещённая — heading + preview-карточки (только `selected` slugs) + кнопка «Весь каталог» + контакты (`icon-text` круги) + форма (`form-partner`); плюс секция `video` = «Doublestar — фабрика умных шин» с автоплей-видео завода. Воспроизведено как платформенные секции:
- `templates/sections/catalog-home.twig` — 8 preview-карточек card9 (из `selected[]`) + кнопка + контакты + `components/form-partner.twig`. CSS уже был в `sections/catalog.css` (правила `.icon-text`, `.catalog__subitem.contacts/.form`).
- `templates/sections/factory.twig` — эквивалент канонического `video.twig`; `data/video/1.mp4` + mask `3.png` перенесены из канона, `sections/video.css` импортирован.
- `index.json` sections: `header → intro → catalog-home → factory → footer`.

**Пойманные грабли (в дополнение к pitfalls-каталогу):**
- `form-partner.twig` тянул canonical-глобалы `footer.agreement/policy.href` + `{{root}}` → `url(global.policy)` падал TypeError (policy — массив). Fix: `{% set policyHref = global.policy.href|default(...) %}` с guard на iterable.
- `tire.desc` = dict `{short, full}`; при пустом `full` фильтр `default` падал на сам dict → **«Array to string conversion»** (warning ловит только smoke §7, не PHPStan). Fix: `tire.desc is iterable ? tire.desc.full|default('') : tire.desc|default('')`.
- 404-иконки: header button дефолт `icon-tire-color-1.svg` (trazano), buy-кнопка `icon-tire-buy-color-1.svg` — в doublestar их нет → `car.svg`.
- entity SEO `og:image` дефолтит на `data/img/seo/og.webp` (не в JSON, генерится) → создать stub.
- `/catalog` frame cover ссылался на несуществующий `data/img/catalog/cover.png` → existing intro-изображение.

**Вывод для каталога pitfalls:** при переносе совмещённых canonical-секций (catalog+contacts+form в одном part) — раскладывать на платформенные секции, но `form-partner`/прочие canonical-компоненты обязательно прогонять через адаптацию globals (см. §4 каталога). Warning «Array to string» ловится smoke-рендером (`verify §7`), а не статикой — verify-gate обязателен.

## Доводка doublestar-v2: header + rem-база + footer + entity (продолжение)

Полный визуальный аудит главной vs `http://doublestar.ru.test/` (блок-за-блоком через Playwright) + entity-страница.

**Header** — портирован канон (была тёмная kumho-шапка): белая полоса, inline-SVG лого (green+orange), меню, последний пункт «Купить» → оранжевая pill через `.header__link-category:last-child`. Добавлены `--color-1/2` (раньше работали случайно через дефолты браузера).

**rem-база (критично, см. pitfalls §8a)**: канон 1rem=16px, платформа 1rem=10px. Портированный канон-CSS (header/catalog/video/footer/product) конвертирован ×1.6. grid.css сохраняет 10px-базу платформы. Симптом был «всё мелкое/сжатое 62.5%».

**Footer** — портирован канон (была раздутая kumho-версия с «Представительство TRAZANO в России»): тёмная полоса, nav-ссылки + agreement/policy + copyright из `global.footer.{navs,agreement,policy}` + `global.copyright`.

**Контакты** — mdi-иконки (шрифт не подключён) → inline SVG phone/email. **Кнопки** button-3: оранжевый текст → белый. **skip-link** → off-screen.

**Entity (страница товара)** — портирован канон `product` (была kumho-productdetail + frame + «Похожие шины»):
- структура: breadcrumbs + фото(hover-свап) + заголовок + сезон + применимость(bodies) + profits + Купить + **таблица «Размеры и характеристики»** (вкладки диаметров `js-diameter` + `card5` со всеми ТТХ)
- **ДАННЫЕ**: размеры в каноне лежат плоским массивом `index.json → catalog.sizes[]` (659 строк по `model`), фильтруются PHP per-product. Мигрированы во все 27 entity (apex=4, ds01=32) — раньше `sizes:[]` пустые → таблица пустая. См. pitfalls §9b.
- product.js: vanilla фильтр диаметров + GLightbox.

Всё: verify PASSED, 0 console-ошибок на `/`, `/catalog`, entity.

## Аудит внутренних страниц (/company, /contact, /actions, /buy)

**Корневая грабля**: `page.twig` использует `{% include ... ignore missing %}` → секции, чьих twig-шаблонов нет в `templates/sections/`, **молча пропускаются**. `/company` была пустой т.к. `strip.twig` + `technology.twig` отсутствовали (данные в JSON были). Симптом — страница «пустая» (только header+footer), но 0 ошибок/warnings.

- **/company** → канон: портированы `strip.twig`/`strip.css` (таймлайн «История компании»: год-чип+стрелка+описание) + `technology.twig`/`css` (о компании + фабрика-grid + сертификаты, под схему данных v2 `cover/about/factory/cert/rd`). Поправлены пути (cover 1.jpg→cover.jpg, rd удалён — нет изображений нигде, в каноне тоже).
- **/contact** → канон: `banner.twig`/`css` (фон-обложка) + `partner.twig`/`css` (breadcrumbs + контакты-круги inline SVG + форма обратной связи).
- **/actions** → frame-баннер + content-заголовок (данные минимальны, как в каноне).
- **/buy** → kumho-style (по `[[project_tire_buy_page_from_kumho]]` — намеренно, не канон): frame + dealers-карта. Dealers пустые (data-gap: нет датасета дилеров + Яндекс-карта не инициализирована).
- **frame.css**: добавлен `margin-top: 60px/100px` — баннер заезжал под fixed-header (обрезался) на /actions/buy/catalog.

verify PASSED по 8 URL (/, /catalog, /company, /contact, /actions, /buy, 2 entity), 0 console-ошибок. Все портированные канон-CSS — с rem×1.6 (см. §8a).

Остаточный data-gap: /buy dealers (нет датасета + карта), technology R&D-изображения (нет в источнике).
