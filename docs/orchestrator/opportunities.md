# Open opportunities

Систематические улучшения для baseline, накопленные из observation'ов оркестратора + сессий.
Каждое: что → почему → план абстракции. Когда сделано — переносится в `architecture/decisions/`.

| # | Opportunity | Status | Встречалось | Где |
|---|---|---|---|---|
| 1 | `data.items_from` cross-page injection <!-- tracks: data-flow --> | ✅ done (ADR-0004, 2026-05-21) | 8 раз | beepitron.com |
| 2 | Numeric-aware sort в `loadEntitySlugs` <!-- tracks: data-flow --> | ✅ done (ADR-0004 `scanCollectionSlugs`, 2026-05-21) | 1 раз | beepitron.com |
| 3 | `data.declared_order` для коллекций <!-- tracks: data-flow --> | ✅ done (ADR-0004 inherits list-page items[], 2026-05-21) | 1 раз | beepitron.com |
| 4 | Items inline (3-й тип источника) <!-- tracks: data-flow --> | ✅ done (ADR-0004 backward-compat: data.items уже непуст ⇒ не трогаем, 2026-05-21) | 1 раз | beepitron.com /video |
| 5 | Auto-redirect legacy URL'ов при rename collection | open | 2 раза | beepitron.com |
| 6 | scaffold `create-collection` поддержка `slugs_page` | open | 1 раз | beepitron.com |
| 7 | Cookie-panel default include в base.twig | open | 1 раз | beepitron.com |
| 8 | `BaseUrlResolver` APP_BASE_URL priority + `/public` fallback | ✅ done (baseline `ec39376`) | 1 раз | все |
| 9 | `injectListItems` во ВСЕ секции с пустым `data.items` | ✅ done (baseline `33c0f1c`) | 4 раза | beepitron.com |
| 10 | `slugs_page` decoupling | ✅ done (baseline `08fa612`) | 1 раз | beepitron.com |
| 11 | Entity-load переиспользует sections из list-page | ✅ done (baseline `69c9621`) | 1 раз | beepitron.com |
| 12 | SeoBuilder Strategy унификация во всех deployments <!-- tracks: commit:feat(seo) --> | ✅ done (ADR-0003 baseline) | 8 раз (commit-miner cross-deployment) | все 5 |
| 13 | CSS-refactor по `fix(css)` повторам <!-- tracks: commit:fix(css) --> | open (расследовать) | 5 раз | italy/beepitron/trazano/mirage |
| 14 | CSP middleware унификация <!-- tracks: commit:fix(csp) --> | open | 4 раза | kumho/italy/beepitron |

---

## 1. `data.items_from` cross-page injection

**Что**: расширить baseline так чтобы секция могла объявить:
```json
{"name": "news-slider", "data": {"items_from": "news", "limit": 5}}
{"name": "categories", "data": {"items_from": "categories", "order": "declared"}}
{"name": "management", "data": {"items_from": "management"}}
```

**Почему**: Сейчас при добавлении entity в коллекцию нужно регенерировать `pages/{id}.json :: section.data.items` через runtime-скрипт (например `populate-bp-multilang.py` в beepitron). Это deployment-side workflow который не масштабируется.

**План**:
- `DataLoaderService::loadPage()` после загрузки JSON проходит по секциям; если секция имеет `data.items_from` — резолвит коллекцию (через `loadEntitySlugs` + `loadEntity`) и инжектит в `data.items`.
- Поддержать `limit`, `order` (`declared|date-desc|slug`), `filter` (по полю entity).
- Backward-compat: если `data.items` уже непуст, не перезаписываем.

**Связь с другими**: вместе с #3 (declared_order) и #4 (items inline) формирует **полный generic-loader**.

---

## 2. Numeric-aware sort в `loadEntitySlugs`

**Что**: entity-файлы со slug-числами (`1.json`, `2.json`, ..., `15.json`) при сборке через glob сортируются alphabetically (`1, 10, 11, ..., 2, 3, ...`). Нужна natural-sort.

**Почему**: visual order на странице зависит от sort. Менеджер видит "Хестанова идёт после Кокоткова, а должна 10-й" — баг.

**План**:
- `DataLoaderService::loadEntitySlugs()` sort: если все stem'ы цифровые — `(a, b) => +a - +b`. Иначе locale-aware string.
- То же в scaffold `create-collection.js` (fixtures).

---

## 3. `data.declared_order`

**Что**: если `pages/{list}.json :: items[]` задаёт порядок ("photonics, wire-harnesses, ..."), и секция авто-инжектится через `items_from`, **следовать** этому порядку.

**Почему**: на prod beepitron каталог категорий идёт в специфическом порядке (Фотоника → Жгуты → НАСК → ...). На disk имена `1.json, 2.json` (numeric IDs). Без declared order — alphabetical вместо human-curated.

**План**: при `items_from='categories'` + наличие `pages/categories.json :: items[]` — order = items[].

---

## 4. Items inline (3-й тип источника)

**Что**: страница может иметь inline-массив **plain объектов** (не slug'и) в `pages/{id}.json :: items[]` и хотеть распространить их в секции.

**Пример**: beepitron `/video` — items уже plain (slug, href, title, types — без entity-папки `data/json/ru/video/`).

**План**: extending `items_from` опцией: если value — массив объектов в `pageData['items']`, использовать его напрямую. Или специальная маркировка `data.items_from: 'inline'`.

---

## 5. Auto-redirect при rename collection

**Что**: когда rename коллекции (например `certificates → docs`), нужны 301 redirect'ы:
- `/certificates → /docs`
- `/certificate/{slug} → /docs/{slug}` (если изменён URL pattern)
- Для каждого entity если slug изменился: `/old-slug → /new-slug`

**Почему**: legacy URLs / bookmark'и теряются → SEO regress.

**План**: scaffold `rename-collection <old> <new>` — переименовывает файлы, пути в JSON, и автоматически добавляет redirects.

---

## 6. scaffold `create-collection` поддержка `slugs_page`

**Что**: scaffold создаёт коллекцию с предположением что slug'и в `pages/{nav_slug}.json :: items[]`. Если deployment использует другую страницу (`slugs_page`), нужно опционально.

**План**: `--slugs-page=<file>` опция в `create-collection`. Запись в settings + комментарий.

---

## 7. Cookie-panel default в base.twig

**Что**: cookie-panel должен быть **глобальным** (один include в base.twig), не page-section'ом.

**Почему**: при refactor pages JSON легко пропустить cookie-panel в одной из страниц → не показывается → нарушение GDPR / 152-ФЗ.

**План**:
- baseline `templates/base.twig` уже имеет include `cookie-panel.twig`.
- `global.json :: cookie-panel` — стандартный ключ с дефолтами.
- scaffold `create-deployment` ставит дефолты.

---

## История DONE

См. таблицу выше. Done items имеют commit hash, можно по `git show <hash>` посмотреть реализацию.
