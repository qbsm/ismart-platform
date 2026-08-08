# 2026-06-04 — Retina для cover-фонов: proposal 0017 + `image_set()` на tank-avilon

## Запрос

«Похоже picture-компонент не поддерживает ретину» → оформить proposal 0017 с реализацией `image_set()` → накатить на `tank-avilon`.

## Диагноз

`picture.twig` ретину **поддерживает корректно**: `srcset` с `w`-дескрипторами + `sizes`, браузер сам умножает слот на DPR. Боль не в `<picture>`, а в **cover-фонах** `background-image: url(...)` — у них нет ни `srcset`, ни `sizes`, а путь берётся через `image_fallback()` (самый маленький `400w`). Итог: мыло на retina (и на 1x при широкой карточке).

Затронуто: `card-tire`, `card-news`, `card-nav`, `card-gradient`, секции `frame`, `callback`.

## Решение

Proposal `docs/proposals/0017-image-set-retina-backgrounds.md` (Status: Proposed). Нативный DPR-свитчинг для фонов — CSS `image-set()` через новый Twig-хелпер `image_set(rawPath, baseKey='400', maxDpr=2)`. Лесенка `400/800/…` даёт чистые целочисленные пары (1x=400, 2x=800). Гейтинг ADR-0006 сохранён (эмитятся только реально сгенерированные варианты); нет 1x → `''`.

Разметка — две декларации: универсальный `url()`-фолбэк + `image-set`-оверрайд под `{% if _set %}`. Старые браузеры (Safari ≤16) игнорируют вторую декларацию → текущее 1x-поведение, **регрессии нет**.

## Реализация (reference: tank-avilon)

- `src/Twig/DataExtension.php` — метод `imageSet()` + регистрация `image_set` в `getFunctions()`. URL префиксуется `$this->baseUrl` (как `imageVariants`), url() в одинарных кавычках (html-эскейп `&#039;` декодируется браузером в атрибуте).
- Шаблоны: `card-news`, `card-tire`, `card-nav`, `card-gradient`, `sections/frame`, `sections/callback` — на двухдекларационный паттерн.
- `tests/php/Unit/DataExtensionImageSetTest.php` — 6 тестов (1x+2x, только-1x при skip-upscale, '' без baseKey, '' для не-raw/без манифеста, кастомный baseKey/maxDpr).

## Verify

- `php -l` + PHPStan (`src/Twig/DataExtension.php`) — чисто.
- PHPUnit — 6/6.
- Twig-компиляция всех 6 шаблонов через контейнерный Twig — OK.
- End-to-end рендер: `callback`/`card-news` (raw) → `url(...)` + `image-set(...400 1x, ...800 2x)`; `card-tire` (не-raw hero) → graceful одиночный `url()`.

Примечание: локальный `tank-avilon.test` и `php -S` отдавали 503 на HTTP-слое (vhost не поднят) — запросы не доходили до приложения (в Monolog их нет). Верификация сделана на уровне контейнерного Twig-рендера, что эквивалентно.

## Остаётся

- Proposal 0017 на review → при «делаем» миграция в ADR + перенос кода/теста в baseline.
- Опционально: перевод cover-div'ов на `<picture>` + `object-fit: cover` (альтернатива из proposal, отклонена для этого раунда как более инвазивная).
