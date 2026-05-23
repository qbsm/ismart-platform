# 0002 — card-gradient: animated covers + gradient variants

**Status**: Proposed
**Date**: 2026-05-22
**Author**: italycommunity.ru deployment
**Scope**: core — `templates/components/card-gradient.twig`, `assets/css/components/card-gradient.css`
**Related**: `docs/guides/multi-project-sync.md` §6 (sync regression-class), `docs/architecture/images.md`

---

## Контекст

Baseline `card-gradient.twig` рендерит фон карточки через inline `style="background-image: url('{{ url(item.cover.src) }}');"` прямо на корневом `<a>`/`<div>`:

```twig
<a href="{{ item.href }}" class="card-gradient {{ item.class|default('') }} link"
   {% if item.cover is defined %}style="background-image: url('{{ url(item.cover.src) }}');"{% endif %}>
```

CSS baseline (`assets/css/components/card-gradient.css`) опирается на `background: var(--gradient-3)` без вариантов, без анимаций.

**Чего не хватает:**

1. **Вариативные градиенты.** Дизайн запрашивает разные радиальные градиенты на разных карточках (например `gradient-red` для «Программы лояльности», `gradient-sunset` для «Бегового клуба»). Inline `background-image: url(...)` не покрывает — единственное место указать вариант это CSS-класс на отдельном элементе.
2. **Анимации hover-zoom / shift-down / parallax.** `transform: scale(1.6)` на корневой `<a>` ломает layout (растягивает не только фон, но и текст/иконку). Нужен отдельный `<div>` под фон, который двигается независимо от content-layer'а.
3. **Случай «нет cover.src, есть только gradient».** Сейчас, если в JSON задано только `cover.gradient`, шаблон выводит `style="background-image: url('#');"` — broken visual.

**Воспроизведение (italycommunity.ru, 2026-05-22).**

JSON-секция `navigation` главной:

```jsonc
{
  "type": "gradient",
  "href": "https://italycommunity.online/loyaltyprogram",
  "cover": { "gradient": "gradient-red" },
  "title": "Программа лояльности",
  "class": "color-1 animation-zoom"
}
```

Рендеринг baseline-версии:

```html
<a href="..." class="card-gradient color-1 animation-zoom link" style="background-image: url('#');">
  <div class="card__item title-wrap"><span class="card__title">Программа лояльности</span></div>
</a>
```

Карточка визуально пуста — `url('#')` ничего не загружает, класса `gradient-red` ни на одном элементе нет, CSS подставить нечего.

### Sync regression — класс проблемы

Этот case уже ловили: в `italycommunity.ru` была корректная реализация (коммит `9321598 "Карточки навигации: CSS-градиенты, ховер-анимации, разделитель в заголовках"`, 2026-04-28). Затем `085578e "sync(baseline): notification channels (ADR-0005) + накопившийся baseline-drift"` (2026-05-22) подтянул baseline `ismart-platform@eb54d7f` поверх — и **затёр** локальный `9321598`, потому что baseline никогда не получил эту фичу. Симптом: на следующей итерации главной — пустые карточки.

Это второй за день baseline-sync regression (первый — `picture.twig`, см. proposal [0001](0001-manifest-driven-images.md) §1). Подтверждает: deployment-фиксы должны мигрировать в baseline, иначе каждый sync — рулетка.

---

## Решение

Поднимаем паттерн «cover как отдельный элемент» в baseline. `card-gradient.twig` рендерит:

- `<div class="card-gradient__cover {{ item.cover.gradient|default('') }}">` — отдельный layer для фона
- При `item.cover.src` — `background-image: url(...)` на нём же
- При `item.cover.gradient` — класс-вариант (CSS даёт `background: radial-gradient(...)`)
- Анимации (`.animation-zoom`, `.animation-shift-down`, `.animation-parallax`) применяются к `.card-gradient__cover`, не к корню — содержимое (`title-wrap`, `icon-wrap`) остаётся статичным

Плюс — поддержка title с разделителем `|`: `"Эспрессо | Бар"` → `<span>Эспрессо</span><span aria-hidden>|</span><span>Бар</span>`, для двухстрочных заголовков (есть в beepitron, italycommunity).

### Контракт JSON (обратная совместимость)

```jsonc
// 1. Только image cover (как было) — продолжает работать
{ "cover": { "src": "data/img/loyalty.webp" }, "title": "...", "href": "..." }

// 2. Только gradient — НОВОЕ, сейчас рендерится broken
{ "cover": { "gradient": "gradient-red" }, "title": "...", "href": "..." }

// 3. Image + gradient overlay (опц., если решим разрешить)
{ "cover": { "src": "...", "gradient": "gradient-red" }, ... }
```

---

## Структура файлов

### `templates/components/card-gradient.twig`

