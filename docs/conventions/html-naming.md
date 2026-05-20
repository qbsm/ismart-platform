# Правила нейминга HTML в проекте

Основные соглашения по именованию классов, идентификаторов и атрибутов в шаблонах и CSS.

---

## 1. CSS-классы (BEM-подобная схема)

### Уровни структуры: страница, секция, блок/компонент

В разметке явно выделяем три уровня:

| Уровень              | Назначение                                                                     | Примеры классов                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Страница**         | Контейнер страницы, общие обёртки страницы                                     | классы страницы в `pages/*.css`, например `.contacts`, `.restaurants`                                                                                                    |
| **Секция**           | Крупные блоки страницы (шапка, подвал, intro, контентный блок)                 | общий блок `section`, элементы `section__item`, `section__subitem`, `section__inner`, `section__add`; секции могут иметь собственное имя: `.header`, `.intro`, `.footer` |
| **Блок / компонент** | Повторяемые или изолированные части внутри секции (карточка, форма, аккордеон) | блок по имени компонента, например `card-general`, `form-callback`; элементы `{component}__item`, `{component}__subitem` и т.д.                                          |

Иерархия вложенности (item → subitem → inner → add) применяется **внутри** уровня секции и **внутри** уровня блока/компонента. При необходимости большей глубины в секцию вставляется компонент — у него своя такая же цепочка.

### Блок (Block)

- Один или два слова через **дефис**, в нижнем регистре.
- Имя блока = компонент или секция.
- Примеры: `form-callback`, `burger-icon`, `card-general`, `cookie-panel`, `mini-table`, `accordion`, `intro`, `header`, `footer`.

### Элемент (Element)

- **Блок + `__` + имя элемента** (два подчёркивания).
- Имя элемента — одно или несколько слов через дефис.
- **В компоненте** нейминг строго **`component__element`**: имя компонента (kebab-case) + `__` + имя элемента. Все элементы компонента принадлежат только ему: `form-callback__container`, `form-callback__item`, `accordion__title`, `accordion__desc`, `burger-icon__item`, `card__title`, `card__desc`.
- В секциях — общий блок `section`, элементы `section__item`, `section__subitem`, `section__inner`, `section__add` (см. «Иерархия вложенности» ниже).
- Примеры: `form-callback__container`, `form-callback__item`, `burger-icon__item`, `card__item`, `section__item`, `section__subitem`, `section__inner`, `section__add`.

### Модификаторы и утилиты

- Отдельные классы без `__`: модификаторы вида `button-sm`, `outline-color-2`, `header-logo-visible`.
- **Состояние (state)** задаётся отдельным классом на том же элементе: сначала блок/секция, затем состояние. В разметке: `class="header active"`; в CSS селектор: **`.header.active`**. Класс состояния (например, `active`, `open`, `visible`) добавляется/снимается скриптом или по условию в шаблоне.
- **Утилиты цветов**: `.color-{N}` (цвет текста), `.bg-color-{N}` (фон).
- **Утилиты типографики**: `.h1` — `.h6` (визуальный стиль заголовка), `uppercase`, `font-1`, `weight-500`.
- Прочие утилиты: `link`, `img-responsive`, `hidden`, `opacity-60` — из `base/helpers.css` и `base/typography.css`.

### Обёртки (wrap) и сочетание с элементами

- Классы-обёртки для сетки/раскладки заканчиваются на **`-wrap`**.
- Примеры: `logo-wrap`, `title-wrap`, `icon-wrap`, `button-wrap`, `card-general-wrap`, `heading-wrap`, `slide-wrap`.
- **Элемент иерархии задаётся первым, роль ячейки — вторым.** На один узел вешаются оба класса: уровень вложенности (`section__item`, `section__subitem` и т.д.) и обёртка (`*-wrap`) или другой смысловой класс.
- Примеры разметки: `section__item logo-wrap`, `section__subitem card-general-wrap`, `section__item heading-wrap`, `section__item button-wrap`.

