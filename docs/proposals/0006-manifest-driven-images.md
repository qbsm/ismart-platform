# Proposal 0006: Manifest-driven responsive images в picture.twig

**Status:** Migrated to ADR-0006 (2026-05-22)
**Дата:** 2026-05-22
**Финальный ADR:** [`docs/architecture/decisions/0006-manifest-driven-images.md`](../architecture/decisions/0006-manifest-driven-images.md)

> ⚠️ **Архивный stub.** Оригинальный proposal был удалён до правила «proposals не удалять» (`feedback-proposals-lifecycle`, 2026-05-24). Также — proposal был нумерован `0001-manifest-driven-images.md` (конфликтуя с notification-channel-dispatcher), переименован в `0006-*` для уникальности при восстановлении. Содержательное обсуждение в ADR-0006.

## Краткое описание

`templates/components/picture.twig` эмитил `<source type="image/avif">` без проверки существования файла. При skip-upscale в `build-images.js` (когда raw < target_width) AVIF не генерировался, JSON же декларировал ключи статически → 404 → `<picture>` остаётся пустым (браузер не делает source-fallback на следующий type).

**Reference симптом:** italycommunity intro/mob-lemons (raw 780×1368, ключи 800/1600 skip-upscale).

## Решение

Использовать `data/img/image-dimensions.json` (auto-generated `build-images.js`) как source of truth. `picture.twig` через `DataExtension::imageHas()` гейтит эмиссию `<source>` — только если файл реально есть в manifest'е.

Попутно: `image_dimensions()` для абсолютных URL (CLS-fix после `JsonProcessor::processJsonPaths`).

Graceful fallback на свежий клон без `npm run build:images` — `imageHas()` возвращает `true` если манифест отсутствует физически.

## Результаты

- ADR-0006 принят, имплементирован, раскатан.
- Расположение manifest: `assets/img/build/image-dimensions.json` (рядом с asset/css-manifest, deploy-checklist обновлён).
- 7 unit-тестов в `tests/php/Unit/DataExtensionImageHasTest.php`.
- Reference симптом mob-lemons закрыт.

## Связано

- [ADR-0006](../architecture/decisions/0006-manifest-driven-images.md) — итоговое решение
- [Proposal 0003](0003-raw-source-picture.md) → [ADR-0007](../architecture/decisions/0007-raw-source-picture.md) — последующее упрощение JSON-контракта
- Sessions: `docs/sessions/2026-05-22-manifest-driven-images.md`