```twig
{% if item.href is defined %}
<a href="{{ item.href }}" class="card-gradient {{ item.class|default('') }} link">
{% else %}
<div class="card-gradient {{ item.class|default('') }}">
{% endif %}
  {% if item.cover is defined %}
    <div class="card-gradient__cover {{ item.cover.gradient|default('') }}"
      {% if item.cover.src is defined %}style="background-image: url('{{ url(item.cover.src) }}');"{% endif %}></div>
  {% endif %}
  {% if item.title is defined %}
    <div class="card__item title-wrap">
      {% if '|' in item.title %}
        {% set parts = item.title|split('|') %}
        <span class="card__title">{{ parts[0]|trim|raw }}</span>
        <span class="card__separator" aria-hidden="true">|</span>
        <span class="card__title">{{ parts[1]|trim|raw }}</span>
      {% else %}
        <span class="card__title">{{ item.title|raw }}</span>
      {% endif %}
    </div>
  {% endif %}
  {% if item.icon is defined %}
    <div class="card__item icon-wrap {{ item.icon.class|default('') }}">
      <img src="{{ item.icon.src }}" alt="{{ item.icon.alt|default('') }}" class="img-responsive" loading="lazy">
    </div>
  {% endif %}
{% if item.href is defined %}
</a>
{% else %}
</div>
{% endif %}
```

### `assets/css/components/card-gradient.css`

Добавить (после существующего блока `.card-gradient`):

```css
.card-gradient__cover {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  pointer-events: none;
  transition: transform 0.6s ease-out;
}

/* CSS-радиальные градиенты — варианты */
.card-gradient__cover.gradient-red {
  background:
    radial-gradient(ellipse 70% 130% at 100% 110%,
      #e21100 0%,
      #8a0700 18%,
      #2a0300 45%,
      #000 80%);
}

.card-gradient__cover.gradient-sunset {
  background:
    radial-gradient(circle 330px at 50% 100%,
      #000 0%, #2a0900 25%, #7a1f02 55%, transparent 90%),
    radial-gradient(circle 240px at 22% 0%,
      #000 0%, #2a0900 25%, #7a1f02 55%, transparent 90%),
    radial-gradient(circle 240px at 78% 0%,
      #000 0%, #2a0900 25%, #7a1f02 55%, transparent 90%),
    #ff561e;
}

/* Анимации применяются к cover-layer'у */
.card-gradient.animation-zoom .card-gradient__cover {
  transform-origin: 100% 100%;
}
.card-gradient.animation-zoom:hover .card-gradient__cover {
  transform: scale(1.6);
}

.card-gradient.animation-shift-down .card-gradient__cover {
  top: -25%;
  bottom: -25%;
  transition: transform 0.3s ease-out;
}
.card-gradient.animation-shift-down:hover .card-gradient__cover {
  transform: translateY(10%);
}

.card-gradient.animation-parallax .card-gradient__cover {
  top: -8%;
  right: -4%;
  bottom: -8%;
  left: -4%;
  transition: transform 0.25s ease-out;
}
.card-gradient.animation-parallax.link:hover,
.card-gradient.animation-parallax.link:active {
  opacity: 1;
}

/* Title с разделителем "|" */
.card-gradient .card__separator {
  display: inline-block;
  color: var(--color-1);
  opacity: 0.5;
  margin: 0 0.5em;
}
```

`title-wrap` и `icon-wrap` уже имеют `z-index: 1` в текущем CSS — поверх cover'а.

### Опционально — JS parallax

Если решим тянуть в baseline и `animation-parallax`, нужен `assets/js/components/card-gradient-parallax.js` (логика следования за курсором). Сейчас он есть только в italycommunity.ru. Можно вынести в follow-up — proposal'у достаточно CSS-варианта.

---

## Миграция

### В baseline

Атомарный коммит:

```
feat(card-gradient): animated cover layer + gradient variants

card-gradient.twig рендерит <div class="card-gradient__cover"> отдельным
элементом — для CSS-вариантов (gradient-red, gradient-sunset) и анимаций
(animation-zoom, animation-shift-down, animation-parallax) без deform
content-layer'а. Поддержка title с разделителем "|" → две span'ы +
.card__separator.

Обратная совместимость: cover.src продолжает работать.
```

### В deployments

После принятия proposal'а — distillation в `italy-platform`, `kumho-tires.ru`, `bp`, `italycommunity.ru`. `italycommunity.ru` уже содержит корректную версию шаблона (восстановлена сегодня, 2026-05-22) — после distillation diff будет пустым.

В `kumho-tires.ru` и `bp` шаблон currently broken-ровно-так-же как baseline — фикс прилетит автоматически.

### Edge cases

