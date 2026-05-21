# Статус по deployments (2026-05-21)

Сводка состояния миграции и sync'а deployments относительно baseline `ismart-platform`.

| Deployment | Бренд | Тематика | Статус | Ветка | Последний sync |
|---|---|---|---|---|---|
| `kumho-tires.ru` | Kumho | Шины | ✅ Эталон (baseline-донор) | `feat/dealer-brand-logo` | 33c0f1c |
| `italycommunity.ru` | — | Итал. рестораны | ✅ Sync с baseline | `sync/baseline-2026-05-20` | 7a8680b |
| `beepitron.com` | Би-Питрон | Электротехника | ✅ Sync + content fixes | `sync/baseline-2026-05-20` | ec294d8 |
| `trazano-tires.ru-v2` | TRAZANO | Шины | ✅ Полная миграция legacy → baseline | `feat/migrate-to-ismart-platform` | c2387dd |
| `mirage-russia.ru-v2` | Mirage | Шины | ✅ Полная миграция legacy → baseline | `feat/migrate-to-ismart-platform` | d72b6c3 |

Detailed migration status каждого:
- `~/Sites/trazano-tires.ru-v2/MIGRATION-STATUS.md`
- `~/Sites/mirage-russia.ru-v2/MIGRATION-STATUS.md`

## Что синхронизировано из baseline (последняя итерация 2026-05-21)

### feat(loader): `slugs_page` support — baseline `08fa612`

`DataLoaderService::loadEntitySlugs()` поддерживает опциональный `$collectionConfig['slugs_page']` — slug'и берутся из `pages/{slugs_page}.json` (а не `pages/{nav_slug}.json` если задано). Backward-compat: fallback на `nav_slug`.

**Use case**: beepitron `service-detail` коллекция — `nav_slug='service'`, `list_page_id='service'` (детальный layout), но slug'и услуг живут в `pages/services.json`. Без `slugs_page` `/service/training` отдавал 404.

### feat(loader): injectListItems инжектит во ВСЕ секции с пустым `data.items` — baseline `33c0f1c`

`PageAction::injectListItems()`:
1. Flatten расширен — теперь сохраняет `types`, `feature`, `tags`, `category`, `season`, `id`, `href`, `visible` (раньше только slug/cover/hex/date/title/desc).
2. Items инжектятся во **все секции** где `data.items` пуст или отсутствует. Backward-compat: секции с явно непустым `data.items` не перезаписываются.

**Use cases**:
- `hero + typeCounts` + `*-list` секция на одной list-странице — раньше требовало дублирования items в JSON, теперь автоматом.
- catalogs/certificates/video — теги по types в hero и карточки в list одновременно.
- kumho/trazano/mirage `/catalog` — секция tires получает items как прежде (паттерн совместим).

## Open items по deployments

### trazano-v2

- [ ] Полировка визуала intro/range/about/digits (см. MIGRATION-STATUS).
- [ ] Контент about/contacts.
- [ ] `.distill/state.json` для drift tracking.
- [ ] Production cutover.

### mirage-v2

- [ ] То же что trazano + добавить cap-секцию если на prod была.
- [ ] Проверить pagination/filter для 15 моделей.

### beepitron

- [ ] `/products` URL не зарегистрирован в `routes.php` (есть `/product-list`).
- [ ] Legacy `/product/{id}` числовые id → 404 (нужны legacy-id → semantic-slug redirects).
- [ ] `/about` секция `strip` (история компании) — заменено `container-left.offset` на `container` для grid-выравнивания. Если нужен horizontal-scroll эффект обратно → отдельная секция `timeline.twig`.

### italycommunity / kumho

- Sync'и применены, контент-задачи в основных проектах.

## Архитектурные улучшения, появившиеся из этой итерации

Эти изменения уже в baseline:

1. **`slugs_page` decoupling** — slug-источник коллекции независим от nav_slug. Гибкость для legacy URL-схем.

2. **Multi-section item injection** — items коллекции автоматически попадают во все секции с пустым `data.items`. Убирает дублирование в JSON.

3. **Item flatten расширен** — `types`/`tags`/`feature`/`id`/`href`/`visible` сохраняются. Достаточно для всех текущих секционных шаблонов в 5 deployments.

## Известный тех-долг baseline

- `injectListItems` собирает items даже если **ни одна** секция в data.items пустой не имеет (т.е. лишняя работа). Оптимизация: pre-check sections перед загрузкой entity'ев. Незначительно — entity loads быстрые, дисковый кэш.
- `create-collection.js` scaffold не учитывает паттерн `slugs_page`. На след. итерации — добавить опцию.
