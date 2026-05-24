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
