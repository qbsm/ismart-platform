# Proposal 0016: Нормализация нейминга form-callback (убрать kumho-style BEM `--`-модификаторы)

**Status:** Accepted → ADR-0010 (внедрён в baseline 2026-06-01)
**Дата:** 2026-06-01
**Reference implementation:** `tank-avilon` — `assets/css/components/form-callback.css`, `templates/components/form-callback.twig`, `assets/js/components/form-callback/ui.js`
**Scope:** core — компонент `form-callback` (общий для всех deployments)
**Related:** `docs/conventions/html-naming.md`, `docs/conventions/css-naming.md`, proposal 0007 / ADR-0007 (data-driven form validation), proposal 0014 (phone mask)

## Контекст

`form-callback` — единственный компонент платформы, который использует **классический BEM с двойным дефисом `block__element--modifier`**:

| Класс-модификатор | Уровень |
| --- | --- |
| `form-callback--inline` | блок |
| `form-callback__control--select` | элемент |
| `form-callback__control--textarea` | элемент |
| `form-callback__field--checkbox` | элемент |
| `form-callback__field--full` | элемент |
| `form-callback__field--rules` | элемент |
| `form-callback__field--submit` | элемент |

Это **не совпадает с конвенцией baseline** (`docs/conventions/html-naming.md`). По конвенции:

- модификаторы — **отдельные классы без `__`/`--`** (`button-sm`, `outline-color-2`, `header-logo-visible`);
- состояние — отдельный класс на том же узле (`class="header active"` → CSS `.header.active`);
- `--` в нейминге классов конвенцией **не используется** вообще.

### Происхождение

Компонент перенесён в baseline **дословно из deployment'а `kumho-tires.ru`** — набор классов `form-callback` идентичен один-в-один (`/Users/danich/Sites/kumho-tires.ru/assets/css/components/form-callback.css`), включая все `--`-модификаторы. То есть baseline унаследовал «kumho-style» нейминг, хотя стратегически именно baseline должен быть эталоном конвенции, а deployments — дистиллироваться от него (`docs/architecture/distillation.md`).

Остальной нейминг формы конвенции соответствует: `form-callback__submit-icon`, `form-callback__checkbox-box`, `form-callback__file-zone` — это нормальные односложные семантические элементы (ср. `footer__logo-link`).

## Решение

Заменить `block__element--modifier` на **standalone-модификаторы** (второй класс на том же узле), как требует конвенция.

### Карта переименований

| Сейчас (kumho `--`) | Предлагается (baseline) | CSS-селектор |
| --- | --- | --- |
| `form-callback--inline` | `form-callback form-callback-inline` | `.form-callback-inline` |
| `form-callback__control--select` | `form-callback__control control-select` | `.form-callback__control.control-select` |
| `form-callback__control--textarea` | `form-callback__control control-textarea` | `.form-callback__control.control-textarea` |
| `form-callback__field--checkbox` | `form-callback__field field-checkbox` | `.form-callback__field.field-checkbox` |
| `form-callback__field--full` | `form-callback__field field-full` | `.form-callback__field.field-full` |
| `form-callback__field--rules` | `form-callback__field field-rules` | `.form-callback__field.field-rules` |
| `form-callback__field--submit` | `form-callback__field field-submit` | `.form-callback__field.field-submit` |

Принцип имени модификатора: `{роль}-{вариант}` (как `button-sm`). Точные токены (`field-checkbox` vs более короткие `checkbox`/`full`) — на усмотрение review; короткие глобальные слова (`checkbox`, `full`, `select`) брать **не рекомендуется** во избежание коллизий, поэтому префикс роли (`field-`, `control-`) оставлен.

## Масштаб и места использования

Зависимость всего в **2 слоях + одна строка JS** (ниже, чем кажется):

- **CSS** — `assets/css/components/form-callback.css` (определения селекторов).
- **Twig** — `templates/components/form-callback.twig` (разметка).
- **JS** — `assets/js/components/form-callback/ui.js:211` — **единственная** ссылка, и та лишь *присваивает* className (`'form-callback__field form-callback__field--full form-callback__error-banner hidden'`), а **не селектит** по `--`-классу. Логика формы по `--` не выбирает элементы → риск поломки минимален.

Всего ~57 вхождений 7 классов; правки механические и синхронные.

## Миграция

1. CSS: переименовать селекторы по карте (`.form-callback__field--full` → `.form-callback__field.field-full` и т.д.).
2. Twig: заменить `form-callback__field--full` → `form-callback__field field-full` (два класса) во всех узлах.
3. JS: `ui.js:211` — обновить строку className на новый набор классов.
4. `npm run build` (CSS+JS), `npm run check` (lint/stylelint/format), `npm test`.
5. Дистилляция: при следующем sync deployment'ы (`kumho-tires.ru` и др.) получают нормализованный компонент. Если deployment осознанно хочет остаться на `--` — это его локальное расхождение, но baseline-эталон чист.

## Альтернатива (если нормализацию отклоняем)

Зафиксировать `--`-стиль формы как **намеренное исключение** в `docs/conventions/html-naming.md` (раздел про модификаторы): «компонент `form-callback` использует классический BEM `--` по историческим причинам». Дёшево, нулевой риск, но оставляет единственный компонент вне общей схемы и противоречит роли baseline как эталона. Рекомендуется именно нормализация.

## Reference implementation

`tank-avilon` — текущая реализация с `--` (до нормализации). Идентичный исходник: `kumho-tires.ru` (подтверждает kumho-происхождение нейминга).

## Acceptance

- [ ] В `form-callback.css`/`.twig`/`ui.js` не осталось `form-callback*--*` (grep пустой).
- [ ] Модификаторы — standalone-классы по конвенции; CSS использует `.block__element.modifier`.
- [ ] Визуально форма (inline-вариант, select/textarea-контролы, checkbox/full/rules/submit-поля) не изменилась.
- [ ] `npm run check` зелёный, `npm test` зелёный, форма отправляется (success/error-состояния работают).
- [ ] `docs/conventions/html-naming.md` дополнен примером модификатора компонента, если токены нуждаются в фиксации.
- [ ] После принятия — миграция в ADR (next-номер), дистилляция в deployments.

## Rollback

`git revert` правок трёх файлов — возврат к `--`-неймингу. Поведение формы не меняется (нейминг косметический, JS по `--` не селектит).
