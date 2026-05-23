# Сессия 2026-05-24 — Orphan overrides детектор + восстановление italy

Симптом: на italycommunity.ru.test/restaurants — «Данные для страницы не найдены или неверный формат секций».

## Корневая причина

`config/project.php` italy помечен в `.distill/state.json::overrides` (deployment-specific), но **физически отсутствовал на диске**. Файл никогда не tracked в git italy. Без него `$projectConfig = []` → `settings::collections = []`, `route_map = []` → PageAction не знает что `restaurants` это collection → пытается загрузить `pages/restaurants.json` как обычную страницу. В `pages/restaurants.json` только `{ "items": [...] }` (slugs-source), без `sections` → ошибка format-of-sections.

Тихий downstream-fail: override **намерение**, но не гарантия наличия. Раньше italy работал по другой схеме (наверное от руки кто-то правил routes.php или была отдельная PageAction), потом перешёл на baseline-PageAction после моих синков, и без `project.php` стало broken.

## Фикс

### 1. Восстановил `config/project.php` italy

`route_map: { restaurants: "restaurants-list" }`, `collections.restaurants` с полями (nav_slug, list_page_id, template, item_key, data_dir, slugs_source, slugs_page, extras_key), `sitemap_pages`.

Verify: `/restaurants` HTTP 200, 113KB, 341 picture/card; `/restaurants/bear/` HTTP 200.

### 2. distill status детектирует orphan overrides

Добавлен 6-й столбец `orphan-overrides` в `node tools/distill/distill.mjs status`. Для каждого deployment'а проверяет: помечен ли файл в `state.json::overrides` И отсутствует ли он физически. Печатает WARN-блок со списком orphans.

Найдено в beepitron: `config/project.php` тоже orphan (но beepitron имеет flat-контент без collections → возможно файл не нужен, либо нужен пустой stub). **Отдельная задача** — решить.

## Что обновлено

- `tools/distill/distill.mjs::cmdStatus` — детектор orphan overrides + WARN-блок
- `data/json/ru/pages/news.json` (kumho, ранее) — `title: "Новости"` для breadcrumb (предыдущая сессия, упомянуто здесь как контекст)
- `~/.claude/.../memory/feedback_orphan_overrides.md` — правило
- `italycommunity.ru/config/project.php` — восстановлен

## Memory сохранён

`feedback_orphan_overrides` — override в state.json не гарантирует существование файла; distill status ловит автоматически.

## Не сделано

- **beepitron config/project.php** — pending решение: удалить override (если не нужен) или восстановить (если нужен).
- Закаталог distill.mjs на 3 deployments — стандартный sync поднимет новый detector.
