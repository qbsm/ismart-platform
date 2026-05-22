# ADR-0007: Raw-source `<picture>` (контент указывает только путь к raw)

**Status**: Accepted
**Date**: 2026-05-22
**Builds on**: ADR-0006 (manifest-driven `<picture>`)
**Supersedes**: `docs/proposals/0003-raw-source-picture.md`

## Context

ADR-0006 закрыл broken-AVIF через manifest gating. Но JSON-контракт всё ещё перечислял ключи руками: `image: { horizontal: { 400, 800, 1600, raw }, vertical: { 400, 800, 1600, raw } }`. Контент-владелец должен был знать структуру output'а (`{key}/X.webp`), какие ключи существуют, что добавлять при изменении `config/image-sizes.json`.

Параллельно — раскладка source-файлов **смешанная** в разных deployment'ах: где-то `raw/` подпапки, где-то direct-files рядом с `400/`/`800/`. Source-of-truth для контент-владельца неоднозначен.

## Decision

**Two changes:**

### Часть А — convention: все источники для `<picture>` в `data/img/<section>/raw/`

Растровые источники, которые нуждаются в multi-key generation, лежат только в подпапке `raw/`.

Критерии переноса в `raw/`:
- Расширения: `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`
- Минимальная ширина ≥ 400px (минимальный ключ из `config/image-sizes.json`)
- НЕ direct-cited из JSON (см. ниже)

НЕ переносим:
- SVG (вектор)
- Растровые < 400px (мелкие иконки, single-use)
- Файлы с direct `<img src>` ссылкой в JSON (для шаблонов, не использующих `picture.twig`)

### Часть Б — JSON-контракт: один путь к raw

**Основной случай — single raw-path:**
```json
"image": "data/img/content/raw/about.webp"
```

**Опциональный — отдельные ракурсы для mobile/desktop:**
```json
"image": {
  "horizontal": "data/img/intro/raw/desk-lemons.webp",
  "vertical":   "data/img/intro/raw/mob-lemons.webp"
}
```

Ключи `400/800/1280/1600/1920/2560` из контента уходят. `picture.twig` сам подсасывает их из `assets/img/build/image-dimensions.json` через `image_variants()`.

### DataExtension API

```php
public function imageVariants(string $rawPath): array
// Возвращает: ['400' => ['webp' => '...', 'avif' => '...'|null], '800' => null, ...]
```

- Strip `data/img/`, strip `/raw/`, strip extension → pattern `parent/basename`
- Lookup в manifest для каждого `KEY` из `config/image-sizes.json::keys`
- Только downscale: возвращает entries для существующих keys, `null` для skip-upscale
- Если путь без `/raw/` сегмента → `[]` (контракт нарушен)
- Если manifest отсутствует → `[]` (build:images не запускался)

### picture.twig

Новые ветки в начале:
1. `image is iterable == false and image` → string raw-path (single)
2. `image.horizontal is iterable == false or image.vertical is iterable == false` → object с raw-strings (multi-orientation)

Legacy ветки (объекты с числовыми ключами, `image.src`, raw/800/1600) сохраняются под комментарием LEGACY на время миграции. Удалятся финальным sync после полной раскатки на все deployment'ы.

## Миграция

Атомарно через два скрипта:

### `tools/migrate/sources-to-raw.js`

1. Pre-scan JSON: собирает все direct-cited paths (`"src": "data/img/..."`) — их не трогаем.
2. Найти папки в `data/img/<section>/` с adaptive-подпапками `{400,800,...}`.
3. Direct-files (не в подпапках) с ext `jpg|jpeg|png|webp|avif`, шириной ≥ 400px, не direct-cited → MOVE в `raw/`.
4. `--dry-run` для предпросмотра.
5. После — `npm run build:images` пересоздаёт `{key}/*`.

### `tools/migrate/json-to-raw-paths.js`

1. Проходит `data/json/**/*.json`.
2. Находит multi-key image объекты (`{horizontal: {400, raw, ...}, vertical: {...}}`).
3. Извлекает `raw` поле или вычисляет из любого ключа (`X/800/Y.webp` → `X/raw/Y.<ext>`), проверяет существование на диске.
4. Переписывает на новый формат `{horizontal: "raw-path", vertical: "raw-path"}`.

### Порядок rollout

1. Baseline commit (DataExtension, picture.twig, scripts, tests, ADR).
2. На каждом deployment по очереди (italy → kumho → beepitron):
   - `node tools/migrate/sources-to-raw.js --dry-run` → apply
   - `npm run build:images`
   - `node tools/migrate/json-to-raw-paths.js --dry-run` → apply
   - Verify: `php -S localhost:8081 -t public`, curl главной, grep `<source>` теги
   - Commit + push
3. **Verify обязателен после каждого deployment** перед следующим (см. memory `feedback-verify-before-sync`).
4. После полной раскатки — финальный sync убирает legacy-ветки `picture.twig`.

## Consequences

### Положительные

- Контент-владелец указывает только raw-path. Не знает структуру output'а.
- Broken-references класс закрыт в корне: если файла нет в raw/, JSON указывает на disk-existing source (line of defense проверяется `json-to-raw-paths.js`).
- Mobile UX improvements: где raw vertical меньше 800px, в `<picture>` теперь корректно эмитятся **только 400-варианты** vertical-source. До этого — broken AVIF (proposal 0001) или fallback на desktop-scaled (после ADR-0006).
- JSON-контент в 2-5 раз короче для intro-style секций (один путь вместо объекта с 6 ключами).
- Расширение под новые форматы (JXL) или новые ключи (3840 4K) — без правок JSON-контента.

### Отрицательные

- **Breaking change контракта.** Миграция через скрипт, обкатана на italy.
- `picture.twig` несёт legacy-ветки на время миграции — финальная чистка отдельным sync.
- Twig 3 не имеет `is string` test → используется `is iterable == false and image`. Зафиксировано в коде.
- Direct-cited files (`cover.src` в карточках, owners-фото) **не мигрируются** в raw/ — они остаются как `<img src>`. Это compromise: эти шаблоны не используют `picture.twig`. В follow-up — мигрировать секции (navigation, owners cards) на `picture.twig` тоже.

### Решения, оставленные на потом

- **`tools/build/check-image-references.js`** — линтер orphan paths (raw-files не существуют, JSON-references устарели).
- **`tools/build/images-plan.js`** — отчёт «что будет сгенерировано» перед билдом.
- **Перенос card-cover секций на picture.twig** — navigation, owners, news-card, dealer-card. Тогда **все** растровые источники ≥ 400px переедут в raw/.
- **Финальная чистка legacy-веток** `picture.twig` после полной раскатки.

## References

- Reference verify: `italycommunity.ru` ветка `sync/baseline-2026-05-20`, intro-секция — `mob-*` теперь корректно эмитятся с 400-ключом, `desk-*` с 6 ключами.
- Proposal `docs/proposals/0003-raw-source-picture.md` (удалён после merge).
- Session log: `docs/sessions/2026-05-22-raw-source-picture.md`.
