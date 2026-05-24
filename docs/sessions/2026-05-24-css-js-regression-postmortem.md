# Сессия 2026-05-24 — Постмортем регрессии CSS/JS из distill sync (3 случая, ADR-0009)

Постмортем серии регрессий в italy на 22-24 мая, когда `distill sync` затирал deployment-local frontend assets baseline-версией. Root cause найден, закрыт через ADR-0009.

## Главное

`tools/distill/distill.mjs::SKIP_PREFIXES` исключал из default sync только `assets/{css,js}/{sections,pages}/`, оставляя `base/`, `components/`, `critical.css`, `main.{css,js}`, `vendor.js`, `utils/` синкаемыми. Эти файлы на деле deployment-specific (палетта, layout, формы — см. proposal 0009 §Context), и каждый sync их затирал baseline-версией.

3 эпизода:

| # | Дата | Sync commit | Реверт commit | Объём |
|---|---|---|---|---|
| 1 | 23.05 | `085578e` (italy, notification channels + накопленный drift) | `9bf0d56` (CSS) + `5c2636a` (JS) | 17 CSS + 7 JS затёрто |
| 2 | 24.05 утро | `2ac09b2` (italy, общая справочная docs) | revert в italy сессии | те же 17 CSS + 7 JS |
| 3 | 24.05 вечер | `491bff3` (italy, sync ADR-0009 — но до commit'а baseline) | revert в italy сессии | те же |

## Root cause

`SKIP_PREFIXES` слишком узкий. Гипотеза при создании была что `sections/` и `pages/` — это deployment-specific, а `components/` и `base/` — общие. На практике palette colors / layout / form-styles в `base/` и `components/` отличаются между deployments (italy подписка vs kumho contact-form, italy палеттa color-1..6 vs kumho-палеттa). Sync делал false-positive.

## Решение (ADR-0009)

`assets/css/` и `assets/js/` **целиком** в SKIP_PREFIXES. Точечный sync через `--only=assets/js/components/X/` остаётся для архитектурных модулей (form-callback JS после ADR-0005). `--only=` обрабатывается ДО SKIP — позволяет explicit pull поверх default exclusion.

Реализация: `tools/distill/distill.mjs` коммит `b30b57d` (24.05).

## Что произошло с другими deployments

- **kumho**: только 1 sync(baseline) `369b265` затронул assets/, изменения минимальные (7 строк в `base/typography.css` + `.gitkeep`). Visual regression маловероятна.
- **beepitron**: единственный sync(baseline) `70dd6e8` был **initial migration** с vanilla-PHP на Slim 4 (73 файла, +5331/-666). Это не regression — заданное состояние.

Следовательно — **только italy пострадал реально**. kumho/beepitron Claude-сессиям достаточно дополнительно проверить визуально (главная + любая страница со слайдером/формой), но revert не требуется по результатам анализа.

## Что сделано

- **ADR-0009** + memory `feedback-assets-deployment-local` — превентивная защита от будущих случаев.
- **`docs/conventions/claude-session-boundaries.md`** — convention о ролях параллельных Claude-сессий, чтобы baseline не лез в deployments без явного запроса и наоборот.
- **Italy revert** — выполнен в italy Claude сессии (она держит свой shell).

## Не сделано

- **Визуальный smoke kumho/beepitron** — не делаю из baseline-сессии (`feedback-session-boundaries`). Передаю задачу kumho/beepitron Claude-сессиям как рекомендация. Каждая сессия сама решит, есть ли регрессия (read-only diff достаточно — отличается ли HEAD CSS/JS от pre-sync состояния).
- **Sweep-script** (опционально). Можно написать `tools/orchestrator/analyzers/sync-regression-check.mjs` — для каждого deployment'а сверяет current assets с состоянием **до** первого baseline-sync'а; если drift существенный — flag. Имеет смысл только если будут ещё подобные случаи (сейчас ADR-0009 убрал источник).

## Уроки

1. **`SKIP_PREFIXES` — slippery slope.** Когда добавляем новое исключение, легко промахнуться по уровню (sections/ vs components/). Лучше «всё deployment-local + точечный allow» чем «sync всё + точечный skip» — invert default.
2. **Verify before sync** (`feedback-verify-before-sync`) ловит такие баги до раскатки. Не сработал тут потому что мы делали `sync --yes` без `--dry-run` reviewing.
3. **Параллельные Claude-сессии** должны иметь scope. Зафиксировано в `claude-session-boundaries.md`.

## References

- ADR-0009 (`docs/architecture/decisions/0009-css-js-deployment-local.md`)
- Memory: `feedback-assets-deployment-local`, `feedback-session-boundaries`, `feedback-verify-before-sync`
- Italy session logs: revert'ы 23.05 + 24.05 (в `italycommunity.ru/docs/sessions/`)
