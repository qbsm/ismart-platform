# ADR-0009: `assets/css/` и `assets/js/` deployment-local целиком

**Status:** Accepted
**Date:** 2026-05-24
**Supersedes:** `docs/proposals/0009-css-js-deployment-local.md`
**Related:** ADR-0008 (multi-deployment docs)

## Context

Повторяющийся регресс CSS на siblings:

- 23.05: sync `085578e` затёр italy CSS → revert `9bf0d56` (массовый checkout 3c270b8)
- 24.05: sync `2ac09b2` повторил → опять revert

Корень: `tools/distill/distill.mjs::SKIP_PREFIXES` исключал только `assets/{css,js}/{sections,pages}/`, а `base/`, `components/`, `main.css`, `critical.css`, `vendor.js`, `utils/` — синкались. Они на деле deployment-specific (отдельный палетто-палет, формы, layout).

ADR-0008 описывал docs-разделение; ADR-0009 распространяет тот же принцип на frontend-assets.

## Decision

Корневые папки `assets/css/` и `assets/js/` в **`SKIP_PREFIXES`** distill sync. Vёрсточные/стиле-вые ассеты — целиком deployment-local.

Baseline хранит **reference implementations** этих ассетов (для новых deployments через `distill init`), но не пушит их в существующие siblings автоматически.

### Точечный sync — по запросу

Если конкретный модуль нужно унифицировать (как `assets/js/components/form-callback/*.js` после ADR-0005):

```bash
distill sync ../deployment --only=assets/js/components/form-callback/
```

Это **explicit operation**, не часть default sync. Аналогично если в будущем `picture.twig`/`raw_srcset` потребует sync JS-companion — точечный команда.

### Что синкается по-прежнему

- `tools/build/`, `tools/distill/`, `tools/orchestrator/`, `tools/migrate/`, `tools/scaffold/`, `tools/ops/` — shared tooling
- `src/`, `templates/components/`, `templates/base.twig`, `templates/pages/page.twig` — core PHP + общие Twig'и (deployment-specific Twig pages — через mark-override)
- `config/{settings.php, container.php, middleware.php, routes.php}` — ядро DI
- `composer.json`, `composer.lock`, `package.json` — зависимости
- `docs/` (selectively — см. ADR-0008)

### Что НЕ синкается

- `assets/css/**` — целиком deployment-local
- `assets/js/**` — целиком deployment-local (исключение: точечный `--only=` sync для архитектурных модулей)
- `data/`, `config/project.php`, `config/llms-full.php` — уже исключены ранее
- `docs/sessions/`, `docs/proposals/`, `docs/README.md`, `docs/inventory/`, `docs/notes/`, `docs/orchestrator/` — уже исключены (ADR-0008)

## Consequences

### Положительные

- CSS-регресс по sync'ам прекращается — deployment-вёрстка стабильна.
- Контент-владелец / разработчик deployment не теряет свой стиль при каждом baseline-обновлении.
- Baseline orchestrator продолжает видеть паттерны через **commit-miner** (component-pattern) — секции которые часто правятся в нескольких deployments детектируются. Возможные extracts в `templates/components/` инициируются осознанно через proposal.

### Отрицательные

- Унификация фронта между deployments больше **не автоматическая**. Если в baseline пришла улучшенная версия `card-news.css`, в deployment'ы она не приедет без точечного sync. Это **намеренно** — каждый deployment имеет свой look-and-feel.
- Новый deployment через `distill init` получает baseline reference assets, но при первом sync'е они не передаются. Решается через `distill init` (копирует initial set baseline assets как стартовый код).
- Точечный sync (`--only=`) требует осознанного решения «какие assets унифицируются». Это нагрузка на orchestrator — должен подсказывать кандидатов через commit-miner component-pattern.

## Implementation

`tools/distill/distill.mjs::cmdSync`:

```js
const SKIP_PREFIXES = [
  // ...
  // Vёрсточные ассеты — deployment-specific целиком (ADR-0009).
  // Точечный sync доступен через --only=assets/js/components/X.
  'assets/',
  // ...
];
```

`distill --only=<prefix>` уже работает (см. cmdSync `--only=` arg). Он применяется **поверх** SKIP_PREFIXES — позволяет explicit pull конкретной подпапки даже если она в skip-list. (Уточнить в коде если нужно.)

## References

- Proposal: `docs/proposals/0009-css-js-deployment-local.md`
- Sessions: italy revert `9bf0d56` (23.05), повтор `5c2636a` (23.05), retry from 24.05.
- Memory: `feedback-assets-deployment-local` (после принятия)
