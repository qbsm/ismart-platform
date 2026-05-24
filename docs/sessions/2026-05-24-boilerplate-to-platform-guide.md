# Сессия 2026-05-24 — Гайд миграции legacy iSmart-boilerplate → ismart-platform

## Контекст

Пользователь зафиксировал: «канон http://trazano-tires.ru.test/ только тут немного устаревшая архитектура, ее нужно на лету приводить к нашим соглашениям включая нейминг разметки и стилей». Далее: «нужно чтобы ты сделал инструкцию по миграции с boilerplate на platform у нас таких сайтов много».

На staging видны десятки legacy iSmart-сайтов (armstrong, doublestar, landsail, avtofin, авто-дилеры service.*/sales.*, trazano-orig, mirage-orig и т.д.) которые сделаны на старом стеке: `dev/+project/` + gulp + vanilla PHP + Twig 1.x. Каждый когда-нибудь должен мигрироваться на baseline.

Чтобы это не было ad-hoc'ом каждый раз — пишем универсальный документированный процесс.

## Что сделано

1. Inventory legacy-boilerplate на примере `../trazano-tires.ru/` (canonical):
   - `dev/` — gulp+webpack+src/components/{name}/{name}.{css,js}, src/pages/{name}/
   - `project/` — vanilla PHP router (`index.php` + `form.php` + `json.php`), templates/layout.twig + templates/parts/, data/content/{page}.json + data/production/{page}-production.json, vendor/ (Twig 1.x)
2. Сравнение с platform conventions: что совместимо (BEM, kebab-case, JS-хуки .js-X), что нужно адаптировать (paths, JSON-формат, layout → base, Twig 1→3, gulp → npm scripts).
3. Выявление anti-patterns: inline `<style>`, critical-twigs, CDN-теги, mixed-bag globals в JSON, vendor/ committed, `data/production/X-production.json` слой post-build.
4. Документ `docs/guides/legacy-to-platform-migration.md` — пошаговый универсальный гайд.

## Не сделано (follow-up)

- **`tools/migrate/legacy-page-to-sections.mjs`** — автоматизация конверсии `data/content/{page}.json` flat-format → `data/json/{lang}/pages/{page}.json` sections-format. По мере накопления опыта на 2-3 миграциях.
- **`tools/scaffold/migrate-legacy-deployment.mjs`** — wrapper-скрипт по checklist'у §12. Когда станет ясно что повторяющиеся шаги стандартизируются.
- **Перенос конкретного legacy** (armstrong / doublestar / landsail и т.д.) на baseline — отдельные deployment-Claude сессии по этому гайду.

## Замечания

- Гайд рассчитан на cross-deployment применение — конкретный slug в нём не упоминается, примеры через `<deployment-slug>`.
- Anti-patterns раздел — важная защита от соблазна «скопировать как есть». Каждый anti-pattern с reason'ом.
- Гайд распространяется на deployments через distill (по ADR-0008 `docs/guides/` синкается).

## Hybrid migration — зафиксировано

Пользователь добавил по ходу сессии: **trazano-tires.ru-v2 /buy** — не из canonical trazano-orig (там carriage), а **из kumho-tires.ru** (логика работы + структура карточек дилеров). Стилизация — под trazano-бренд (типографика/цвета через CSS-переменные).

Зафиксировано в §13.7 «Hybrid migration» гайда. Это новый паттерн — при миграции tire-deployments стандартно брать `/buy` из kumho, а не из canonical legacy.

Memory `project-tire-buy-page-from-kumho` создана для пользователя — фиксирует решение на уровне cross-conversation памяти.
