# Сессия 2026-05-22 — Raw-source `<picture>` (ADR-0007)

Реализация proposal 0003: контент-владелец указывает только путь к raw-исходнику, ключи `400/800/.../2560` уходят из JSON. Шаблон сам подсасывает доступные варианты из manifest'а (только downscale, ADR-0006).

## Главное

**Breaking change JSON-контракта**, обкатанный на italy с verify в реальном рантайме (`php -S` + curl). Reference симптом proposal'а 0001 (intro/mob-lemons broken AVIF) → после ADR-0006 (mobile fallback на desktop-scaled) → после ADR-0007 (mobile получает **vertical 400-вариант**) — UX корректен на каждом этапе.

**Конвенция raw-only.** Все источники для `<picture>` лежат в `data/img/<section>/raw/`. Никаких файлов рядом с подпапками `{400,800,...}`. Скрипт `sources-to-raw.js` мигрирует существующие direct-files в raw/ с критериями:
- ext `jpg|jpeg|png|webp|avif` (SVG не трогаем, gif не трогаем)
- width ≥ 400px (мелкие иконки/logos остаются на верхнем уровне)
- НЕ direct-cited в JSON (pre-scan: файлы под `cover.src`, `src` для legacy `<img>` шаблонов остаются)

**DataExtension::imageVariants(rawPath)** возвращает entries из manifest'а:
- `'400' => ['webp' => '...', 'avif' => '...']` если ключ сгенерирован
- `'800' => null` если skip-upscale (raw < 800)

**picture.twig** теперь имеет 6 веток вместо 4: 2 новые (string raw-path, object с raw-strings) + 4 legacy (объекты с числовыми ключами, image.src, raw/800/1600). Legacy сохраняются на время миграции, удалятся финальным sync после раскатки на все deployment'ы.

**Twig 3 не имеет `is string`** — пришлось использовать `is iterable == false and image`. Поймал не сразу: первый запуск дал 500 ошибку «Unknown "string" test», заменил во всех 4 местах.

## Что создано / обновлено

- `src/Twig/DataExtension.php` — функция `image_variants`, helper `extractPatternFromRawPath`, lazy-loader `loadImageSizeKeys` для динамических ключей из `config/image-sizes.json`
- `templates/components/picture.twig` — 2 новые ветки + макросы `raw_srcset`, `raw_fallback`; legacy ветки сохранены под комментарием LEGACY
- `tools/migrate/sources-to-raw.js` — миграция direct-files в raw/. Pre-scan JSON для direct-cited paths. `--dry-run` поддерживается. На italy: перенесено 27 файлов, 6 пропущено как direct-cited, 3 как width<400, 0 ошибок.
- `tools/migrate/json-to-raw-paths.js` — миграция multi-key image объектов на raw-path формат. На italy: 1 файл (index.json), 7 image-объектов, 0 orphans.
- `tests/php/Unit/DataExtensionImageVariantsTest.php` — 8 тестов, 24 assertion
- `docs/architecture/decisions/0007-raw-source-picture.md` — ADR
- `docs/proposals/0003-raw-source-picture.md` — удалён после миграции в ADR

## Verify italy

- HTTP 200, 58KB HTML
- intro секция: для каждого слайда — 4 `<source>` тега
  - `media="(max-width: 767px)"`: `mob-lemons.avif 400w`, `mob-lemons.webp 400w` (только 400 — raw 780×1368, остальные skip-upscale)
  - default (desktop): `desk-lemons.avif 400w..2560w`, `desk-lemons.webp 400w..2560w` (все 6 ключей — raw 2900px)
- fallback `<img src>` указывает на existing `desk-lemons.webp` 400
- 0 broken-references в DevTools (raw-only гарантирует существование)

## Найденные проблемы / Follow-up

- **`sources-to-raw.js` v1 не учитывал direct-cited paths.** При первом прогоне на italy перенёс `navigation/delivery.jpg`, `owners/X.jpg` (которые используются как direct `<img src>` без `picture.twig`). Шаблоны ссылались на исчезнувшие пути. Доработка v2 — pre-scan JSON, исключение direct-cited.
- **Legacy `<img src>` шаблоны** (navigation cards, owners, news-card) не используют `picture.twig`. Картинки в них остаются на верхнем уровне (не мигрируются в raw/). Полная унификация — отдельный proposal: миграция card-секций на `picture.twig` → все растровые источники ≥ 400px попадают в raw/.
- **`intro/cover.jpg`, `intro/cover1.jpg`** — orphan files в italy: ни JSON, ни Twig их не используют, но скрипт перенёс в raw/. Не критично — лежат там без вреда. Можно удалить отдельной чисткой.

## Не сделано в этой сессии

- Раскатка на kumho и beepitron — следующий шаг после baseline commit.
- Доработка миграции на kumho/beepitron потребует прогона sources-to-raw.js + build:images + json-to-raw-paths.js. На каждом — verify.
- Финальная чистка legacy-веток `picture.twig` — после полной раскатки на все 3 deployment'а.
- `tools/build/check-image-references.js` (линтер orphan paths) — follow-up.

## Видео из `data/img/` в `data/video/`

Параллельно: 5 файлов `*.mp4`, `*.webm` в `data/img/us/` перенесены в `data/video/us/`. Обновлены 4 ссылки в `templates/sections/us.twig` (data-src-* атрибуты) и 1 в `index.json` (`video.src`). Постер `video-cover.jpg` остаётся в `data/img/us/` — он image, а не video.

Зафиксировать как конвенцию: видео-файлы (mp4/webm/mov) — в `data/video/<section>/`, статика-постеры — в `data/img/<section>/`. Это пока без отдельного ADR — convention уровня раскладки данных.
