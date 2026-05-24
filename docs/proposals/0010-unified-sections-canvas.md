# Proposal 0010: Унифицированные секции baseline-канвас + brand через CSS-vars

**Status**: Proposed
**Date**: 2026-05-24
**Author**: claude-baseline-session
**Related**: ADR-0008 (multi-deployment docs), ADR-0009 (assets deployment-local)

## Context

Миграция legacy iSmart-сайтов (trazano-orig, mirage-orig, armstrong, doublestar, landsail, авто-дилерские service.*/sales.* — порядка 30 сайтов) на platform идёт через **копирование canonical-twigs и CSS из dev/src/components** + точечное patching под platform-globals (`nav` → `global.nav[lang_code]`, `phone` → `global.phones[0]`, `model.X` → `tire.item.X` и т.д.).

Опыт миграции trazano-v2 + mirage-v2 (2026-05-24) показал что **этот подход не работает**:

1. **Per-deployment вариативность canonical-twigs.** trazano-cataloglist.twig содержит `model.sizes[].diameter` через cycle, mirage-cataloglist.twig просто iterates `globals.models` flat. armstrongtire будет иметь свой формат. Каждый canonical имеет свой набор полей.
2. **Sed-batch patching ломает twig-syntax.** Двойные `{{ }}` рекурсии, пропущенные edge cases, испорченные регулярные группы.
3. **Caнonical-globals (`models`, `articles`, `nav`, `phone`, `brand`, `disclaimer`) — kumho-/trazano-/mirage-specific.** Платформа их не предоставляет, ручная адаптация per-section per-deployment.
4. **Опечатки в canonical CSS (`sections__subitem` vs `section__subitem`)** не выявляются автоматически.
5. **Несовместимость структур данных:** mirage content.json имеет `{class: {container: 'narrow'}, heading, article}` (flat); trazano имеет `{class, items: [{class, content}]}` (nested). Один шаблон на оба не работает.
6. **Тиражирование на 30 сайтов невозможно** — каждый требует 2-5 дней ручных fix'ов «то фон, то фильтр, то размеры превью, то heading-string-vs-object».

## Decision

**Baseline предоставляет универсальную библиотеку секций (canvas), deployments не правят twig'и.**

### 1. Контракт секций

Каждая секция в `baseline/templates/sections/*.twig` работает только через:

- **`data.X`** — payload из `pageData.sections[i].data` (JSON)
- **`global.X`** — `global.nav[lang_code]`, `global.brand.{short,full}`, `global.phones[0].{href,title}`, `global.email`, `global.policy[lang_code]`, `global.copyright[lang_code]`
- **`tire/news/{entity}`** — на entity-страницах (collection-template)
- **Twig-функции платформы**: `url()`, `base_url()`, `asset()`, `image_has()`, `image_variants()`, `image_dimensions()`, `load_json()` (опционально для cross-page references)

**Запрещено** в section-twig:
- Глобальные переменные `nav`, `models`, `articles`, `phone`, `email`, `brand`, `disclaimer`, `owner`, `copyright`, `policy` — нет в platform-context.
- Хардкод путей к данным (`'/news/'`, `'/tires/'`) — через `entity_url_pattern` из `config/project.php :: collections`.
- Inline `<style>` атрибуты для статичного CSS (только `--bg-image` CSS-vars для динамики).
- Direct `<img>` для адаптивных картинок — через `picture.twig`.

### 2. Состав библиотеки секций

Минимальный canvas:

