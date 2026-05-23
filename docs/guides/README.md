# guides

How-to и policy документы — как сделать конкретную задачу в платформе. Прочитал — знаешь шаги.

## Категории

### Базовые операции

- [`page-add.md`](page-add.md) — добавить новую страницу
- [`seo-add.md`](seo-add.md) — добавить SEO для страницы
- [`local-setup.md`](local-setup.md) — локальная настройка окружения
- [`deploy-checklist.md`](deploy-checklist.md) — чек-лист релиза (включая `build:images` шаг, ADR-0006/0007)

### Контент

- [`data-json-structure.md`](data-json-structure.md) — структура `data/json/`
- [`content-versioning.md`](content-versioning.md) — версионирование контента
- [`images-lazy-loading.md`](images-lazy-loading.md) — lazy-loading изображений
- [`fonts-audit.md`](fonts-audit.md) — ревизия подключения шрифтов

### Политики

- [`dependencies-policy.md`](dependencies-policy.md) — как добавляются и обновляются зависимости
- [`backup-policy.md`](backup-policy.md) — бэкапы
- [`secrets-cicd.md`](secrets-cicd.md) — секреты в CI/CD
- [`logging.md`](logging.md) — логирование (Monolog, JSON-формат)
- [`metrics-goals.md`](metrics-goals.md) — цели метрики/аналитики

### Прочее

- [`accessibility.md`](accessibility.md) — a11y чек-лист
- [`geo-strategy.md`](geo-strategy.md) — GEO для AI-поисковиков
- [`form-callback-plan.md`](form-callback-plan.md) — план реализации формы обратной связи (legacy, см. ADR-0005)

## Куда писать сюда

How-to: «как сделать X», «как настроить Y» — отдельный `.md` в этой папке. Если документ описывает правило — `../conventions/`. Если архитектурное решение — ADR.
