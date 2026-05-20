# Правила организации и нейминга CSS в проекте

Соглашения по структуре файлов, порядку импортов, именованию селекторов и использованию переменных. Дополняет [html-rules.md](html-rules.md) в части классов и уровней структуры.

---

## 1. Структура каталогов и файлов

CSS собирается в один бандл из `assets/css/main.css`. Импорты разбиты по слоям:

| Каталог         | Назначение                                                                                         | Примеры файлов                                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **base/**       | Переменные, сброс, типографика, сетка, базовые компоненты (link, button), утилиты, анимации, медиа | `variables.css`, `general.css`, `typography.css`, `grid.css`, `links.css`, `buttons.css`, `helpers.css`, `animations.css`, `mq.css`, `fonts.css` |
| **sections/**   | Стили секций страницы (шапка, подвал, intro, контентные блоки)                                     | `header.css`, `footer.css`, `intro.css`, `content.css`, `restaurants.css`, `logoline.css`                                                        |
| **components/** | Переиспользуемые блоки (карточки, формы, аккордеон, слайдер)                                       | `card-restaurant.css`, `form-callback.css`, `accordion.css`, `heading.css`, `custom-checkbox.css`                                                |
| **pages/**      | Стили, специфичные для конкретной страницы                                                         | `index.css`, `contacts.css`, `restaurants.css`, `404.css`                                                                                        |

**Правило:** один блок (секция или компонент) — один файл. Имя файла совпадает с именем блока в kebab-case: блок `.card-restaurant` → `components/card-restaurant.css`.

---

## 2. Порядок импортов (каскад)

Порядок в `main.css` задаёт каскад: что импортировано позже — перекрывает при равной специфичности.

1. **Base** — фундамент:
   - `variables.css` — переменные (цвета, шрифты, переходы, z-index).
   - `fonts.css` — подключение шрифтов.
   - `general.css` — reset (box-sizing, сброс отступов/display для элементов, body, scrollbar).
   - `typography.css` — размер шрифта корня, стили body/заголовков, утилиты `.h1`–`.h6`, `.weight-*`, `.font-1`, `.text-*`, `.desc`, `.longread`.
   - `grid.css` — контейнеры (`.container`, `.container-sm`, `.container-md`, `.container-left`, `.section`).
   - `links.css` — базовый `.link`, модификаторы, override для `.button.link`.
   - `buttons.css` — базовый `.button`, размеры, цвета, анимации.
   - `helpers.css` — утилиты (цвета, opacity, размеры, выравнивание, `.img-responsive`, `.hidden` и т.д.).
   - `animations.css` — ключевые кадры (`@keyframes`).
   - `mq.css` — кастомные медиа-запросы (`@custom-media`).

2. **Sections** — секции в логическом порядке (header, footer, контентные блоки).

3. **Components** — компоненты (порядок по зависимостям или алфавиту).

4. **Pages** — страничные переопределения.

При добавлении нового файла сохранять этот порядок; base не должен зависеть от sections/components/pages.

---

## 3. Базовый слой (base)

### Разделение ответственности

| Файл               | Содержит                                                                                                                                                                                         | Не содержит                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| **general.css**    | Reset: box-sizing, сброс display/margin/padding для элементов (в т.ч. h1–h6), body (layout, цвет, фон), scrollbar, direction                                                                     | Шрифты, размеры текста, цвета типографики                 |
| **typography.css** | Размер корня (`html`), наследование `font-size` (`*`), шрифт body/полей ввода, заголовки (только font-weight, line-height), `.h1`–`.h6`, `.weight-*`, `.font-1`, `.text-*`, `.desc`, `.longread` | Reset display/margin для элементов (это в general)        |
| **grid.css**       | Контейнеры, секция `.section`                                                                                                                                                                    | Контент внутри секций                                     |
| **links.css**      | Базовый `.link`, модификаторы `.link.inline`, `.link.underline`, `.link.disabled`, override для `.button.link`                                                                                   | Цвета ссылок (используются утилиты `.color-*` из helpers) |
| **buttons.css**    | Базовый `.button`, размеры (sm/md/lg), формы (circle, rounded), цвета (bg/outline), анимации кнопок                                                                                              | Стили секций и карточек                                   |
| **helpers.css**    | Утилиты: `.color-*`, `.bg-color-*`, opacity, размеры, выравнивание, `.img-responsive`, `.hidden`, `.custom-checkbox` вынесен в components                                                        | Стили блоков с именем (те в sections/components)          |

### Ссылка и кнопка вместе

Элемент может иметь оба класса: `class="button button-sm outline-color-2 link"`. Чтобы не было конфликта:

- У `.link` — только `transition: opacity` и hover/active по opacity.
- В `links.css` задаётся override: `.button.link`, `.button.link:hover`, `.button.link:active` с `opacity: 1` и transition кнопки (background, border-color, color).

В результате кнопка-ссылка ведёт себя как кнопка, а не как текстовая ссылка.

---

## 4. Нейминг в CSS

Соответствует [html-rules.md](html-rules.md): BEM-подобная схема, kebab-case, уровни section/component.

### Селекторы

- **Блок:** один класс, без тега (например, `.card-restaurant`, `.form-callback`).
- **Элемент:** `.block__element` (два подчёркивания). Внутри компонента не использовать элементы другого блока.
- **Модификатор размера:** отдельный класс `block-size` (например, `.button-sm`, `.container-md`). В CSS при необходимости составной селектор: `.button.button-sm`.
- **Состояние:** отдельный класс на том же элементе; в CSS — составной селектор: `.header.active`, `.accordion__item.active`.
- **Утилиты:** отдельные классы (`.color-2`, `.weight-600`, `.uppercase`), в разметке комбинируются с блоком.
- **Внутри файла компонента:** элементы пишем коротко (`.card-action__item`, `.card-action__title`), не дублируя блок (`.card-action .card-action__item`). Селекторы с родительскими секциями/страницами (`.actions`, `.section__*`, `.page-*`) в `components/*.css` не используем.

### Размеры (t-shirt)

Единая шкала **xs → sm → md → lg → xl** для контейнеров, кнопок, текста, иконок:

- Контейнеры: `container`, `container-sm`, `container-md`, `container-full`; `container-left`, `container-left.offset`.
- Кнопки: `button-sm`, `button-md`, `button-lg`.
- Текст: `.h1`–`.h6`, `text-md`, `text-lg`, `desc`, `longread`.

Имена по шаблону **`{блок}-{размер}`** (дефис), без смешения с другими схемами.

### Единицы измерения

- **Размеры (layout):** `rem` — отступы, ширина, высота, padding, margin, border-width, gap и т.п.
- **Размеры текста:** `em` — font-size, чтобы текст масштабировался относительно контекста (родителя или корня).

Исключения: безразмерные значения (0, 1 для opacity/scale), проценты и переменные там, где это уместно.

### Цвета в CSS

- В стилях использовать переменные: `var(--color-1)`, `var(--color-2)` и т.д., не хардкод hex в компонентах.
- Утилиты для разметки: `.color-1` … `.color-6`, `.bg-color-1` … `.bg-color-7` (в `helpers.css`). Для кнопок — `.button.outline-color-*`, `.button.bg-color-*`.

### !important

Без острой необходимости `!important` не использовать. Сначала решать за счёт специфичности селекторов и порядка правил.

**Допустимо только в случаях:**

- **Утилита принудительного скрытия** (например `.hidden`) — чтобы перебить любые контекстные `display`.
- **Доступность:** переопределение анимаций и переходов в `@media (prefers-reduced-motion: reduce)` — нужно гарантированно отключить движение.
- **Переопределение стилей сторонних библиотек** (Swiper, GLightbox и т.п.), когда у библиотеки инлайн-стили или высокая специфичность и без `!important` перебить нельзя.

В таких местах в коде оставлять краткий комментарий, зачем нужен `!important`.

---

## 5. Переменные (Custom Properties)

Определяются в `base/variables.css` в `:root`.

| Группа    | Переменные                                                                                   | Назначение                                                                              |
| --------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Цвета     | `--color-1` … `--color-7`                                                                    | Базовые (1–2) и фирменные (3–7): фон, текст, акценты                                    |
| Служебные | `--color-error`, `--color-success`, `--color-placeholder`, `--color-muted`, `--color-border` | Ошибки, статусы, подписи к полям, приглушённый текст, нейтральные границы               |
| Градиенты | `--gradient-1`, `--gradient-2`, `--gradient-3`                                               | Готовые градиенты                                                                       |
| Шрифты    | `--font-1`, `--font-1-extended`                                                              | Основное и расширенное семейство; начертание — через `font-weight` и классы `.weight-*` |
| Переходы  | `--transition-1`, `--transition-2`, `--transition-3`                                         | Длительность/easing для анимаций и hover                                                |
| Z-index   | `--z-index-1` … `--z-index-10`                                                               | Слои (убывающие значения)                                                               |

В новых стилях использовать эти переменные; при добавлении значений (например, цветов) расширять переменные в `variables.css`, при необходимости добавлять утилиты в `helpers.css`.

---

## 6. Медиа-запросы (Custom Media)

Файл `base/mq.css`. В стилях использовать только эти имена, не «голые» пиксели:

| Имя     | Условие           |
| ------- | ----------------- |
| `--xs`  | max-width: 539px  |
| `--xm`  | min-width: 540px  |
| `--sm`  | min-width: 768px  |
| `--md`  | min-width: 992px  |
| `--lg`  | min-width: 1200px |
| `--xl`  | min-width: 1441px |
| `--xxl` | min-width: 1601px |

Пример: `@media (--lg) { ... }`.

---

## 7. Анимации

- **Ключевые кадры** в `base/animations.css`. Имена в **kebab-case**: `fadein`, `fadeout`, `fly`, `left-to-right`, `top-to-down`, `scale` и т.д.
- Длительности и easing — через переменные `--transition-1`, `--transition-2`, `--transition-3`.
- Анимации кнопок/ссылок задаются модификаторами (например, `.button-animated`, классы вида `.animation-*`) в соответствующих base- или component-файлах.

---

## 8. Файловая структура (сводка)

```
assets/css/
  main.css              # Точка входа, порядок импортов
  base/
    variables.css       # :root переменные
    fonts.css           # @font-face
    general.css         # Reset
    typography.css      # Шрифты, размеры текста, утилиты типографики
    grid.css            # Контейнеры, .section
    links.css           # .link и модификаторы
    buttons.css         # .button и модификаторы
    helpers.css         # Утилиты
    animations.css     # @keyframes
    mq.css              # @custom-media
  sections/             # Один файл — одна секция
  components/           # Один файл — один компонент
  pages/                # Стили страниц
```

---

## 9. Секции и компоненты (контекст)

- **Файл секции (`sections/*.css`)**:
  - описывает отступы секции, фон, расположение внутренней сетки;
  - задаёт размеры и расположение контейнеров для компонентов (например, `.actions .section__inner.card-action-wrap { width: 100%; }`);
  - не задаёт стили внутренним элементам компонентов по их BEM-классам.
- **Файл компонента (`components/*.css`)**:
  - содержит все правила внешнего вида и поведения блока (`.card-action`, `.card-action__item`, `.card-action__title`, `.card-action__desc` и т.п.), включая медиа (`@media (--lg)` и другие custom media);
  - не использует селекторы с родительскими секциями/страницами (`.actions`, `.section__*`, `.page-*` и др.);
  - по умолчанию не содержит контекстных override'ов под конкретную секцию; если нужен особый вариант, это делается через модификатор компонента или отдельный компонент.

## Краткая шпаргалка

| Сущность                | Где / как                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| Переменные              | Только в `base/variables.css`, использование через `var(--name)`                                   |
| Медиа                   | Только имена из `base/mq.css`: `@media (--lg)`                                                     |
| Reset                   | `general.css`; типографика и шрифты — `typography.css`                                             |
| Контейнеры              | `grid.css`: `container`, `container-sm`, `container-md`, `container-left`, `container-left.offset` |
| Ссылка                  | `links.css`: `.link`, `.link.inline`, `.link.underline`, `.link.disabled`; цвет — `.color-*`       |
| Кнопка                  | `buttons.css`: `.button`, размеры `button-sm/md/lg`, цвета `.outline-color-*`, `.bg-color-*`       |
| Утилиты                 | `helpers.css`: цвета, opacity, выравнивание, скрытие, изображения                                  |
| Блок (секция/компонент) | Отдельный файл в `sections/` или `components/`, селекторы по BEM                                   |
| Состояние               | Класс на том же элементе, в CSS — `.block.state`                                                   |
| Keyframes               | `animations.css`, имена в kebab-case                                                               |
| !important              | Только: утилита скрытия, prefers-reduced-motion, переопределение библиотек; в коде — комментарий   |

---

## См. также

- [html-rules.md](html-rules.md) — классы, id, data-атрибуты, контент
- [js-rules.md](js-rules.md) — JavaScript и селекторы js-\*
- [twig-rules.md](twig-rules.md) — шаблоны и данные
- [json-rules.md](json-rules.md) — структура данных страниц и global
