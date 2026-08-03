# ADR-0010: Нормализация нейминга `form-callback` (без BEM `--`-модификаторов)

**Status:** Accepted
**Date:** 2026-06-01
**Supersedes:** `docs/proposals/0016-form-callback-naming-normalization.md`
**Related:** ADR-0007 (data-driven form validation), `docs/conventions/html-naming.md`, `docs/conventions/css-naming.md`

## Context

`form-callback` был единственным компонентом платформы на классическом BEM с
двойным дефисом `block__element--modifier`:

| Класс-модификатор | Уровень |
| --- | --- |
| `form-callback__control--select` / `--textarea` | элемент |
| `form-callback__field--checkbox` / `--full` / `--rules` / `--submit` | элемент |

Это противоречит конвенции baseline (`html-naming.md` / `css-naming.md` §4):
модификаторы — отдельные классы без `__`/`--`, состояние — отдельный класс на
том же узле (`.block.state`), `--` в нейминге не используется. Компонент перенесён
в baseline дословно из deployment'а `kumho-tires.ru` («kumho-style» нейминг), хотя
именно baseline должен быть эталоном конвенции.

(Блок-модификатор `form-callback--inline` из proposal 0016 в baseline отсутствовал —
правки коснулись только element-модификаторов.)

## Decision

`block__element--modifier` → standalone-модификатор (второй класс на том же узле),
принцип имени `{роль}-{вариант}` с префиксом роли против коллизий:

| Было | Стало | CSS-селектор |
| --- | --- | --- |
| `form-callback__control--select` | `form-callback__control control-select` | `.form-callback__control.control-select` |
| `form-callback__control--textarea` | `form-callback__control control-textarea` | `.form-callback__control.control-textarea` |
| `form-callback__field--checkbox` | `form-callback__field field-checkbox` | `.form-callback__field.field-checkbox` |
| `form-callback__field--full` | `form-callback__field field-full` | `.form-callback__field.field-full` |
| `form-callback__field--rules` | `form-callback__field field-rules` | `.form-callback__field.field-rules` |
| `form-callback__field--submit` | `form-callback__field field-submit` | `.form-callback__field.field-submit` |

Затронуты три файла:

- `assets/css/components/form-callback.css` — селекторы (`.__el--mod` → `.__el.mod`);
- `templates/components/form-callback.twig` — разметка (два класса на узле);
- `assets/js/components/form-callback/ui.js` — строка `className` error-баннера.

JS логику это не задевает: форма селектит по базовым `.form-callback__field` /
`.form-callback__control` и состоянию `.error`, никогда по `--`-классам.

## Consequences

- **Плюс:** компонент приведён к единой схеме нейминга; baseline снова эталон.
- **Специфичность:** селекторы поднялись с `0,1,0` (`.__el--mod`) до `0,2,0`
  (`.__el.mod`) — для авторитетных правил компонента не критично, регрессий нет.
- **Поведение не меняется:** чисто косметический rename; `npm run lint:css`,
  `vitest` (21) зелёные, CSS/JS собираются.
- **Verify-ограничение:** в canonical baseline нет страницы, использующей
  `form-callback` (форму рендерят deployments), поэтому визуальный runtime-прогон
  выполняется на ближайшем sync в deployment с формой. Статически (grep) полнота
  переименования подтверждена: `--`-модификаторов в исходниках компонента не осталось.
- **Дистилляция:** при следующем distill sync deployments (`kumho-tires.ru` и др.)
  получают нормализованный компонент. Deployment вправе осознанно остаться на `--` —
  это его локальное расхождение, baseline-эталон чист.

## Rollback

`git revert` правок трёх файлов — возврат к `--`-неймингу; поведение формы не меняется.
