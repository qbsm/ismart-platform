# Fallback для галереи на мобильных устройствах

## Проблема
На мобильных устройствах некоторые проекты не имеют вертикальных версий изображений в галерее (`vertical` массив пустой), что приводило к отсутствию изображений на мобильных устройствах.

## Решение
Добавлена логика fallback: если на мобильном устройстве отсутствуют вертикальные версии изображений, система автоматически показывает горизонтальные версии.

## Техническая реализация

### 1. Обновлен шаблон `templates/sections/gallery.twig`

#### Логика для обложек:
```twig
<!-- Проверяем есть ли вертикальные изображения -->
{% set has_vertical_covers = false %}
{% if has_vertical %}
  {% for item in project.gallery[0].vertical %}
    {% if item.cover is defined and item.cover %}
      {% set has_vertical_covers = true %}
    {% endif %}
  {% endfor %}
{% endif %}

<!-- Если нет вертикальных обложек, показываем горизонтальные для мобильных -->
{% if not has_vertical_covers and has_horizontal %}
  {% for item in project.gallery[0].horizontal %}
    {% if item.cover is defined and item.cover %}
      <a href="{{ url(item.src) }}" ... data-orientation="mobile-fallback">
        <!-- HTML структура -->
      </a>
    {% endif %}
  {% endfor %}
{% endif %}
```

#### Логика для миниатюр:
```twig
<!-- Аналогично для миниатюр -->
{% set has_vertical_thumbs = false %}
<!-- Проверка и fallback для thumbs -->
```

### 2. Обновлен CSS `assets/css/sections/gallery.css`

```css
/* На мобильных устройствах */
@media (--xs), (max-width: 991px) {
  /* Показываем mobile-fallback элементы (горизонтальные для мобильных) */
  [data-orientation="mobile-fallback"] {
    display: block !important;
  }
}

/* На десктопных устройствах */
@media (--md) {
  /* Скрываем mobile-fallback элементы на десктопе */
  [data-orientation="mobile-fallback"] {
    display: none !important;
  }
}
```

### 3. Обновлен шаблон `templates/sections/intro.twig`

```twig
{% if horizontal_items|length > 0 %}
  {% if vertical_items|length > 0 %}
    {% set slider_items = horizontal_items|merge(slider_items) %}
  {% else %}
    <!-- Если нет вертикальных изображений, используем горизонтальные -->
    {% set slider_items = horizontal_items|merge([{
      'cover': horizontal_items[0].cover,
      'alt': horizontal_items[0].alt,
      'type': 'mobile-fallback'
    }]) %}
  {% endif %}
{% endif %}
```

## Атрибуты data-orientation

| Значение | Описание | Показывается |
|----------|----------|--------------|
| `horizontal` | Горизонтальные изображения | Только на десктопе, когда есть vertical |
| `vertical` | Вертикальные изображения | Только на мобильных, когда есть horizontal |
| `universal` | Универсальные изображения | На всех устройствах, когда нет адаптивной пары |

## Примеры проектов

### С вертикальными изображениями
- `chainyi-dom` - имеет и horizontal, и vertical
- Результат: на мобильных показываются vertical, на десктопе horizontal

### Без вертикальных изображений  
- `taloni` - имеет только horizontal, vertical = []
- Результат: на всех устройствах показываются horizontal с `data-orientation="universal"`

## Преимущества

1. **Отсутствие пустых галерей** - всегда есть изображения для показа
2. **Адаптивность** - правильное отображение на всех устройствах
3. **Обратная совместимость** - старые проекты продолжают работать
4. **Градуальный переход** - можно постепенно добавлять vertical версии

## Как добавить вертикальные версии

1. Создать папку `data/img/[project]/vertical/raw/`
2. Добавить вертикальные версии изображений
3. Обновить JSON файл проекта:

```json
{
  "gallery": [
    {
      "horizontal": [...],
      "vertical": [
        {
          "src": "data/img/project/vertical/raw/1.webp",
          "alt": "Project name",
          "cover": true
        },
        ...
      ]
    }
  ]
}
```

## Мониторинг

Можно отслеживать какие проекты используют universal режим через поиск:
```bash
grep -r "universal" templates/
```

Или через dev tools браузера, ища элементы с `data-orientation="universal"`. 