### Основные слова для контента

Единый набор имён для заголовков, подписей и текста — в классах, обёртках (`*-wrap`) и в ключах JSON:

| Слово           | Назначение                                                                 | Примеры использования                                                                                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **heading**     | Главный заголовок блока/секции (часто с вложенным `title`)                 | `heading-wrap`, `data.heading`, компонент `heading.twig`, класс `heading`                                                                                                                                                                             |
| **headline**    | Крупная строка/слоган (промо, баннер) — визуально выделенная строка текста | `headline-wrap`, `headline-heading-wrap`, `data.headline`, класс `.headline`                                                                                                                                                                          |
| **subheading**  | Подзаголовок под основным заголовком секции                                | `data.subheading`, `subheading-wrap`                                                                                                                                                                                                                  |
| **subtitle**    | Подзаголовок карточки или блока (второстепенный заголовок)                 | в JSON: `item.subtitle`, `card_config.subtitle_field`                                                                                                                                                                                                 |
| **title**       | Название, заголовок элемента (карточки, кнопки, пункта, ссылки)            | `title-wrap`, `card__title`, `accordion__title`, в JSON: `item.title`, `heading.title`                                                                                                                                                                |
| **desc**        | Описание, поясняющий текст под заголовком                                  | `desc-wrap`, `card__desc`, `accordion__desc`, в JSON: `item.desc`, `item.desc.short`                                                                                                                                                                  |
| **name**        | Имя (страницы, секции, сайта, элемента списка)                             | в JSON: `pageData.name`, `section.name`, `site.name`                                                                                                                                                                                                  |
| **label**       | Подпись к полю или элементу (форма, список)                                | `form-callback__placeholder`, в JSON: `label`, `item.label`                                                                                                                                                                                           |
| **placeholder** | Плейсхолдер поля ввода                                                     | в JSON: `placeholder[lang_code].phone`                                                                                                                                                                                                                |
| **link**        | Ссылка (класс и семантика)                                                 | базовый класс `link`; модификаторы: `link.inline`, `link.underline`, `link.disabled`; цвет через утилиту `.color-*`, не `.link-color-*`. Кнопка-ссылка: `class="button ... link"` — конфликта нет (override в CSS). В JSON: `item.href`, `link.title` |
| **content**     | Обёртка основного контента блока                                           | `content-wrap`, в компонентах: `button__item.content-wrap`                                                                                                                                                                                            |

**Типовые обёртки (`*-wrap`)** — повторяющиеся роли ячеек: `heading-wrap`, `subheading-wrap`, `headline-wrap`, `title-wrap`, `desc-wrap`, `logo-wrap`, `icon-wrap`, `button-wrap`, `buttons-wrap`, `form-wrap`, `nav-wrap`, `empty-wrap` (пустая ячейка для сетки), `background-wrap`, `content-wrap`, `block-wrap`, `features-wrap`, `about-wrap`, `filter-wrap`, `slider-wrap`.

В разметке и данных используем эти имена последовательно: например, блок с заголовком секции — `heading` / `heading-wrap`, текст заголовка — `title`, крупный слоган — `headline`, текст под ним — `desc` или `subheading`.

### Иерархия вложенности (секции)

У секций и компонентов — **неограниченная** глубина вложенности. Первые 7 уровней имеют именованные суффиксы, далее используется `__leaf` с числовым индексом:

| Уровень | Суффикс     | Класс элемента     | Пример с обёрткой                       |
| ------- | ----------- | ------------------ | --------------------------------------- |
| 1       | `__item`    | `section__item`    | `section__item logo-wrap`               |
| 2       | `__subitem` | `section__subitem` | `section__subitem card-general-wrap`    |
| 3       | `__inner`   | `section__inner`   | `section__inner title-wrap`             |
| 4       | `__add`     | `section__add`     | `section__add button-wrap`              |
| 5       | `__nested`  | `section__nested`  | `section__nested icon-wrap`             |
| 6       | `__deep`    | `section__deep`    | `section__deep desc-wrap`               |
| 7       | `__extra`   | `section__extra`   | `section__extra form-wrap`              |
| 8+      | `__leaf-N`  | `section__leaf-1`  | `section__leaf-1`, `section__leaf-2`, … |

