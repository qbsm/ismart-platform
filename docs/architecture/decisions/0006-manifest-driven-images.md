# ADR-0006: Manifest-driven `<picture>` (image_has)

**Status**: Accepted
**Date**: 2026-05-22
**Supersedes**: `docs/proposals/0001-manifest-driven-images.md`

## Context

`templates/components/picture.twig` эмитил `<source type="image/avif">`, механически заменяя `.webp` → `.avif` в каждом пути из JSON, **без проверки существования файла**.

`tools/build/build-images.js` не апскейлит (`build-images.js:93-95`):
```js
if (targetW != null && targetW > 0 && origW > 0 && origW < targetW) {
  continue;
}
```

Если ширина `raw/foo.webp` меньше целевого ключа — `{key}/foo.webp` и `{key}/foo.avif` не генерируются. JSON же декларирует ключи (`"800"`, `"1600"`, …) статически. После билда часть ключей становится «висячей».

По HTML-спеке `<picture>` выбирает первый `<source>`, чей `type` он поддерживает, и **не делает fallback на следующий `<source>` при 404 на srcset**. Все современные браузеры поддерживают AVIF → коммитятся на него → пустая картинка.

**Воспроизведение (italycommunity.ru, commit `4b94e91`):**
```
intro/raw/mob-lemons.webp — 780×1368  (источник)
intro/400/mob-lemons.{webp,avif}      ✓  сгенерены
intro/800/mob-lemons.webp             ✓  stale, копия 780×1368
intro/800/mob-lemons.avif             ✗  skip-upscale (800 > 780)
intro/1600/mob-lemons.{webp,avif}    ✗  skip-upscale
```
JSON-секция intro для `vertical` ссылается на `800` и `1600`, шаблон эмитит `<source type="image/avif">` под эти ключи → 404 → пустые обложки на мобильных.

**Сопутствующая проблема CLS.** `DataExtension::getImageDimensions()` нормализовал путь только из формы `data/img/foo` → `foo`. После `JsonProcessor::processJsonPaths` пути в шаблоне абсолютные (`https://host/data/img/foo`). Regex `^data/img/` не срабатывал → `null` → `width`/`height` не выставлялись → CLS.

## Decision

Манифест `assets/img/build/image-dimensions.json` уже перезаписывается с нуля при каждом `npm run build:images` и содержит запись для каждого реально сгенерированного `.webp` и `.avif`. Используем его как source of truth для шаблона.

**Принципы:**
1. **Build-time manifest** уже есть — не строим ещё одну машинерию.
2. **Template-time gating** — `<source>` или srcset item появляется только если файл присутствует в манифесте.
3. **Graceful degradation на свежем клоне** — если манифест отсутствует на диске (репо клонирован, `build:images` ещё не запускался), `image_has()` возвращает `true` → шаблон ведёт себя как до введения гейтинга. После первого `build:images` гейтинг начинает работать.
4. **CLS-safe** — `image_dimensions()` чинится попутно: общая нормализация пути ловит абсолютные URL.
5. **Ноль I/O в макросах** — `file_exists()` не используется; всё через cached manifest lookup.

### Реализация

`src/Twig/DataExtension.php`:
```php
public function imageHas(string $path): bool
{
    $key = $this->normalizeManifestKey($path);
    if ($key === '') {
        return false;
    }
    $this->loadImageDimensionsManifest();
    if (!$this->imageManifestExists) {
        return true; // graceful fallback
    }
    return isset($this->imageDimensionsManifest[$key]);
}

private function normalizeManifestKey(string $path): string
{
    $path = str_replace('\\', '/', $path);
    $path = preg_replace('#^https?://[^/]+/#', '', $path) ?? $path;
    $path = ltrim($path, '/');
    return preg_replace('#^data/img/#', '', $path) ?? $path;
}
```

Принимает любую форму:
- `data/img/intro/800/foo.webp`
- `/data/img/intro/800/foo.webp`
- `https://host/data/img/intro/800/foo.webp`
- `https://cdn.example.com/data/img/intro/800/foo.webp` (deployment с CDN-prefix)
- `intro/800/foo.webp`

→ единый ключ `intro/800/foo.webp`.

`templates/components/picture.twig` — гейтинг через `image_has()` в 3 макросах: `build_srcset`, `build_avif_srcset`, `find_fallback`. Существующие `{% if vAvifSrcset|trim %}` / `{% if srcset|trim %}` сворачивают пустой `<source>` сами.

## Consequences

### Положительные

- Broken-AVIF класс закрыт. При skip-upscale → `<source type="image/avif">` не эмитится → браузер выбирает WebP-source → картинка отображается.
- Stale-файлы на диске не сервируются: если `intro/800/foo.webp` существует физически, но build удалил/пропустил, в манифесте его нет → шаблон тоже его не отдаёт.
- CLS-fix: `image_dimensions()` теперь работает для абсолютных URL → `width`/`height` ставятся на hero-секциях.
- Готовая база под расширение: новые форматы (JXL, новые ключи размеров), deployment-CDN — без правок JSON-контента.
- Стандартный подход (11ty Image, Astro `<Image>`, Next.js `next/image`).

### Отрицательные

- **`build:images` становится обязательным шагом** перед коммитом данных. Новая картинка в JSON без билда → не попадёт в манифест → шаблон её не отдаст. Зафиксировано в `docs/architecture/images.md` и `docs/guides/deploy-checklist.md`.
- Graceful fallback на «нет манифеста → emit как раньше» — компромисс: ускоряет dev-experience (свежий клон работает без `build:images`), но скрывает реальные ошибки если кто-то долго работает без билда. Считаем приемлемым: после первого `build:images` режим переключается, и дальше система ловит broken paths.
- Один лишний ключ в Twig-функциях: `image_has`. Не существенно.

### Решения, оставленные на потом

- **`tools/build/check-image-references.js`** — линтер: пройти `data/json/**/*.json`, собрать пути `data/img/...`, сверить с манифестом, печатать orphan-references. Добавить в `npm run lint`.
- **`tools/build/clean-assets.js`** — перед `build:images` удалять `data/img/**/{400,800,1280,1600,1920,2560}/*`, синхронизирует диск с манифестом.
- **`build-images.js`** — при skip-upscale печатать WARN с путём (сейчас молча).
- **Source-size policy** — гайд: `raw/*.webp` ≥ максимального ключа из `config/image-sizes.json`.
- **`picture.twig` в core.** Формально шаблон per-project, но фактически идентичен во всех 4 deployment'ах — стоит зафиксировать как core при следующей итерации.

## References

- Proposal: `docs/proposals/0001-manifest-driven-images.md` (удалён после merge)
- Reference воспроизведение: `italycommunity.ru` ветка `sync/baseline-2026-05-20`, commit `4b94e91` (intro mob-lemons)
- Session log: `docs/sessions/2026-05-22-manifest-driven-images.md`
- Связанные роли: `docs/architecture/images.md`, `tools/build/build-images.js`
