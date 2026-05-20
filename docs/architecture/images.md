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