| Секция | data-структура | Источник items |
|---|---|---|
| **`header`** | `{}` или `{logo, button: {title, href, icon}}` | `global.nav[lang_code]`, `global.logo` |
| **`footer`** | `{}` или `{disclaimer, owner, copyright}` | `global.nav/phones/email/policy/copyright` |
| **`burger-menu`** | `{}` или `{items: [...]}` | `global.nav` (default) или local items |
| **`cookie-panel`** | `{}` | `global.cookie_policy` (опц.) |
| **`frame`** | `{cover, heading?: {title}}` | per-page |
| **`intro`** | `{slides: [{cover, heading, subheading, href, items?: ['profit1', 'profit2'], button?: {title, href, icon}}]}` | static в JSON |
| **`hero`** | `{cover, heading: {title, subtitle}, items?: [...]}` | static |
| **`range`** | `{heading: {title}, desc?, items: [{cover, title, href}]}` | static (категории) |
| **`about`** | `{heading: {title}, desc?, items: [{icon, title, desc}]}` | static cards |
| **`digits`** | `{heading: {title}, cover, items: [{title: int, desc}]}` | static counters |
| **`news`** | `{heading: {title}, items_from: 'news', limit?: 3}` | inject `news`-collection |
| **`tires`** | `{heading: {title}, items_from: 'tires', filter: {seasons[]?, diameters?, widths?, profiles?}}` | inject `tires`-collection |
| **`dealers`** | `{heading: {title}, map: {center, zoom, geolocation?}, items_from: 'dealers'}` | inject `dealers`-collection |
| **`cap`** | `{cover, heading: {title}, button?: {title, href}}` | static plashka |
| **`content`** | `{class?: 'section content', items: [{class: 'container narrow', content: '<HTML>'}]}` | inline-HTML (long-text страницы) |
| **`contacts`** | `{address?, phones, email, map?}` | global.phones/email + override |
| **`form`** | `{fields: [...], action, channel}` | global.forms (опц.) |

Опциональные секции (для отдельных deployments, добавляются через proposal/ADR):
- `profits` — список преимуществ с иконками
- `services` — карточки услуг
- `offer` — выделенное предложение
- `consultation` — CTA-блок с формой
- `application` — большая форма
- `modal` — popup-контейнер
- `map` — отдельная Yandex.Maps секция

### 3. Entity-templates (collection-страницы)

- **`pages/tire.twig`** — `tire.item.{name, code, season, types, cover}`, `tire.images[]`, `tire.desc.{short, full}`, `tire.sizes[]` (опц.), `tire.filter.{season, diameters, ...}`.
- **`pages/news.twig`** — `news.news.{title, date, cover, lead, body}`.
- Структура: include `header`, `frame` (с cover из `frame_data`), `productdetail`/`articledetail` (entity-specific), `more` (related), `footer`. Все через `{% include 'sections/X.twig' %}`.

### 4. Brand customization

**Только через CSS-переменные** в `assets/css/base/variables.css` каждого deployment:

```css
:root {
  --color-1: #fff;                    /* white */
  --color-2: #000;                    /* dark text */
  --color-3: <brand-accent>;          /* акцент: orange#f39910 (trazano), yellow#EEB136 (mirage) */
  --color-4: <brand-secondary>;       /* вторичный: dark#332c2b (trazano), blue#00A5CF (mirage) */
  --color-5: <brand-dark>;            /* фон */
  --font-1-bold: <BrandFont>-Bold, sans-serif;
  --font-1-medium: <BrandFont>-Medium, sans-serif;
  --font-1-regular: <BrandFont>-Regular, sans-serif;
}
```

CSS-секций уровня (`assets/css/sections/`) deployment-local (ADR-0009 уже это закрепляет) но **с единым набором BEM-classes** соответствующих canvas-templates baseline.

### 5. Migration tool

`baseline/tools/migrate/canonical-sync.py` — универсальный mapper:

**Input:**
- `--canon <path>` — путь к legacy iSmart-проекту (с `dev/+project/` или `dev/src/+project/`).
- `--out <path>` — целевой deployment в platform-формате.
- `--page-rename` JSON-map (опционально): `{"catalog": "tires", "articles": "news", ...}`.
- `--collections` JSON-map: `{"tires": {nav_slug: "tires", ...}, ...}`.

