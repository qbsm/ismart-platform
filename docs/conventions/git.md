# Git workflow и нейминг

## Ветки

| Префикс | Когда использовать | Пример |
|---|---|---|
| `feat/` | Новая функциональность | `feat/dealer-brand-logo`, `feat/cookie-policy-pdf` |
| `fix/` | Исправление бага | `fix/csp-font-data-uri`, `fix/sitemap-404` |
| `refactor/` | Рефакторинг без изменения поведения | `refactor/seo-strategy-pattern` |
| `chore/` | Технические правки, инфраструктура, обновление зависимостей | `chore/composer-update-2026-q2` |
| `docs/` | Только документация (без кода) | `docs/add-naming-conventions` |
| `distill/` | Платформенные ветки в `ismart-platform` | `distill/initial-baseline`, `distill/seo-strategy-unify` |

**Формат:** `<префикс>/<kebab-case-slug>`. Никакого CamelCase. Никаких подчёркиваний.

**Длина slug**: 2–4 слова. Если описание не помещается — это сигнал, что ветка делает несколько вещей.

**Запрещено**: ветки без префикса (`logo-fix`), ветки с именами фич без контекста (`fix1`, `update`), ветки с именами разработчиков (`danil-changes`).

## Коммиты

Формат — Conventional Commits:

```
<type>(<scope>): <короткое описание в lowercase>

<необязательное тело: что/почему/как тестировать>
```

### Типы

- `feat` — новая функциональность для пользователя.
- `fix` — bugfix.
- `refactor` — изменение кода без изменения поведения.
- `style` — форматирование, отступы (без логики).
- `docs` — только документация.
- `test` — добавление/правка тестов.
- `chore` — рутина: deps, build, CI, lockfile.
- `perf` — оптимизация производительности.
- `distill` — платформенные изменения (новый baseline, sync, manifest).
- `revert` — откат другого коммита.

### Scope

Чаще всего — имя модуля, файла или подсистемы: `(csp)`, `(seo)`, `(middleware)`, `(form)`, `(distill)`, `(env)`, `(gitignore)`. Можно пропустить, если изменение глобальное (форматирование всего проекта).

### Описание

- В нижнем регистре.
- В настоящем времени, не past tense: "add", не "added".
- Без точки в конце.
- На русском или английском — согласовано в рамках проекта. В `ismart-platform`/kumho/italy/beepitron — русский.

### Примеры (из реальной истории трёх проектов)

```
fix(csp): разрешить data: в font-src (превентивно, под swiper-icons bundle)
fix(env): createImmutable → createUnsafeImmutable
fix(csrf): пробросить csrf_token в шаблон
refactor(core): DRY-вытяжки + удаление Photoroom + lib.mjs для distill
test(support): unit-тесты для Arr, Json, PlatformSettings (29 тестов, 44 assertions)
distill: дистилляция baseline платформы из kumho-tires.ru
docs: перенос универсальных гайдов из italy + sessions/
chore(gitignore): не игнорировать корневые конфиги (webpack/postcss/eslint/vitest)
```

### Тело коммита

Используем для:
- Объяснения **почему** (если из заголовка неочевидно).
- Перечисления **что изменилось** при многострочных правках.
- Ссылок на issues / тикеты / ADR.

Заголовок ≤ 72 символа. Тело — wrapping вручную ≤ 100. Между заголовком и телом — пустая строка.

### Запрещено

- `Co-Authored-By: ...` (глобальное правило, см. `~/.claude/CLAUDE.md`).
- Коммиты с сообщениями `wip`, `fix`, `update`, `тест` — недостаточно информации.
- Коммиты, объединяющие несвязанные изменения. Один коммит = одна логическая правка.

## Pull requests

### Название

- Без префикса типа `feat:`. PR-tracking ориентируется на ветку.
- Краткое описание сути (≤ 72 символов).
- Можно: маркеры `[WIP]`, `[draft]` в начале.

### Тело PR

```markdown
## Summary

- 1–3 буллета: что изменилось, какая мотивация
- Ссылка на ADR/issue, если есть

## Test plan

- [ ] Локально: ...
- [ ] Staging: ...
- [ ] Regression: ...
```

Для PR'ов > 100 строк изменений или с архитектурным импактом — обязательно ссылка на ADR (новый или существующий).

### Размер

- Цель: < 200 строк изменения для review.
- Превышено — разбить на серию PR'ов (рефактор → фича → тесты).
- Исключение: автоматические правки (lock-файлы, форматирование) — отдельный PR с явным `chore(format)`.

## Tags / releases

- Формат: `vMAJOR.MINOR.PATCH` (semver).
- Платформенные релизы — в `ismart-platform`, не в deployments.
- Для отчётных snapshot'ов — суффикс: `legacy-archive-v0`, `pre-distillation-2026-05-20`.

## Merge стратегия

- В feature-ветки — `merge --ff-only` от target ветки.
- В `main` — squash merge или merge с pull-request'ом (зависит от проекта). Никогда не push --force в `main`.
- Для платформенных PR'ов: PR-merge через GitHub UI (не локальный merge), чтобы создалась PR-метка в истории.

## Git hooks

Активные:
- `husky` + `lint-staged` — pre-commit прогоняет linting/formatting для staged файлов.
- См. `.husky/` и `lint-staged` секцию в `package.json`.

Запрет: `--no-verify` (пропуск hook'ов). Если pre-commit hook падает — это сигнал, что нужно исправить, а не обойти.
