# docs — документация iSmart Platform

Документация платформы организована по типам содержимого. Принцип: **разное живёт отдельно**.

## Структура

```
docs/
  architecture/                # стратегия, эталонные документы, ADR
    distillation.md              # стратегия дистилляции (центральный документ)
    platform-reference.md        # эталонная архитектура (Slim 4 + Twig + JSON-контент)
    structure.md                 # схема файлов и папок
    config.md                    # как устроена конфигурация
    images.md                    # обработка изображений
    admin-requests-security.md   # безопасность форм
    headings-hierarchy-check.md  # семантическая иерархия H1-H6
    performance-metrics.md       # перф-метрики
    workflow-orchestration.md    # будущее n8n + Django (этапы 2-5)
    decisions/                   # Architecture Decision Records (ADR)
      0001-static-utilities-vs-services.md
      0002-photoroom-out-of-baseline.md

  conventions/                 # как пишем код
    best-practices.md            # принципы (минимализм, type-safety, immutability)
    naming.md                    # PHP: имена классов/папок (Action/Service/Middleware/Support)
    html-naming.md               # HTML: классы, идентификаторы, атрибуты
    css-naming.md                # CSS: структура файлов, BEM-подобная схема, sections vs components
    js-naming.md                 # JS: селекторы, модули, глобальные объекты
    twig-naming.md               # Twig: секции, переменные, подключения
    json-naming.md               # JSON: структура страниц и data-файлов

  guides/                      # how-to и policies
    page-add.md                  # как добавить новую страницу
    seo-add.md                   # как добавить SEO для страницы
    local-setup.md               # локальная настройка
    deploy-checklist.md          # чек-лист релиза
    geo-strategy.md              # GEO для AI-поисковиков
    data-json-structure.md       # структура data/json/
    dependencies-policy.md       # как добавляются и обновляются зависимости
    backup-policy.md             # бэкапы
    content-versioning.md        # версионирование контента
    accessibility.md             # a11y чек-лист
    fonts-audit.md               # ревизия подключения шрифтов
    form-callback-plan.md        # план реализации формы обратной связи
    images-lazy-loading.md       # lazy-loading изображений
    logging.md                   # логирование (Monolog, JSON-формат)
    metrics-goals.md             # цели метрики/аналитики
    secrets-cicd.md              # секреты в CI/CD

  api/                         # API-контракты
    form-send.md                 # POST /api/send
    send-contract.md             # формат тела + ответа

  inventory/                   # автогенерируемые отчёты о текущем состоянии
    core.md                      # таблица ядра + статус во всех deployments (npm run distill:inventory)

  notes/                       # живой журнал
    improvements.md              # applied changes + open opportunities + patterns

  sessions/                    # ключевые моменты по сессиям работы
    2026-05-20-distillation.md   # дистилляция baseline из 3 проектов + CLI distill
```

## Когда что куда писать

| Тип записи | Куда |
|---|---|
| Новое архитектурное решение или эталон | `architecture/` (если стратегия) или `architecture/decisions/NNNN-*.md` (если ADR) |
| Снимок текущего drift / inventory | `inventory/` — генерируется CLI, не правится руками |
| Договорённость по стилю/нейму/тестам | `conventions/` |
| How-to: как сделать N в существующей платформе | `guides/` |
| API-контракт (request/response, headers) | `api/` |
| Заметка о найденном дубле или отложенной задаче | `notes/improvements.md` |
| Ключевые моменты длительной рабочей сессии | `sessions/YYYY-MM-DD-<topic>.md` |
| Архитектурное решение, требующее обоснования и альтернатив | новый ADR в `architecture/decisions/` |

## ADR (Architecture Decision Records)

Формат каждого ADR:

```markdown
# ADR-NNNN: <короткое имя решения>

**Status**: Accepted | Proposed | Superseded | Deprecated
**Date**: YYYY-MM-DD

## Context
<что заставило принимать решение>

## Decision
<что выбрали>

## Consequences
<плюсы и минусы>

## Alternatives considered
<какие варианты отвергли и почему>
```

Нумерация — последовательная (`0001`, `0002`, ...). При замене старого решения новый ADR ссылается на старый и помечает его `Superseded`.

## Корневые файлы (`/README.md`, `/CLAUDE.md`)

Остаются в корне репозитория, потому что это **точки входа**: README.md — для людей, CLAUDE.md — для Claude Code. Они короткие и ссылаются на `docs/` для деталей.
