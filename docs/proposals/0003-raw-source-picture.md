# Proposal 0003: Raw-source `<picture>` (контент указывает только путь к raw-исходнику)

**Status:** Migrated to ADR-0007 (2026-05-22)
**Дата:** 2026-05-22
**Финальный ADR:** [`docs/architecture/decisions/0007-raw-source-picture.md`](../architecture/decisions/0007-raw-source-picture.md)

> ⚠️ **Архивный stub.** Оригинальный proposal был удалён до правила «proposals не удалять» (`feedback-proposals-lifecycle`, 2026-05-24). Содержательное обсуждение полностью отражено в ADR-0007.

## Краткое описание

Изменение контракта JSON для изображений в `<picture>`:

**До:**
```json
"image": {
  "horizontal": {
    "400":  "data/img/intro/400/desk-lemons.webp",
    "800":  "data/img/intro/800/desk-lemons.webp",
    "1600": "data/img/intro/1600/desk-lemons.webp",
    "raw":  "data/img/intro/raw/desk-lemons.webp"
  },
  "vertical": { /* такая же структура */ }
}
```

**После:**
```json
// Single
"image": "data/img/content/raw/about.webp"

// Multi-orientation
"image": {
  "horizontal": "data/img/intro/raw/desk-lemons.webp",
  "vertical":   "data/img/intro/raw/mob-lemons.webp"
}
```

Контент-владелец указывает только raw-path. `picture.twig` через `DataExtension::imageVariants()` сам резолвит доступные ключи (`400/800/1280/1600/1920/2560`) из manifest'а `assets/img/build/image-dimensions.json`.

## Результаты

- ADR-0007 принят, имплементирован, раскатан на kumho/italy/beepitron.
- `tools/migrate/sources-to-raw.js` (v3) — миграция direct-files в `raw/` с pre-scan inline HTML в JSON-string-values.
- `tools/migrate/json-to-raw-paths.js` (v2) — миграция multi-key объектов на raw-source формат, идемпотентна.
- 8 unit-тестов в `tests/php/Unit/DataExtensionImageVariantsTest.php`.
- Reference verify на italy: HTTP 200, mobile получает 400-вариант mob-lemons, desktop — все 6 ключей desk-lemons.

## Связано

- [ADR-0006](../architecture/decisions/0006-manifest-driven-images.md) — предшественник, manifest-driven gating
- [ADR-0007](../architecture/decisions/0007-raw-source-picture.md) — итоговое решение
- Sessions: `docs/sessions/2026-05-22-raw-source-picture.md`
