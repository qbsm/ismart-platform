# Каталог граблей миграции legacy iSmart → platform

Исчерпывающий список **всех** проблем, пойманных при миграции trazano-v2, mirage-v2, doublestar-v2 (2026-05-24). Каждая грабля = строка чеклиста для `tools/migrate/verify-canonical-template.py`.

> **Главный урок**: миграцию НЕ отчитывать «готово» пока `verify-canonical-template.py` не зелёный + визуальная проверка в браузере (Playwright MCP). См. memory `feedback-pofile-verify-required`.

---

## 0. Архетипы legacy iSmart (определять ПЕРЕД миграцией)

`python3 tools/orchestrator/analyzers/legacy-archetype-inventory.py` — сканирует все `../*/project/`, классифицирует. 47 сайтов локально, 3 архетипа:

| Архетип | globals-структура | Сайтов | nav-источник | модели |
|---|---|---|---|---|
| **A** | `globals.{nav, brand, phone, email, models, articles}` | 3 | `globals.nav[]` | `globals.models[]` |
| **B** | `globals.{header.menus, footer.links}` | 5 | `globals.header.menus[]` | inline в `catalog.section.items[]` |
| **C** | other / mixed (single-page авто-дилеры) | 39 | varies | varies |

**Каждый архетип = свой mapper в `canonical-sync.py`.** Нельзя применять mapper архетипа-A к архетипу-B.

---

## 1. Skeleton creation

| ❌ Грабля | ✅ Правильно |
|---|---|
| `rsync` существующего deployment (trazano-v2) как skeleton → trazano-clone с чужим brand | Skeleton из **baseline-core** (`src/`, `config/`, `templates/{base,partials,components,pages}`, `tools/`, composer/package) |
| `rsync src/ dst/` (с trailing на источнике, без на цели) → **double-nested `data/img/img/`** | `rsync -a src/ dst/` симметрично ИЛИ symlink |

---

## 2. Public symlinks (частая 404-причина)

| ❌ | ✅ |
|---|---|
| `public/assets` — directory с только `css/` | `rm -rf public/assets && ln -s ../assets public/assets` |
| `public/data` отсутствует | `ln -s ../data public/data` |

**Симптом**: в браузере `runtime.*.js`, `vendors.*.js`, `main.*.js`, `data/img/*` → 404. verify §4+5 ловит.

---

## 3. Brand variables — НЕ template-placeholder

| ❌ | ✅ |
|---|---|
| `assets/css/base/variables.css` = brand-vars-template с orange-default | Скопировать `dev/src/assets/brands/<brand>/variables.css` (точные brand-цвета) |
| body bg hardcoded `#332c2b` (trazano-brown) в base/general.css | `var(--color-5)` (brand dark) |

Бренды: trazano = orange+brown+Gilroy; mirage = yellow+blue+Futura; doublestar = green+orange+Inter. verify §2 ловит.

---

## 4. Twig globals adaptation (canonical → platform)

Canonical-twigs используют глобалы которых нет в platform-context. Адаптировать через Python regex (НЕ sed — ломает синтаксис двойными `{{}}`):

| Canonical | Platform |
|---|---|
| `{% for nav in nav %}` / `{% for item in menus %}` | `{% for X in global.nav[lang_code].items %}` |
| `{{ phone.href }}` / `{{ phone.title }}` | `{{ global.phones[0].href }}` / `.title` |
| `{{ email.href }}` | `mailto:{{ global.email }}` |
| `{{ brand.short }}` / `{{ brand.full }}` | `{{ global.brand.short }}` / `.full` |
| `{{ data.heading \| raw }}` (если heading может быть object) | `{{ (data.heading.title\|default(data.heading))\|raw }}` |
| `{% for item in models %}` | preload `{% set models = [] %}{% for s in load_json(...).items %}...{% endfor %}` |
| `{% for item in articles %}` | то же через `pages/news.json::items` |
| `product.X` (на entity-page) | `tire.X` / `tire.item.X` |
| `{{root}}{{path}}` | `{{ url(path) }}` |
| `href="product/{slug}"` (hardcoded) | `href="{{ url(entity_url_pattern) }}"` |
| `<{{item.tag}}>` без default | `{% set _tag = item.tag\|default('h2') %}` (иначе `< class=>...</>` битый рендер) |

---

## 5. heading: string vs object (per-section)

Секции **merge()**-типа (dealers/tires/news) требуют `data.heading` как **object** `{title}`. Остальные (range/about/digits/intro/content) — **string** через `{{ data.heading | raw }}`.

В `canonical-sync.py`:
```python
HEADING_AS_OBJECT_SECTIONS = {'dealers', 'tires', 'news'}
if isinstance(data.get('heading'), str) and name in HEADING_AS_OBJECT_SECTIONS:
    data['heading'] = {'title': data['heading']}
```
Templates — defensive: `{{ (data.heading.title|default(data.heading))|raw }}`.

---

## 6. Картинки и манифест

| ❌ | ✅ |
|---|---|
| `item.images[0]` (object) в `url('{{...}}')` → "Array to string" | `item.images[0].src\|default('')` |
| `tire.desc.full\|default(tire.desc)` где `desc` = dict `{short,full}` и `full` пустой → `default` падает на **сам dict** → "Array to string" | `tire.desc is iterable ? tire.desc.full\|default('') : tire.desc\|default('')` |
| `url(global.policy)` где `policy` = объект/массив → `UrlExtension TypeError (array given)` | `{% set href = global.policy.href\|default(global.policy is iterable ? '/privacy-policy' : global.policy) %}` |
| `item.cover` на top-level entity, а PageAction inject ждёт `entity.item.cover` | класть cover в `entity.item.cover` |
| PageAction flat default `'cover' => ['src'=>'']` → array | twig guard `cover is iterable ? cover.src : cover` |
| cover на корне `data/img/X/Y.webp` — `build:images` не обрабатывает (ищет `**/raw/`) | переместить в `data/img/X/raw/Y.webp` (ADR-0007) |
| забыл `npm run build:images` → manifest пуст → `image_has()` отбраковывает | build:images перед smoke |
| favicons (apple-touch-icon/favicon.svg/site.webmanifest) — canonical имел только `.ico` | сгенерить stub'ы или `generate-favicons` |