**Output:**
- `<out>/data/json/global.json` — brand + nav + contacts из canonical.globals.
- `<out>/data/json/{lang}/pages/*.json` — pages в sections-format с **mapped data** под platform-секции.
- `<out>/data/json/{lang}/{collection}/*.json` — entities из canonical-arrays.
- `<out>/data/json/{lang}/seo/*.json` — SEO per-page.
- `<out>/config/project.php` (опц.) — пред-заполненный collection + route_map + sitemap.
- `<out>/config/redirects.json` (опц.) — 301 со старых URLs на новые.

**Per-section mappers** в скрипте:

```python
SECTION_MAPPERS = {
    'cataloglist': lambda s: {'name': 'tires', 'data': {
        'heading': {'title': s.get('heading', 'Каталог')},
        'items_from': 'tires',
        'filter': normalize_filter(s.get('filters', {}), s.get('sezons', [])),
    }},
    'articleslist': lambda s: {'name': 'news', 'data': {
        'heading': {'title': s.get('heading', 'Статьи')},
        'items_from': 'news',
    }},
    'intro': lambda s: {'name': 'intro', 'data': {
        'slides': [normalize_slide(sl) for sl in s.get('slides', [])],
    }},
    # ... все остальные секции
}
```

**Brand mapper** в скрипте:

```python
def build_global_brand(canonical_globals):
    return {
        'brand': canonical_globals.get('brand', {}),
        'nav': {'ru': {'items': map_nav_urls(canonical_globals.get('nav', []))}},
        'phones': [canonical_globals.get('phone')] if canonical_globals.get('phone') else [],
        'email': canonical_globals.get('email', {}).get('title', ''),
        'logo': canonical_globals.get('logo', {}),
        'policy': {'ru': {'title': 'Политика конфиденциальности', 'href': '/policy/'}},
        'copyright': {'ru': canonical_globals.get('copyright', '')},
    }
```

**URL remap** (canonical-style → kumho-style):

```python
URL_MAP = {'/catalog': '/tires', '/articles': '/news', '/guarantee': '/warranty'}
```

### 6. Process миграции нового сайта (typical 30-сайтовый workflow)

```bash
cd ~/Sites/<new-deployment>      # legacy clone
cd ~/Sites/ismart-platform

# 1. Создать deployment skeleton
npm run create-deployment -- <new-deployment-slug>

# 2. Прогнать canonical-sync
python3 tools/migrate/canonical-sync.py \
  --canon ~/Sites/<legacy-slug> \
  --out ~/Sites/<new-deployment-slug> \
  --page-rename '{"catalog":"tires","articles":"news","guarantee":"warranty"}' \
  --collections '{"tires":{"nav_slug":"tires"}, "news":{"nav_slug":"news"}, "dealers":{"nav_slug":"buy"}}'

# 3. Скопировать base/variables.css из brand-pack (если есть) или вручную задать brand colors+fonts
cp templates/brand-vars-template.css ~/Sites/<new-deployment-slug>/assets/css/base/variables.css
# Отредактировать color-3, color-4, font-1-* под brand

# 4. Build + smoke
cd ~/Sites/<new-deployment-slug>
composer install && npm install
npm run build:images
npm run build:dev
# Открыть в браузере, проверить визуально

# 5. Доводка (per-deployment-specific, обычно <1 час)
# - Frame covers (если canonical-source не имел или нужны brand-specific)
# - Custom integrations (Yandex.Metrika ID, CallTouch keys, ...)
# - Конкретные SEO-tweaks

# 6. Commit + push
git add -A && git commit -m "feat: migration from <legacy-slug> via canonical-sync"
git push
```

**Target**: 30 сайтов × ~2 часа на каждый = 60 часов (vs текущие ~5 дней на сайт ручным trial-and-error).

## Consequences

### Положительные

