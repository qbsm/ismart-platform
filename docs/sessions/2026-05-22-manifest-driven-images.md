# Сессия 2026-05-22 — Manifest-driven `<picture>` (ADR-0006)

Реализация proposal 0001-manifest-driven-images: гейтинг `<source>` через `image_has()` на базе уже существующего `assets/img/build/image-dimensions.json`. Попутно — fix CLS для абсолютных URL в `image_dimensions()`. Proposal удалён, мигрирован в ADR-0006.

## Главное

**Manifest как source of truth для шаблона.** `build-images.js` уже перезаписывает `image-dimensions.json` при каждом билде с реально сгенерированными `.webp` и `.avif`. Не строим новую инфраструктуру — переиспользуем. Принципы соответствуют 11ty Image / Astro `<Image>` / Next.js `next/image`.

**Graceful degradation на свежем клоне.** Главный риск (отмечен в моей оценке proposal'а) — на `git clone && npm run dev` без `npm run build:images` манифест отсутствует. Базовый proposal в этом сценарии сворачивал `<picture>` до пустого fallback'а. Реализован с поправкой: `loadImageDimensionsManifest()` запоминает `imageManifestExists`, и `imageHas()` возвращает `true` когда манифеста нет → шаблон ведёт себя как до гейтинга (эмитит всё). После первого `build:images` гейтинг включается.

**Попутный CLS-fix.** `getImageDimensions()` нормализовал только `^data/img/` префикс. После `JsonProcessor::processJsonPaths` пути абсолютные (`https://host/data/img/...`) → regex не срабатывал → CLS на hero. Выделил общий `normalizeManifestKey()` (отрезает `https?://[^/]+/`, `/`, `data/img/`) — используется и в `imageHas()`, и в `getImageDimensions()`. Один helper, два бага закрыты.

**`build:images` теперь обязателен** при добавлении новых картинок. Без него путь не попадает в манифест → шаблон его не отдаёт. Зафиксировано в `docs/architecture/images.md` и `docs/guides/deploy-checklist.md`.

## Что создано / обновлено

- `src/Twig/DataExtension.php` — функция `image_has`, helper `normalizeManifestKey`, lazy-loader `loadImageDimensionsManifest` с флагом `imageManifestExists`, обновлённый `getImageDimensions`
- `templates/components/picture.twig` — 3 макроса (`build_srcset`, `build_avif_srcset`, `find_fallback`) гейтят через `image_has`
- `tests/php/Unit/DataExtensionImageHasTest.php` — 7 тестов, 21 assertion: 4 формы пути нормализуются, известные/неизвестные ключи, пустой path, абсолютные URL для CLS, graceful fallback на отсутствующий манифест, кэш манифеста
- `docs/architecture/decisions/0006-manifest-driven-images.md` — ADR
- `docs/architecture/images.md` — раздел «Manifest-driven контракт» с edge cases
- `docs/guides/deploy-checklist.md` — пункт про `build:images` при добавлении картинок
- `docs/proposals/0001-manifest-driven-images.md` — удалён (мигрирован в ADR)

## Проверки

- `vendor/bin/phpstan analyse` — без ошибок
- `vendor/bin/phpunit` — 96 tests, 166 assertions, 10 skipped

## Не сделано в этой сессии

- Раскатка на 3 deployments через `distill sync` — следующий шаг.
- Реальная проверка симптома italycommunity.ru intro/mob-lemons — после sync на italy.
- Follow-up из proposal'а (`tools/build/check-image-references.js`, clean-assets расширение, WARN при skip-upscale) — отдельной сессией.
- `picture.twig` формально per-project, но фактически идентичен во всех 4 deployment'ах — стоит перенести в core при следующей итерации (отдельный proposal).