verify §3 ловит missing-paths.

---

## 7. URL-политика

| ❌ | ✅ |
|---|---|
| Переименовать pages под kumho-style (`catalog→tires`) когда canonical-twigs hardcoded `/catalog` → 404 | Для архетипа-B/C: pages = canonical URLs. Унификация URL = отдельный refactor с правкой twigs |
| nav-href с trailing slash `/catalog/` → TrailingSlashMiddleware 301 → пустой CLI-render | nav-href БЕЗ trailing: `/catalog` |
| `/product/<slug>` (canonical) vs `/catalog/<slug>` (platform entity_url) | 301 redirect prefix в `config/redirects.json` + правка twig href |

---

## 8. CSS pitfalls

| ❌ | ✅ |
|---|---|
| `color(var(--color-3) blackness(15%))` (PostCSS stage 4) не работает в preset-env stage 2 → invalid → hover сливается | `color-mix(in srgb, var(--color-3), black 15%)` (CSS Color 5) |
| Опечатки в canonical CSS (`.sections__subitem` лишний `s`) → правило не применяется | привести к правильному BEM `.section__subitem` |
| kumho `components/*.css` + `pages/*.css` тащат свои фоны/borders | в main.css импортить только нужные components |
| `@import "../../../node_modules/X/dist/X.css"` | `@import "X/dist/X.css"` (postcss-import `path:['node_modules','assets/css']`) |
| `.skip-link` без off-screen CSS → visible "Перейти к контенту" | `.skip-link { position:absolute; left:-9999px } .skip-link:focus { left:1rem }` |

---

## 9. content-секции — разные форматы

| Архетип | content-формат |
|---|---|
| trazano | `{class:'section content', items:[{class:'container narrow', content:'<HTML>'}]}` |
| mirage | `{class:{container:'narrow'}, heading:'...', article:'<HTML>'}` |

`canonical-sync.py` детектит format и конвертит к platform `items[]`-формату. + strip дублирующий `<div class="container">` wrapper из inline-HTML.

### 9a. Совмещённые canonical-секции (несколько UI-блоков в одном part)

Архетип-B (doublestar) на home рендерит **одну** секцию `catalog`, внутри которой: preview-карточки + кнопка «весь каталог» + контакты + форма обратной связи. Раскладывать на отдельные **платформенные** секции (`catalog-home`, либо tires-preview + contacts + form), а не копировать part as-is.

| ❌ | ✅ |
|---|---|
| home-секция `tires` рендерит ВСЕ карточки (как на listing) | отдельная `catalog-home.twig`: только `data.selected[]` slugs (preview) + кнопка `/catalog` |
| canonical `video.twig` с `<video src=data/video/1.mp4>` забыт → пустая «фабрика» | перенести `data/video/*.mp4` + mask + импортировать `sections/video.css` |
| canonical-компонент (`form-partner.twig`) вставлен как есть → canonical-глобалы (`footer.*`, `{{root}}`) падают | прогнать через адаптацию globals (§4) ПЕРЕД include |

---

## 10. Архитектура vs визуал (стратегическое)

**Решение** (по словам пользователя): «архитектуру к kumho-style, визуал бренда подгоняем под рефакторенную структуру».

- **Структура** (templates/sections, components, pages) — единый kumho-canvas для ВСЕХ сайтов
- **Brand-визуал** — через `assets/css/base/variables.css` (цвета+шрифты) + `assets/css/base/brand-overrides.css` (section-specific визуал поверх kumho-canvas)
- НЕ копировать canonical-twigs as-is — они per-deployment вариативны

---

## 11. Обязательный verify-gate

После миграции, ПЕРЕД отчётом «готово»:

```bash
python3 tools/migrate/verify-canonical-template.py \
  --canon ../<legacy-slug> \
  --v2    ../<deployment-v2> \
  --host  <deployment-v2>.test \
  --brand <brand> \
  --urls / /catalog /buy /contact /actions /catalog/<sample-slug>
```

Должно быть `✓ VERIFY PASSED`. Затем **визуальная** проверка через Playwright MCP:
```
browser_navigate(http://<deployment-v2>.test/)
browser_take_screenshot()
# сравнить с canonical screenshot
```

---

## 12. Tooling

| Инструмент | Назначение |
|---|---|
| `tools/orchestrator/analyzers/legacy-archetype-inventory.py` | Классификация архетипов 47 сайтов |
| `tools/migrate/canonical-sync.py` | Per-archetype data-mapper (копировать + адаптировать CANON/V2/архетип) |
| `tools/migrate/verify-canonical-template.py` | Обязательный verify-gate (7 проверок, exit 1 при FAIL) |
| `tools/migrate/json-to-raw-paths.js` | image-paths → raw-source contract |
| `tools/migrate/sources-to-raw.js` | inline-HTML image migration |

См. также `docs/guides/legacy-to-platform-migration.md` (полный гайд) + `docs/proposals/0010-unified-sections-canvas.md` (стратегия canvas).