Для компонентов — та же схема (блок = имя компонента, например `card-general`):

| Уровень | Класс элемента                        |
| ------- | ------------------------------------- |
| 1       | `card-general__item`                  |
| 2       | `card-general__subitem`               |
| 3       | `card-general__inner`                 |
| 4       | `card-general__add`                   |
| 5       | `card-general__nested`                |
| 6       | `card-general__deep`                  |
| 7       | `card-general__extra`                 |
| 8+      | `card-general__leaf-1`, `__leaf-2`, … |

Для любого блока/компонента: **`__item`** → **`__subitem`** → **`__inner`** → **`__add`** → **`__nested`** → **`__deep`** → **`__extra`** → **`__leaf-1`** → **`__leaf-2`** → …

### Система размеров (t-shirt sizing)

Для контейнеров, кнопок, текста и иконок используется единая шкала размеров **xs → sm → md → lg → xl** (при необходимости добавляют **xxl**). Имена классов строятся по шаблону **`{блок}-{размер}`** или **`{блок}.{размер}`** (модификатор).

- **Контейнеры**: `container` (default/md по ширине), `container-sm` (узкий, longread), `container-md`, `container-full`; выравнивание: `container-left`, `container-left.offset` (только отступ слева без ограничения ширины).
- **Кнопки**: `button-sm`, `button-md`, `button-lg`.
- **Текст**: `text-md`, `text-lg`, классы `.h1`–`.h6` (визуальные размеры заголовков).
- **Иконки/обёртки**: `icon-sm`, `icon-sm-wrap` и т.п. по той же шкале.

Такой подход даёт консистентный нейминг и упрощает добавление новых размеров.

### Контейнеры

- **`container`** — основной контейнер (max-width по breakpoint, отступы).
- **`container-sm`** — узкий (longread, ~80rem).
- **`container-md`** — средний (99.2rem).
- **`container-full`** — на всю ширину.
- **`container-left`** — контейнер, прижатый к левому краю сетки; **`container-left.offset`** — только левый отступ под сетку, без ограничения ширины (см. `base/grid.css`).

### Файловая структура

- **Один блок = один файл**.
- Пример: блок `.card-general` → `assets/css/components/card-general.css`.
- Пример: секция `.intro` → `assets/css/sections/intro.css`.

---

## 2. Классы для JavaScript

- Элементы, с которыми взаимодействует JS, помечаются префиксом **`js-`** (например, `js-header`).
- Остальные классы используются для стилей; селекторы в JS по возможности привязывать к `js-*`, а не к чисто презентационным классам.

---

## 3. Идентификаторы (`id`)

Для всех id в проекте используется **camelCase**.

- **Уникальные UI-элементы**: `burgerIcon`, `burgerMenu`, `introSlider`, `logolineSlider`.
- **Составные/контекстные**: `accordionFaq`, `accordionTriggerFaq0`, `accordionPanelFaq0`.
- **Формы**: id полей должны быть уникальны в документе (для `<label for="...">` и валидности HTML).
  - **Одна форма на странице** — фиксированный префикс в camelCase: `formCallbackPhone`, `formCallbackName`, `formCallbackError`.
  - **Несколько экземпляров формы** — уникальный префикс на экземпляр: **`{formId}{Field}`** (например `formCallback123456Phone`). В шаблоне: `{% set formId = 'formCallback' ~ random(1000000) %}`, в полях: `id="{{ formId }}Phone"` и т.д.

---

## 4. Data-атрибуты (`data-*`)

- Имена в **kebab-case**.
- Примеры: `data-settings`, `data-label-open`, `data-label-close`, `data-tags`, `data-time`, `data-tag`, `data-orientation`.