| Случай                                            | Поведение                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `cover.src` без `cover.gradient`                  | `<div class="card-gradient__cover" style="background-image: ...">` — старое поведение         |
| `cover.gradient` без `cover.src`                  | `<div class="card-gradient__cover gradient-red">` — CSS-вариант                                |
| `cover` отсутствует целиком                       | `<div class="card-gradient__cover">` не рендерится → визуально только `background: var(--gradient-3)` корневого элемента (как сейчас) |
| Title без `|`                                     | Один `<span class="card__title">` — старое поведение                                           |
| Title с двумя и более `|`                         | `split('|')` даёт массив; берём `[0]` и `[1]`, остальное игнорируется (или throw? — see Q1)    |

---

## Пример расширения

**Сценарий 1: новый gradient-вариант (gradient-ocean).** Добавляется CSS-правило `.card-gradient__cover.gradient-ocean { background: radial-gradient(...) }`. JSON указывает `cover.gradient: "gradient-ocean"`. Шаблон не меняется.

**Сценарий 2: новый animation-стиль (animation-pulse).** Добавляется CSS-правило `.card-gradient.animation-pulse .card-gradient__cover { animation: pulse 2s ... }`. JSON указывает `"class": "animation-pulse"`. Шаблон не меняется.

**Сценарий 3: deployment хочет свой gradient-вариант.** Project-specific CSS добавляет правило в `assets/css/sections/navigation.css` (per-project, см. `multi-project-sync.md` §2), используя более специфичный селектор: `.navigation .card-gradient__cover.gradient-italian-flag { ... }`. Baseline не меняется.

---

## Reference implementation

- **Deployment**: `italycommunity.ru`
- **Original feature commit**: `9321598` (2026-04-28) — «Карточки навигации: CSS-градиенты, ховер-анимации, разделитель в заголовках»
- **Sync regression**: `085578e` (2026-05-22) — `sync(baseline)` затёр `9321598`, baseline за ним не повторял
- **Restore commit**: 2026-05-22 — восстановлено локально в italycommunity.ru, ждёт миграции в baseline через этот proposal

CSS-варианты `gradient-red`, `gradient-sunset` и анимации — все живые в `assets/css/components/card-gradient.css` italycommunity.ru, можно скопировать 1:1.

---

## Acceptance

- [ ] `card-gradient.twig` рендерит `<div class="card-gradient__cover">` отдельным элементом.
- [ ] CSS baseline содержит `.card-gradient__cover`, `.gradient-red`, `.gradient-sunset`, `.animation-zoom`, `.animation-shift-down`, `.animation-parallax`.
- [ ] Обратная совместимость: `cover.src` без `cover.gradient` рендерится визуально идентично текущему baseline.
- [ ] Title с `|` разбивается на две span'ы + `.card__separator`.
- [ ] Smoke на одном deployment'е с реальной JSON-секцией `cover.gradient`: карточка отображается, hover-анимация работает.
- [ ] Distillation в `italy-platform`, `kumho-tires.ru`, `bp`, `italycommunity.ru` — diff после применения пустой.
- [ ] После merge — миграция в `docs/architecture/decisions/0006-card-gradient-animated-covers.md` (или текущий next-ADR-номер).

---

## Follow-up (отдельные коммиты)

- **`assets/js/components/card-gradient-parallax.js`** — JS-логика follow-cursor для `.animation-parallax`. Опциональна, можно затянуть позже.
- **Sync-regression policy** — апдейт `docs/guides/multi-project-sync.md` §6 с явным чеклистом для baseline-команды: «перед публикацией baseline пройти `diff` против каждого deployment'а — если есть unique-фичи в deployment'е, либо тянуть в baseline (через proposal), либо подтвердить, что они умышленно остаются deployment-specific и помечены в `.distill/state.json::overrides`». Это закроет класс «baseline-затёр-фичу» (уже два случая за день: `picture.twig` и `card-gradient.twig`).

---

## Открытые вопросы

1. Title с тремя+ `|` — какое поведение? Сейчас в коде `split('|')[0]` и `[1]` — `[2:]` теряется. Альтернатива: брать `|join('|')` для остатка и в один `<span>`. Минорно, но определимся явно в финальной версии.
2. Считать ли `card-gradient.twig` core'ом? Сейчас в `multi-project-sync.md` §2 templates помечены как project-specific. Этот компонент используется одинаково во всех deployment'ах — стоит поднять в §1 одним проходом с picture.twig (см. proposal 0001 §Открытые вопросы).
3. JS-parallax — оставлять опциональным feature deployment'а, или базовый паттерн baseline? Зависит от того, насколько широко используется. Сейчас — только italycommunity.ru.

---

## Rollback

`git revert` коммита в baseline. Deployments возвращаются к pre-fix состоянию: `cover.gradient` снова не работает, JSON с этим ключом рендерит `url('#')`. Данные не теряются. `italycommunity.ru` может вручную восстановить локальную версию из `9321598`.
