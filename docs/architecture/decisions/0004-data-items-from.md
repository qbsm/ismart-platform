# ADR-0004: `data.items_from` — декларативная инжекция items из коллекций

**Status**: Accepted
**Date**: 2026-05-21

## Context

Текущий baseline загружает entity'и коллекций двумя путями:

1. **List-page рендеринг** (`PageAction::loadCollectionEntities()`) — для секций с `name === collection.nav_slug`. `injectListItems` инжектит во ВСЕ секции с пустым `data.items` (см. коммит `33c0f1c`).
2. **Entity-page рендеринг** — entity-страница наследует sections из list-page (`69c9621`).

Чего **нет** — возможности декларативно подсосать items произвольной коллекции в произвольную секцию **на любой странице** (не list-page). Реальные эпизоды:

- Главная `/` показывает 5 последних новостей в секции `news-slider`. Сейчас deployment'у приходится дублировать slug-список в `pages/index.json :: sections[news-slider].data.items` руками — или городить runtime-скрипт. **beepitron** именно это делает через `populate-bp-multilang.py`: на CI/build перед deploy скрипт читает entity-папки и переписывает 8 страниц.
- Секция `categories` на главной должна **наследовать порядок** из `pages/categories.json :: items[]` (declared order). Сейчас — alphabetical по disk-имени файлов.
- Сортировка numeric-id slug'ов (`1.json`, `10.json`, `2.json`) ломается на string-sort → нужен natural sort.

