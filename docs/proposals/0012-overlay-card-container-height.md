# Proposal 0012: Высоту overlay-карточек задаёт контейнер, не компонент

**Status:** Proposed
**Reference implementation:** `tank-avilon` — `assets/css/sections/actions.css` (контейнер задаёт `min-height`), `assets/css/components/card-action.css` (компонент `height: 100%`)
**Дата:** 2026-05-31

## Контекст

Overlay-карточки платформы (`card-action`, аналогично `card-finance`) устроены так: обложка/фон — `position: absolute; inset: 0`, контент — поверх; сам компонент тянется `height: 100%`. Это правильно: компонент **заполняет** отведённое место, а не диктует размер.

Но при подключении в секцию без заданной высоты ячейки компонент **схлопывается до высоты контента**: `height: 100%` резолвится в `auto`, абсолютная обложка съёживается до пары строк текста → «кривая» карточка (реально воспроизвели в `tank-avilon`, секция actions: карточки промо-акций схлопнулись, пока высоту не задали).

Антипаттерн, которым «чинили» по месту: вешать `min-height` на **сам компонент** (`.actions .card-action { min-height: 24rem }`). Это ломает инкапсуляцию — компонент уже объявил `height: 100%`, а потребитель параллельно навязывает ему фиксированную высоту; в разных секциях значения разъезжаются, и контракт «компонент заполняет контейнер» нарушается.

## Решение

Контракт overlay-карточек:

1. **Компонент** (`card-action`, `card-finance`, …) объявляет только `height: 100%` (заполнение) и `position: relative; overflow: hidden` для обложки. Свою высоту НЕ задаёт.
2. **Потребитель/контейнер** (секция → `*-wrap` / ячейка грида) задаёт высоту: `min-height` (или `aspect-ratio`, или fixed). Грид со `stretch` дальше выравнивает ряд.

Reference (tank-avilon, `assets/css/sections/actions.css`):

```css
/* контейнер задаёт высоту */
.actions .card-action-wrap {
  display: flex;
  min-height: 24rem;
  @media (--sm) { min-height: 34rem; }
  @media (--lg) { min-height: 38rem; }
}
/* компонент только заполняет */
.actions .card-action { width: 100%; }
```

`assets/css/components/card-action.css` — без изменений: `.card-action { height: 100%; … }`.

## Структура файлов (baseline)

- `assets/css/components/card-action.css`, `card-finance.css` — добавить в шапку-комментарий контракт: «высоту задаёт контейнер-потребитель; компонент использует `height: 100%`».
- (опц.) Дать overlay-карточкам **дефолтный `aspect-ratio`** (напр. `4 / 3`) как fallback, чтобы они не схлопывались даже без высоты у контейнера — тогда потребитель переопределяет при необходимости.
- `docs/conventions/css-naming.md` — зафиксировать правило «`*-wrap`/ячейка-контейнер задаёт размер, компонент `height:100%` заполняет» для overlay-блоков.

## Миграция

- Найти места, где высота навешена на сам overlay-компонент в секции (`.<section> .card-action { min-height }` и т.п.) → перенести `min-height`/`height` на `*-wrap`/ячейку, компоненту оставить `width:100%`/`height:100%`.
- Кандидаты: любые секции с `card-action`/`card-finance` в гриде/флексе.
