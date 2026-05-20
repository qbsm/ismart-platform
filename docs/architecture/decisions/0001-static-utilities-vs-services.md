# ADR-0001: Статические утилиты vs Service-классы

**Status**: Accepted
**Date**: 2026-05-20

## Context

При создании `src/Support/` обнаружилась развилка: куда класть код, который преобразует данные (JSON-loading, type-safe extraction из массивов, парсинг Accept-заголовка). Варианты:

1. Сделать всё **сервисами** (DI-driven) — `JsonLoaderService`, `ArrayHelperService`, `ContentNegotiationService`.
2. Сделать всё **статическими утилитами** — `Json::load()`, `Arr::str()`, trait `RespondsToContent`.
3. Смешанный подход — сервисы для логики со state/DI, утилиты для чистых функций.

## Decision

Принят смешанный подход (вариант 3) с чёткой границей:

- **Статические утилиты** (`final class` с `private __construct()`) — для **чистых трансформаций**: load/parse/format. Без побочных эффектов, без зависимостей, тестируются как unit-функции.
- **Service-классы** (`final class` с `readonly` зависимостями) — для логики **с зависимостями** (logger, mailer, session, file system с побочными эффектами) или **состоянием** (кэш, конфиг).

Граница проверяется вопросом: «нужно ли этому коду что-то ещё, кроме входных аргументов?». Если да — Service. Если нет — Support-утилита.

## Consequences

**Положительные:**

- Утилиты не требуют DI-настройки в `config/container.php`.
- Утилиты — pure functions: один input → один output, без mocks в тестах.
- DI остаётся минимальным — там только то, у чего реально есть зависимости.
- Чёткая семантика для читателя: видишь `final class X` с private constructor → знаешь, что это статический хелпер.

**Отрицательные / компромиссы:**

- Статические методы нельзя мокать в тестах (но утилитам они и не нужны).
- При появлении состояния в утилите придётся переводить её в Service (breaking change). Это плата за изначальную простоту.

## Examples

- `Support\Json::load()` — чистая трансформация (path → array). Статика.
- `Support\Arr::str()` — типизированный геттер. Статика.
- `Support\RespondsToContent` (trait) — protected-методы, используемые в `*ErrorHandler`. Статика-like.
- `Service\MailService` — DI: `MailerInterface` + `LoggerInterface`. Service.
- `Service\TemplateDataBuilder` — DI: `Twig` + `BaseUrlResolver`. Service.

## Alternatives considered

- **Всё через DI (вариант 1)**: отвергнут — переусложнение для чистых функций (`JsonLoaderService->load($path)` против `Json::load($path)` — первое требует injection, мокания, всего DI-цикла).
- **Всё через статику (вариант 2)**: отвергнут — невозможно для логики с реальными зависимостями (Mailer, Logger).
