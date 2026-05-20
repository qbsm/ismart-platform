# ADR-0002: Photoroom — kumho-only, не в baseline

**Status**: Accepted
**Date**: 2026-05-20

## Context

Дистилляция baseline'а из `kumho-tires.ru` включала `src/Action/PhotoroomRemoveBackgroundAction.php` + `src/Api/PhotoroomApiClient.php`. Эта интеграция использовалась на одной странице kumho для отделения фона у фотографий шин — узкая бизнес-задача одного deployment'а.

Вопрос: оставлять ли в baseline (как опциональный модуль) или удалить?

## Decision

**Удалить из baseline.** Photoroom остаётся только в `kumho-tires.ru` как deployment-specific override (помечен в `.distill/state.json` через `mark-override`).

Удалено из baseline:

- `src/Action/PhotoroomRemoveBackgroundAction.php`
- `src/Api/PhotoroomApiClient.php` + папка `src/Api/`
- DI-binding в `config/container.php`
- POST-роут `/api/photoroom/remove-background` в `config/routes.php`
- Секция `'photoroom'` в `config/settings.php`
- Блок `PHOTOROOM_*` в `.env.example`
- Комментарий в `config/project.php(.dist)`
- Секция в `tools/scaffold/create-deployment.js` (шаблон `.env` для новых deployment'ов)

## Consequences

**Положительные:**

- Baseline не несёт ненужный код, который второму заказчику только мешает.
- Новый deployment, созданный через `create-deployment`, не получает Photoroom-конфигурацию по умолчанию.
- DI-граф проще: 33 класса вместо 35.

**Отрицательные:**

- Если другой заказчик попросит Photoroom-like интеграцию — придётся переоткрывать паттерн или копипастить из kumho.
- Drift: kumho теперь имеет файлы, которых нет в baseline. Это **намеренный override**, помечается в `.distill/state.json`.

## Alternatives considered

- **Оставить как optional extension с feature flag** (`'integrations' => ['photoroom' => ['enabled' => false]]`): отвергнут — на 2 заказчика преждевременная абстракция. Лучше пересмотреть, когда появится 2-я интеграция-кандидат.
- **Вынести в отдельный composer-пакет `ismart/photoroom`**: отвергнут — слишком тяжёлая инфраструктура (versioning, packagist) для одного use case.
- **Оставить в baseline как есть**: отвергнут — это и есть проблема дистилляции (kumho-specific тащится во всех новых deployments).

## Plugin-механика на будущее

Если интеграций станет 2+, целевой механизм:

```
src/Integration/
  Photoroom/          # каждый интегратор — папка с Action + ApiClient + config
    Action.php
    ApiClient.php
    config.php
  N8n/
  ...
```

Активация — через `config/project.php` (`'integrations' => ['photoroom']`), DI-binding генерируется в `container.php` на основе списка. Тогда baseline даст структуру, а deployment подключит только нужные.

Триггер для введения этой структуры: 2 интеграции одновременно.
