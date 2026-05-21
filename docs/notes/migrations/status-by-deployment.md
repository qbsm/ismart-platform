# Статус по deployments (2026-05-21)

Сводка состояния миграции и sync'а deployments относительно baseline `ismart-platform`.

| Deployment | Бренд | Тематика | Статус | Ветка | Head |
|---|---|---|---|---|---|
| `kumho-tires.ru` | Kumho | Шины | ✅ Эталон (baseline-донор) | `feat/dealer-brand-logo` | `505c174` |
| `italycommunity.ru` | — | Итал. рестораны | ✅ Sync с baseline | `sync/baseline-2026-05-20` | `7a8680b` |
| `beepitron.com` | Би-Питрон | Электротехника | ✅ Sync + content/visual fixes | `sync/baseline-2026-05-20` | `887ca29` |
| `trazano-tires.ru-v2` | TRAZANO | Шины | ✅ Полная миграция legacy → baseline | `feat/migrate-to-ismart-platform` | `98e9d5e` |
| `mirage-russia.ru-v2` | Mirage | Шины | ✅ Полная миграция legacy → baseline | `feat/migrate-to-ismart-platform` | `a946be3` |

Detailed migration status каждого:
- `~/Sites/trazano-tires.ru-v2/MIGRATION-STATUS.md`
- `~/Sites/mirage-russia.ru-v2/MIGRATION-STATUS.md`

## Что синхронизировано из baseline в этой итерации

### baseline `08fa612` — feat(loader): `slugs_page` support

`DataLoaderService::loadEntitySlugs()` поддерживает опциональный `$collectionConfig['slugs_page']` — slug'и берутся из `pages/{slugs_page}.json` (а не `pages/{nav_slug}.json`). Backward-compat: fallback на `nav_slug`.

**Use case**: beepitron `service-detail` коллекция — `nav_slug='service'`, `list_page_id='service'` (детальный layout), но slug'и услуг живут в `pages/services.json`. Без `slugs_page` `/service/training` отдавал 404.

### baseline `33c0f1c` — feat(loader): injectListItems инжектит во ВСЕ секции с пустым `data.items`

`PageAction::injectListItems()`:
1. **Flatten расширен** — теперь сохраняет `types`, `feature`, `tags`, `category`, `season`, `id`, `href`, `visible` (раньше только slug/cover/hex/date/title/desc).
2. **Items инжектятся во все секции** где `data.items` пуст или отсутствует. Backward-compat: секции с явно непустым `data.items` не перезаписываются.

**Use cases**:
- hero + typeCounts + `*-list` секция на одной list-странице — раньше требовало дублирования items в JSON, теперь автоматом.
- catalogs/certificates/video — теги по types в hero и карточки в list одновременно.
- kumho/trazano/mirage `/catalog` — секция tires получает items как прежде (паттерн совместим).

### baseline `1dda57d` — docs(migrations): status-by-deployment + trazano.md в выполнено

Этот файл (status-by-deployment.md) создан как единая точка статуса. trazano.md шапка обновлена с «план (не начат)» → «✅ Выполнена».

## Beepitron content/visual fixes (deployment-specific)

После baseline-sync на beepitron сделана серия точечных контент-фиксов **в самом deployment** (не в baseline) — кросс-проектная актуальность ограничена, но паттерны зафиксированы для будущей абстракции.

| Commit | Что |
|---|---|
| `d325011` | /news — items в news-list.data.items, redirect `/Новости → /news` |
| `5b7c59d` | главная — items news-slider/categories/services |
| `c177565` | slugs_page подтянут из baseline + populate list-страниц (certificates/catalogs/services) |
| `c5027fc` | теги types на /catalogs и /certificates (hero.data.items с types) |
| `ec294d8` | sync baseline injectListItems во все секции |
| `2679137` | management items + strip без container-left.offset |
| `9c01996` | numeric sort для slug='1','2','...,'15' (раньше шло '1','10','11',...) |
| `3f11892` | strip — вернул container-left.offset (timeline справа до края экрана) |
| `d5191ad` | EN locale populate /en + явные @media padding-left в strip.css |
| `a6dd446` | strip: `1rem → 1em` (выровнено с .container) |
| `887ca29` | strip — унификация padding-left на heading и cards (избавились от flex-margin-left глюка) |

**Паттерны, которые надо абстрагировать в baseline или scaffold:**

1. **Populate items в секции на не-list-страницах** — секциям main page (news-slider, categories на главной, management на /about) нужны items из коллекций, но baseline `injectListItems` запускается только когда `pageId == list_page_id`. Сейчас items вшиты в JSON через runtime-скрипт. Правильно — `data.items_from: "<collection>"` + DataLoader сам резолвит.

2. **Numeric-aware sort** — entity-папки со slug-числами (`1.json`, `2.json`, ..., `15.json`) сортируются alphabetically (`1, 10, 11, ..., 2, 3`). Нужна natural sort в `DataLoaderService::loadEntitySlugs()` и/или в scaffold.

3. **EN-locale populate** — если deployment имеет `data/json/en/` папки entity'ев, нужно дублировать items в `en/pages/*.json`. Должно быть автоматическим.

## Open items по deployments

### trazano-v2

- [ ] Полировка визуала intro/range/about/digits (см. `MIGRATION-STATUS.md`).
- [ ] Контент about/contacts.
- [ ] `.distill/state.json` для drift tracking.
- [ ] Production cutover (Valet rename).

### mirage-v2

- [ ] То же что trazano + добавить cap-секцию если на prod была.
- [ ] Проверить pagination/filter для 15 моделей.

### beepitron

- [ ] `/products` URL не зарегистрирован в `routes.php` (есть `/product-list`).
- [ ] Legacy `/product/{id}` числовые id → 404 (нужны legacy-id → semantic-slug redirects).
- [ ] EN-locale данные неполные (1 management из 15, 4 services из 6) — отражает текущее состояние `data/json/en/`. Если /en пользователи активны → расширить.
- [ ] Items в pages JSON сейчас "запечены" runtime-скриптом `populate-bp-multilang.py`. При добавлении новой entity нужно регенерировать. Правильно — баseline auto-resolve (см. паттерны выше).

### italycommunity / kumho

Sync'и применены, контент-задачи в основных проектах.

## Архитектурные улучшения, попавшие в baseline в этой итерации

1. **`slugs_page` decoupling** — slug-источник коллекции независим от `nav_slug`. Гибкость для legacy URL-схем.

2. **Multi-section item injection** — items коллекции автоматически попадают во все секции с пустым `data.items`. Убирает дублирование в JSON.

3. **Item flatten расширен** — `types`/`tags`/`feature`/`id`/`href`/`visible` сохраняются. Достаточно для всех текущих секционных шаблонов в 5 deployments.

## Известный тех-долг baseline

- `injectListItems` собирает items даже если **ни одна** секция с пустым `data.items` не имеет. Незначительная оптимизация — pre-check sections перед загрузкой entity'ев.
- `create-collection.js` scaffold не учитывает паттерн `slugs_page`. Добавить опцию.
- **Cross-page item injection** (главная подтягивает items коллекций без vshivanie в JSON) — самая ценная следующая фича. Шаблон: `data.items_from: "<collection>"` или маркировка секции для авто-резолва.
- **Numeric sort** для entity-папок со slug-числами — добавить в `loadEntitySlugs`.

## История изменений docs

- 2026-05-21 (этот файл): обновлены HEAD-коммиты deployments, добавлена секция beepitron content/visual fixes с паттернами для абстракции в baseline.
- 2026-05-21 (создание): сводка по 5 deployments после первой итерации distillation.
