# Изображения — эталонная структура

## Каталог данных

Изображения лежат в `data/img/` (доступ через симлинк `public/data`).

```
data/img/
├── ui/              # Интерфейс: иконки, кнопки, логотипы
├── favicons/        # Фавиконки и манифест
├── restaurants/     # Логотипы и иконки ресторанов (по slug)
├── us/              # Медиа для секции «О нас»
└── ...              # Остальные подкаталоги по контенту (intro, content, seo и т.д.)
```

- Форматы: WebP для контента, SVG для иконок/логотипов где уместно.
- Пути в JSON задаются относительно корня сайта, например: `data/img/ui/bg1.webp`.

## Компонент picture.twig

Используется для адаптивных изображений с WebP и `srcset`/`sizes`.

- Параметры: `image`, `alt`, `class`, `sizes_preset` (full, half, quarter, …), `loading` (lazy/eager).
- Поддержка формата horizontal/vertical для разных брейкпоинтов.
- По умолчанию `loading="lazy"`.

Пример в секции:

```twig
{% include 'components/picture.twig' with {
  image: item.cover,
  alt: item.alt|default(''),
  sizes_preset: 'half',
  loading: 'lazy'
} %}
```

## Сборка

- Оптимизация/ресайз изображений при сборке — в плане (см. README, раздел «Производительность и кэширование»).
- Сборка WebP и манифест размеров: `npm run build:images` (tools/build/build-images.js).

## Manifest-driven контракт (ADR-0006)

`assets/img/build/image-dimensions.json` — **источник правды** для шаблона. Перезаписывается с нуля при каждом `npm run build:images` и содержит запись для каждого реально сгенерированного `.webp` и `.avif` файла.

`picture.twig` эмитит `<source>` и srcset items **только** для путей, присутствующих в манифесте. Защита от broken-AVIF при skip-upscale в build-images (raw меньше целевого ключа → файл не генерируется → JSON ссылается в пустоту → 404).

**Twig-функции** (`src/Twig/DataExtension.php`):
- `image_has(path)` → `bool` — есть ли путь в манифесте. Используется в `picture.twig` для гейтинга.
- `image_dimensions(path)` → `{width, height}|null` — размеры для атрибутов `<img width height>` (CLS-safe).

Обе функции нормализуют любую форму пути:
```
data/img/intro/800/foo.webp
/data/img/intro/800/foo.webp
https://host/data/img/intro/800/foo.webp     ← после JsonProcessor::processJsonPaths
intro/800/foo.webp
```
→ единый manifest-ключ `intro/800/foo.webp`.

**Graceful fallback на свежем клоне.** Если `image-dimensions.json` не существует (репо клонирован, `build:images` ещё не запускался), `image_has()` возвращает `true` для любого непустого пути — шаблон ведёт себя как до введения гейтинга, эмитит всё, что в JSON. После первого `npm run build:images` гейтинг начинает работать.

**Обязанность build:images перед коммитом данных.** Когда добавляется новая картинка в JSON или новый файл в `data/img/raw/` — `npm run build:images` нужно прогнать, иначе на проде путь не попадёт в манифест и шаблон не отдаст его в `<picture>`. Зафиксировано в `docs/guides/deploy-checklist.md`.

### Edge cases

| Случай | Поведение |
|---|---|
| AVIF не сгенерён (skip-upscale), WebP есть | Эмитим только `<source type="image/webp">` + `<img>` |
| WebP-ключ 800 пропущен (raw < 800), 400 есть | В webp-srcset остаётся только 400; AVIF аналогично |
| JSON ссылается на удалённый файл | Путь не попадает в srcset; `<picture>` валиден за счёт минимального оставшегося |
| Манифест отсутствует (свежий клон без build) | `image_has` всегда `true` → шаблон эмитит всё (текущее поведение) |
| Абсолютные URL после `JsonProcessor::processJsonPaths` | Нормализуются через `^https?://[^/]+/` префикс |
| Stale `intro/800/*.webp` на диске, в манифесте записи нет | `image_has` → `false` → файл не попадает в srcset |

См. ADR-0006 для контекста и trade-offs.