Это **5 open opportunities** (#1-#4 в `opportunities.md`) которые закрываются одним ключом + одним pass в DataLoader.

## Decision

Принимаем декларативный ключ `data.items_from` в JSON-секциях. DataLoader при загрузке страницы видит ключ → подсасывает entity'и коллекции, как list-page это делает для секции `name === nav_slug`.

### Семантика

```jsonc
{
  "type": "news-slider",
  "name": "news-slider",
  "data": {
    "items_from": "news",   // ключ коллекции из config/project.php :: collections
    "limit": 5               // опционально: ограничить кол-во после sort
  }
}
```

### Источники items (приоритет сверху вниз)

1. **Inline** — если `data.items` непуст → НЕ трогаем (явное определение всегда выигрывает).
2. **Collection** — если `data.items_from` указан и совпадает с ключом в `config/project.php :: collections`:
   - Slug'и берутся через `loadEntitySlugs($collectionConfig)` — текущее поведение (читает из list-page `items[]` либо `sections[name=nav_slug].data.items`).
   - Если slug-источник содержит declared order (массив `items[]` на list-page) — порядок **следует** этому массиву.
   - Если slug-источник пуст / отсутствует — fallback на directory scan `data_dir/*.json` с **natural sort** (`strnatcmp`): `1.json < 2.json < 10.json`.
   - Каждый slug резолвится через `loadEntity()` — те же правила visibility / item_key что и сейчас.
3. **Иначе** — секция получает `data.items = []`.

### Опции

MVP:

| Опция | Тип | Поведение |
|---|---|---|
| `items_from` | string | nav_slug коллекции из `config/project.php :: collections` |
| `limit` | int | взять первые N после resolution + sort |

Зарезервировано (не реализуется в MVP — документируются как future-proof):

| Опция | Назначение |
|---|---|
| `order` | `declared` / `alphabetical` / `natural` / `newest` — переопределить дефолтный sort |
| `filter` | предикат по полям entity (`tag`, `visible`, `category`) — на будущее |

Появление новых опций — без breaking change: deployments игнорируют незнакомые ключи.

### Backward-compat

- Если `data.items` уже заполнен (непустой массив) — **не перезаписываем**. Inline всегда выигрывает.
- Если секция **не** имеет `data.items_from` — поведение не меняется (старая `injectListItems`-логика работает как раньше).
- ADR-0004 совместим с `injectListItems` (`33c0f1c`): на list-page обе системы могут сработать; inline-`items_from` имеет приоритет над implicit nav_slug match.

### Numeric-aware sort

Отдельный фикс в `loadEntitySlugs()` и в новом directory-scan fallback:

```php
usort($slugs, 'strnatcmp');
```

Применяется только когда нет declared order (т.е. fallback на disk). При declared order — порядок из list-page items[] сохраняется как есть.

## Consequences

**Положительные:**

- **Убирает runtime-скрипты на стороне deployment'а** — `populate-bp-multilang.py` (beepitron) больше не нужен.
- Закрывает 5 open opportunities одним PR (`items_from`, declared_order, inline, numeric-sort, slugs_page — последний уже в baseline `08fa612`, гармонизируется).
- **Декларативный JSON** — секции pages становятся короче и читаются как контент, не как технический шаблон.
- Расширяемость через `limit/order/filter` — без поломки существующих deployments.

**Отрицательные / компромиссы:**

- DataLoaderService нагружается ещё одной ответственностью (резолв коллекций при загрузке страницы). Альтернатива — отдельный `SectionResolverService` — отложена: текущий объём метода `loadPage` всего ~5 строк, расширение оправдано.
- Лёгкое coupling: DataLoader теперь знает про конфиг коллекций (`config/project.php :: collections`). Передаётся параметром через `PageAction`, не singleton — coupling управляемый.
- Перформанс: каждая страница с N секций × `items_from` × M entity'ями делает 1 + M file reads. Mitigated: `loadEntitySlugs` уже кэширует JSON через `Json::load` static cache.

## Implementation steps

1. `DataLoaderService::injectItemsFrom(array &$pageData, array $collections, ...)` — новый метод. Pass по `$pageData['sections']` после `loadPage`. Для каждой секции с непустым `data.items_from` и пустым `data.items` — резолвит коллекцию.
2. `DataLoaderService::loadEntitySlugs` — добавить natural sort fallback когда `items[]` на list-page отсутствует.
3. `PageAction::__invoke` — после `loadPage` вызвать `$loader->injectItemsFrom($pageData, $collections, $jsonBaseDir, $langCode, $baseUrl)`.
4. Unit-тесты `tests/php/Unit/DataLoaderItemsFromTest.php` — 4 ветки:
   - `items_from` резолвит коллекцию с declared order → порядок следует list-page `items[]`.
   - `items_from` + пустой list-page → directory scan + natural sort.
   - `data.items` уже заполнен → `items_from` игнорируется (backward-compat).
   - `limit: N` обрезает результат.
5. Документация — `docs/guides/sections-items-from.md` короткий how-to + пример из beepitron `pages/index.json`.

## Alternatives considered

- **Расширить `injectListItems`** (читать `items_from` вместо `name === nav_slug` match). Отвергнуто — `injectListItems` живёт в `PageAction`, обходит DataLoader. Менять там — двигаться вверх по слоям, не вниз. Чище — в DataLoader, единая точка резолва.
- **Twig-фильтр `{% set items = collection('news', limit=5) %}`**. Отвергнуто — нарушает разделение «JSON = контент, Twig = разметка», требует Twig-extension зависящий от DataLoader, неудобно тестить.
- **Runtime-скрипт в baseline** (вынести `populate-bp-multilang.py` из beepitron). Отвергнуто — это build-step, добавляет шаг в pipeline, JSON остаётся «грязным» после скрипта (его реальное состояние ≠ src state).
- **Только `limit`, без `items_from`** (всегда auto-inject в любую секцию с `name === nav_slug`). Отвергнуто — не работает для главной (секция `news-slider` не имеет name=news).

## Migration risk

Низкий. Backward-compat абсолютная: секции без `items_from` работают как раньше; секции с непустым `data.items` не перезаписываются. Новый ключ опционален.

## Дальнейшие steps (отдельные задачи)

- Cleanup beepitron — заменить вызовы `populate-bp-multilang.py` на `items_from` в pages JSON, удалить скрипт.
- ADR-0005 (future) — если опции `order/filter` обретут конкретику, расписать их формально перед реализацией.
- `tools/scaffold/create-collection.js` — генерировать stub-секцию с `items_from` в template list-page.
