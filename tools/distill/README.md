# tools/distill — file-level tracking между baseline и deployments

CLI для отслеживания того, какие файлы дрейфуют между `ismart-platform` (canonical baseline) и production deployments (`kumho-tires.ru`, `italycommunity.ru`, `beepitron`).

Подробная стратегия — [`docs/architecture/distillation.md`](../../docs/architecture/distillation.md).

## Команды

```bash
# Построить manifest baseline'а (.distill/manifest.json)
npm run distill:scan

# Сгенерировать сводную таблицу ядра по всем deployments
npm run distill:inventory   # → docs/inventory/core.md

# Сравнить baseline с конкретным deployment'ом
npm run distill -- diff ../kumho-tires.ru
npm run distill -- diff ../italycommunity.ru --limit=10
npm run distill -- diff ../beepitron --no-unique

# Краткий статус по всем известным deployments (kumho/italy/beepitron)
npm run distill -- status

# Помощь
npm run distill -- help
```

## Файлы

| Файл | Назначение |
|---|---|
| `distill.mjs` | Основной CLI: `scan`, `diff`, `status` |
| `build-inventory.mjs` | Генератор `docs/inventory/core.md` — детальная таблица ядра + статус во всех deployments |

## Алгоритм

1. **`scan`** обходит всё дерево baseline'а, исключая `node_modules`, `vendor`, `cache`, `logs`, `data/img`, бинарные медиа (`.webp`, `.png`, `.ttf` и т.д.), и пишет `{path → {sha256, size}}` в `.distill/manifest.json`.

2. **`diff <deployment>`** строит такой же manifest для deployment'а и сравнивает:
   - `identical` — hash совпадает
   - `drifted` — путь совпадает, hash другой
   - `unique-to-deployment` — путь есть только в deployment'е
   - `missing-in-deployment` — путь есть в baseline, нет в deployment'е

3. **`build-inventory.mjs`** дополнительно вытягивает первое описание из PHPDoc/JSDoc/Twig-комментария каждого файла и пишет markdown-таблицу с классификацией (`CORE ✓` / `CORE drift` / `partial` / `BASELINE-only`).

## Roadmap

MVP (этап 1) — реализован: `scan`, `diff`, `status`, `build-inventory.mjs`.

Этап 2 (после ревью docs/inventory/core.md):

- `sync <deployment>` — pull-from-baseline для `CORE` файлов, с интерактивным подтверждением каждого.
- `propose <deployment> <file>` — push-to-baseline (создаёт patch + git-branch + PR).
- `mark-override <deployment> <file> <reason>` — пометить файл как deployment-specific.
- `init <slug>` — создать новый deployment из baseline'а.

## Где смотреть результат

- `.distill/manifest.json` — manifest baseline'а (создан `scan`).
- `docs/inventory/core.md` — таблица ядра с описаниями и статусами.