- **30-сайтовый scale становится реальным.** Migration-tool делает 90% работы, ручная доводка минимальна.
- **Единая UX/UI по всем сайтам** — одинаковая структура секций, одинаковый BEM, одинаковые hover-эффекты. Brand отличается только цветами+шрифтами.
- **Bugfix в одной секции — fix везде.** Изменение `templates/sections/intro.twig` в baseline → distill sync → исправление на всех 30 сайтах.
- **Деплоймент-Claude сессии не работают над templates** — только над JSON-data + brand-variables. Меньше cross-cutting issues.
- **Тестирование централизованное** — phpunit/vitest над baseline-templates, не над каждым deployment.

### Отрицательные

- **Большой refactor baseline** — переписать все `templates/sections/*.twig` под unified contract. ~1-2 недели работы.
- **Не все canonical-секции имеют 1:1 mapping** — некоторые legacy-сайты могут иметь уникальные блоки (например, `countdown`, `application`-форма с custom-логикой). Для них — отдельные proposals + добавление в canvas как опциональные.
- **Существующие deployments (trazano-v2, mirage-v2, kumho, italy, beepitron) — нужны distill sync** после refactor. Их textual content (JSON-data) останется, изменится только разметка/CSS.
- **Brand-vars require полную поддержку** в base/buttons/typography/links — каждый deployment должен иметь brand-variables.css, без override base.css.

### Решения отложенные

- **Section-discovery от canonical**: не все legacy-сайты используют один и тот же набор. Сначала прогнать `commit-miner.mjs` cross-deployment чтобы найти повторяющиеся sections (3+ deployments) — это canvas. Остальные — per-deployment optional.
- **Brand-pack механизм** — папка `templates/brand-packs/<brand-slug>/` в baseline с `variables.css` шаблонами для известных брендов (trazano, mirage, kumho, ...). При scaffold нового deployment'а — `create-deployment --brand=trazano` копирует brand-pack.

## Implementation roadmap

**Phase 1 (1-2 дня)** — proposal + spec + migration-tool draft:
1. Этот документ (proposal 0010).
2. `tools/migrate/canonical-sync.py` draft с минимальным mapper-set (intro, range, about, digits, news, tires).
3. `docs/architecture/decisions/0010-...` — ADR после approval.
4. Brand-vars template в `templates/brand-vars-template.css`.

**Phase 2 (3-5 дней)** — refactor sections в baseline:
1. `templates/sections/{intro,range,about,digits,news,tires,dealers,frame,cap,content,header,footer,burger-menu,cookie-panel}.twig` — переписать под unified contract.
2. `assets/css/sections/*.css` в baseline — единые BEM-стили.
3. `templates/components/{picture,heading,filter,card-tire,card-dealer,card-news}.twig` — переиспользуемые.
4. Tests + integration smoke.

**Phase 3 (1-2 дня)** — миграция существующих:
1. Прогнать canonical-sync на trazano-v2, mirage-v2 с новыми canvas-секциями.
2. Distill sync baseline → kumho, italy, beepitron (templates/sections/, assets/css/sections/).
3. Smoke на каждом deployment'е.
4. Fix per-deployment-specific issues (если будут).

**Phase 4** — миграция 30 новых:
1. Один деплоймент = 2-часовая сессия в среднем.
2. Прогон canonical-sync + brand-vars setup + smoke + commit.
3. Параллельно — добавление brand-packs в baseline `templates/brand-packs/`.

## References

- Legacy migration guide: `docs/guides/legacy-to-platform-migration.md` — нуждается в переписи под этот подход после approval.
- Lessons learned: §15a того же гайда — 16 кейсов из ручной миграции trazano-v2 (формирующая mass этого proposal).
- Memory: `feedback-core-proposals-in-baseline`, `project-tire-buy-page-from-kumho`.
- Sessions: `2026-05-24-v2-deployments-finalization.md`, `2026-05-24-full-canonical-migration.md` (в trazano-v2, mirage-v2).
- ADR-0008 (multi-deployment docs), ADR-0009 (assets deployment-local).
