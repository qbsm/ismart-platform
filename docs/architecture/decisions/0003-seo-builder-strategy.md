# ADR-0003: SEO через Strategy pattern (SeoBuilderInterface)

**Status**: Accepted
**Date**: 2026-05-20

## Context

Раньше в baseline `PageAction::buildSeoForEntity()` строил SEO для entity-страниц инлайн: брал `item.name`, `desc.short`, выдавал базовый набор `<title>` + `og:*` мета-тегов. Простой, но негибкий:

- Жёстко закодирован `og:site_name = 'Kumho Tire'` — kumho-leak в baseline.
- Все коллекции получают **одинаковый** SEO. Для tire-страницы и для restaurant-страницы — один и тот же формат.
- Невозможно генерировать **Schema.org/JSON-LD** специфично для типа (Restaurant, Product, Article).
- FAQPage, Review, Offer — типы Schema.org, требующие per-collection логики, — нет места куда их вставить.

**italy** и **beepitron** уже добавили свой Strategy pattern (`SeoBuilderInterface` + `SeoBuilderRegistry`) и имеют `RestaurantSeoBuilder` который выдаёт `Schema.org/Restaurant + FAQPage`. Это **доказанный практикой** подход.

## Decision

Принимаем **italy-вариант** Strategy pattern в baseline.

- `App\Service\SeoBuilderInterface` — контракт `build(entity, baseUrl, lang, config, global): array`.
- `App\Service\SeoBuilderRegistry` — реестр `{collectionKey → SeoBuilderInterface, default → SeoBuilderInterface|null}`.
- `App\Service\DefaultSeoBuilder` — generic-реализация (то же поведение что прежний inline-метод, но в виде интерфейса).
- `PageAction` принимает `?SeoBuilderRegistry` через DI (опционально, обратно-совместимо). При наличии — делегирует ему. При отсутствии — inline fallback (доконвертация deployments не ломается).

## Consequences

**Положительные:**

- Open-closed: новые коллекции добавляют builder, не меняя `PageAction`/`SeoService`.
- Per-collection rich SEO: `Restaurant`, `Product`, `Article`, `Service` — каждая со своей Schema.org-графой.
- `og:site_name` теперь из `$global['name']` или `$global['site_name']`, не hardcode (фикс kumho-leak).
- Унифицирует baseline с italy/beepitron — кросс-проектный sync становится проще.

**Отрицательные / компромиссы:**

- На один файл больше (Interface + Registry + DefaultBuilder = 3 файла).
- Registry — ещё одна DI-зависимость в `container.php`.
- Existing deployments (kumho, italy, beepitron) после применения должны решить: использовать Registry или оставить inline-fallback. Migration в kumho — один config-binding в container.php.

## Implementation steps

1. Создать `SeoBuilderInterface`, `SeoBuilderRegistry`, `DefaultSeoBuilder` в `src/Service/`.
2. `PageAction::__construct` — добавить опциональный `?SeoBuilderRegistry $seoBuilderRegistry = null` (после `$dispatcher`, для обратной совместимости).
3. `PageAction::buildSeoForEntity` — расширить сигнатуру `(entity, baseUrl, langCode, config, global, entityType)`. Если registry есть и `get($entityType)` не null — делегировать; иначе inline fallback.
4. `config/container.php` — зарегистрировать `SeoBuilderRegistry` с `DefaultSeoBuilder` как default, передать в `PageAction`.
5. Sync в deployments:
   - **kumho/trazano/mirage**: подключают Registry с `DefaultSeoBuilder` (no-op миграция: поведение не меняется, но открывается dorr для будущих builder'ов).
   - **italy/beepitron**: уже на Strategy — обновляют `SeoBuilderInterface` под baseline-сигнатуру (если расходится), регистрируют свои `RestaurantSeoBuilder`/др. в Registry.

## Alternatives considered

- **Оставить inline в baseline**: отвергнуто — kumho-leak (`og:site_name = 'Kumho Tire'`), невозможно per-collection Schema.org.
- **Только `DefaultSeoBuilder` без Registry/Interface**: отвергнуто — нет точки расширения для deployments.
- **SeoService с if/else по типу**: отвергнуто — open-closed нарушается, sea of conditionals.
- **Composer-пакет `ismart/seo-builders`**: отвергнуто — преждевременно (нет stable v1 API), Strategy в baseline решает задачу.

## Migration risk

Низкий. `SeoBuilderRegistry` опциональный в `PageAction` — deployments без Registry-binding продолжат работать через inline fallback. Никакой breaking change для существующих deployments.

## Дальнейшие steps (отдельные задачи)

- Документировать `SeoBuilderInterface::build()` шаблон в `docs/guides/seo-add.md` (как добавлять кастомный builder).
- `tools/scaffold/create-collection.js` — добавить генерацию stub'а builder'а (`SeoBuilder<EntityName>.php`).
- В kumho/trazano-v2/mirage-v2 — `container.php` зарегистрировать `SeoBuilderRegistry` с `DefaultSeoBuilder`.
- В italy/beepitron — после применения sync проверить совместимость их `SeoBuilderInterface` с baseline (методы могут отличаться сигнатурой; baseline теперь канонический).
