# Best Practices — принципы развития iSmart Platform

К этим принципам стремимся в каждой правке. Если правка их нарушает — это сигнал остановиться и переосмыслить.

## Минимализм

Каждый файл/класс делает **одну вещь**. Если описание содержит союз "и" — это два класса.

## Переиспользование

- Паттерн повторился в **двух** местах → выноси в `src/Support/` (если не state) или `src/Service/` (если с зависимостями).
- В **трёх** — это уже долг и потенциальная точка расхождения. Дольше тянуть нельзя.
- Перед выделением проверь, нет ли уже подходящего модуля. Например, новый JSON-loader — нет, есть `Support\Json`.

## Type safety

- `declare(strict_types=1)` обязателен в каждом PHP-файле.
- Все аргументы и возвраты — типизированы.
- Используем `readonly` для immutable свойств (PHP 8.1+).
- Generics через PHPDoc: `@var array<string,mixed>`.

## Immutability

- Статические утилиты — `final class` с `private function __construct()`.
- Сервисы — `final class` с `readonly` зависимостями через constructor promotion.
- DTO/value objects — `readonly class` (PHP 8.2+).

## Dependency Injection

- Зависимости через конструктор. `new SomeClass()` внутри метода — почти всегда плохо.
- DI-binding в `config/container.php` (PHP-DI).
- Никакого Service Locator: класс должен явно объявить, что ему нужно.

## Composition over inheritance

- Cross-cutting concerns — через traits (`RespondsToContent`).
- Расширения функциональности — через интерфейсы (Strategy, Decorator).
- Глубокая иерархия классов — антипаттерн. Максимум один уровень (abstract + concrete).

## No magic

- Magic-литералы и константы — в `src/Support/RequestAttributes.php`.
- Не используем `__get`/`__call`/dynamic properties — typed properties + явные геттеры.
- Не используем глобальное состояние ($_SESSION, $GLOBALS) напрямую — оборачиваем в Service.

## Single Source of Truth

- Service инкапсулирует логику.
- Action только оркестрирует (загружает данные → передаёт в Service → формирует response).
- Middleware занимается cross-cutting (auth, logging, headers).
- Один и тот же расчёт не должен повторяться в двух местах — выноси в Service/Support.

## Тестируемость

- Чистые функции (статические утилиты) тестируются как unit без mocks.
- Сервисы с зависимостями тестируются с mocks (через интерфейсы).
- Action'ы покрываются integration-тестами (полный request → response).

## PSR

- **PSR-4** для autoload (`App\` → `src/`).
- **PSR-12** для code style (применяется через php-cs-fixer).
- **PSR-3** для логирования (`Psr\Log\LoggerInterface`).
- **PSR-7/15** для HTTP (Slim 4).
- **PSR-14** для events (league/event).

## Modern PHP идиомы (8.1+)

- `match` вместо `switch`, где возможно.
- `enum` вместо классов с константами, если есть семантика типа (HTTP-методы, статусы).
- `readonly` properties / classes.
- `first-class callable syntax` (`$callback = $obj->method(...)`).
- `named arguments` для длинных API.
- `?->` (nullsafe) для chained calls.

## Что не делаем

- Не пишем "Manager", "Helper", "Utils", "Common" в имени — это сигнал, что класс делает несколько вещей.
- Не используем static state (`static $cache` внутри метода) — только если действительно immutable и тестируется через flush.
- Не возвращаем `mixed` без явной необходимости — типизируйте.
- Не оставляем dead code и закомментированные блоки — есть git history.
- Не добавляем "на будущее" — пиши только то, что нужно сейчас. YAGNI.