---

## 5. Имена секций в JSON

- **kebab-case**, соответствует имени twig-шаблона секции.
- Примеры: `header`, `intro`, `content-container`, `form-container`, `promo`, `restaurants`.

---

## 6. Семантика и доступность

- Один `<h1>` на страницу, иерархия заголовков: h1 → h2 → h3.
- У изображений всегда `alt` (декоративные — `alt=""`).
- Интерактивные элементы: `<button>` для действий, не `<a href="javascript:...">`.
- ARIA где нужно: `aria-expanded`, `aria-controls`, `aria-label`, `aria-hidden`, `role`, `aria-live` (например, accordion, burger-menu, форма).

---

## 7. Системные константы и переменные

### CSS-переменные (Custom Properties)

Используется системная нумерация вместо семантических имен (primary/secondary).

- **Цвета**: `--color-1` … `--color-7` (базовые и фирменные). Служебные: `--color-error`, `--color-success`, `--color-placeholder`, `--color-muted`, `--color-border`.
- **Градиенты**: `--gradient-1`, `--gradient-2`, `--gradient-3`.
- **Шрифты**: `--font-1` (основное семейство), `--font-1-extended` (расширенное). Начертания задаются через `font-weight` и утилиты `.weight-100` … `.weight-900`.
- **Z-index**: `--z-index-1` (1000) ... `--z-index-10` (910) — убывающий порядок.
- **Анимации**: `--transition-1` (0.25s), `--transition-2` (0.5s).

### Медиа-запросы (Custom Media)

Использовать кастомные переменные из `base/mq.css`, не хардкодить пиксели.

- `--xs` (max 539px)
- `--xm` (min 540px)
- `--sm` (min 768px)
- `--md` (min 992px)
- `--lg` (min 1200px)
- `--xl` (min 1441px)
- `--xxl` (min 1601px)

### Анимации (Keyframes)

- Имена в **kebab-case**.
- Примеры: `fadeout`, `left-to-right`, `fly`.

---

## Краткая шпаргалка

| Сущность          | Формат                                                                       | Примеры                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Класс блока       | `kebab-case`                                                                 | `form-callback`, `card-general`                                                                                                                 |
| Класс элемента    | в компоненте: **`component__element`**; в секции: `section__item` + `*-wrap` | `form-callback__container`, `accordion__title`; `section__item logo-wrap`                                                                       |
| Обёртка           | `*-wrap` (дополняет элемент)                                                 | `title-wrap`, `button-wrap` — пишутся вместе с `section__item` и т.д.                                                                           |
| Состояние         | блок + класс состояния на одном элементе                                     | `class="header active"` → в CSS `.header.active`; состояния: `active`, `open`, `visible`                                                        |
| JS-хук            | `js-*`                                                                       | `js-header`                                                                                                                                     |
| id                | camelCase                                                                    | `burgerIcon`, `accordionTriggerFaq0`, `formCallbackPhone`, `formCallback123456Phone`                                                            |
| data-\*           | kebab-case                                                                   | `data-settings`, `data-tags`                                                                                                                    |
| Секция в JSON     | kebab-case                                                                   | `content-container`, `form-container`                                                                                                           |
| Контент (слова)   | единый набор                                                                 | `heading`, `headline`, `subheading`, `subtitle`, `title`, `desc`, `name`, `label`, `placeholder`, `link`, `content` — в классах, \*-wrap и JSON |
| Размеры (t-shirt) | xs, sm, md, lg, xl                                                           | `container-sm`, `button-md`, `text-lg` — единая шкала для контейнеров, кнопок, текста, иконок                                                   |

---

## См. также

- [css-naming.md](css-naming.md) — организация и нейминг CSS
- [js-naming.md](js-naming.md) — JavaScript: селекторы, модули, глобальные объекты
- [twig-naming.md](twig-naming.md) — Twig: секции, переменные, подключения
- [json-naming.md](json-naming.md) — JSON: структура страниц и глобальных данных
