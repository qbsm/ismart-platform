# architecture

Эталонные архитектурные документы платформы — стратегические описания (статика), которые не меняются часто.

## Подпапки

- [`decisions/`](decisions/) — ADR (Architecture Decision Records), единый последовательный ряд

## Файлы

| Файл | Описание |
|---|---|
| [`platform-reference.md`](platform-reference.md) | Эталонная архитектура (Slim 4 + Twig + JSON-контент) |
| [`structure.md`](structure.md) | Схема файлов и папок проекта |
| [`distillation.md`](distillation.md) | Стратегия дистилляции (центральный документ) |
| [`config.md`](config.md) | Как устроена конфигурация |
| [`images.md`](images.md) | Обработка изображений + manifest-driven `<picture>` (ADR-0006, ADR-0007) |
| [`admin-requests-security.md`](admin-requests-security.md) | Безопасность форм |
| [`headings-hierarchy-check.md`](headings-hierarchy-check.md) | Семантическая иерархия H1-H6 |
| [`performance-metrics.md`](performance-metrics.md) | Перф-метрики |
| [`gallery-mobile-fallback.md`](gallery-mobile-fallback.md) | Поведение галереи на мобильных |
| [`workflow-orchestration.md`](workflow-orchestration.md) | Будущее n8n + Django (этапы 2-5) |

## Куда писать сюда

- Решения, требующие обоснования и альтернатив → `decisions/NNNN-*.md` (ADR)
- Эталонные описания архитектурных слоёв → отдельный `.md` в этой папке
- Что меняется регулярно или это how-to → `../guides/`
