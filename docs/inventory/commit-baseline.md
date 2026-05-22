# COMMIT BASELINE — статистика коммитов sibling-deployments

Read-only ресёрч перед инвестицией в [`analyzers/commit-miner.mjs`](../architecture/orchestrator-role.md#7-commit-minermjs) — определяет, есть ли смысл строить классификацию коммитов без LLM.

**Окно:** последние 90 дней (отсчёт от 2026-05-21, т.е. с 2026-02-20).
**Метод:** `git log --since="90 days ago" --pretty=format:"%s"` + grep на Conventional Commits regex.
**Conventional Commits regex:** `^(feat|fix|chore|docs|refactor|test|style|perf|build|ci|revert)(\([^)]+\))?!?: `.

## Сводка

| Deployment | Total commits | Conventional | % Conv. | Commits trochaющих src/config/templates |
|---|---|---|---|---|
| `kumho-tires.ru` | 106 | 56 | **53%** | 56 |
| `italycommunity.ru` | 159 | 21 | **13%** | 74 |
| `beepitron.com` | 150 | 140 | **93%** | 98 |
| `trazano-tires.ru-v2` | 21 | 12 | **57%** | 13 |
| `mirage-russia.ru-v2` | 21 | 13 | **62%** | 13 |
| **Weighted total** | 457 | 242 | **53%** | 254 |

## Выводы

**Идти в commit-miner — да, но с двумя оговорками.**

1. **53% weighted Conventional** — выше критического порога (~30%, ниже которого классификация без LLM становится шумом). beepitron (93%) и trazano/mirage (57-62%) дают чистый сигнал; kumho (53%) — приемлемо; italy (13%) — **серьёзный gap**.

2. **italy = blind spot.** 159 коммитов / 13% Conventional → 138 non-Conventional коммитов, по которым commit-miner ничего не скажет в режиме CORE-hotfix detection. Без fallback'а italy исключается из observability. **Минимум для MVP:** при non-Conventional коммите помечать как `Convention violation` + опциональный keyword-fallback (`fix`, `update`, `hotfix` в теле).

3. **TOP темы дают конкретные recurring topics уже сейчас** — без analyzer'а, через `uniq -c`:

   | Deployment | TOP-3 темы за 90 дней |
   |---|---|
   | kumho | `fix:` ×18, `feat:` ×10, `chore:` ×10 |
   | beepitron | `sync(baseline)` ×5, `fix(seo)` ×5, `fix(strip)` ×4 |
   | italy | `sync(baseline)` ×4, `logoline` ×3, `fix(us)`/`fix(logos)`/`fix(header)` ×2 |
   | trazano | `sync(baseline)` ×3, `fix(twig)` ×2, `content` ×2 |
   | mirage | `sync(baseline)` ×3, `fix(twig)` ×2, `content` ×2 |

   Уже видно `sync(baseline)` как доминирующий scope — это маркер `distill sync`-операций. `fix(seo)` ×5 в beepitron — recurring topic, кандидат на `opportunities.md`.

4. **CORE-touching ratio высокий: 254/457 = 56%.** Больше половины всех коммитов трогают `src/config/templates`. Это значит mining не будет копаться в noise (CSS-mods, контент) — большинство коммитов потенциально интересны для baseline.

5. **trazano/mirage — почти зеркала.** Те же scope'ы (`sync(baseline)`/`fix(twig)`/`content`), те же доли. Подтверждает гипотезу о migration source — оба отпочкованы от kumho. **Любой `fix:` который в trazano появился — почти наверняка должен попасть и в mirage.**

## Дизайнные требования к commit-miner.mjs

Из inventory pass следует:

1. **Не классифицируем только по Conventional prefix** — слишком много пропустим (italy 87%). Дополнительно — keyword-match по telу (`fix`, `bug`, `hotfix`, `wip`).
2. **Per-deployment baseline** — для italy сразу слать `Convention violation` warning в health-report (TOP-finding для команды).
3. **Группировка по scope** — `fix(seo)` ×5 за 90 дней автоматически → opportunity. Порог = 3 повторения в одном scope в окне (90д).
4. **Кросс-deployment matching по scope+тексту** — `fix(twig)` в trazano + mirage = recurring. Это самый сильный сигнал для baseline.
5. **Игнорировать sync(baseline)** — это операции дистилляции, не контентные коммиты.
6. **Кэшировать `git log`** в `.distill/state.json :: commit_cache_until` — beepitron.com 3.7 GB, кросс-репо walk медленный.

## Следующий шаг

Перейти к `analyzers/commit-miner.mjs` MVP — категории `CORE-hotfix` / `Recurring topic` / `Convention violation` достаточно для первого прохода. `Reusable feature` / `Drift origin` / `CORE-refactor` — отложить до второго прохода (требуют AST или manifest.kind, которого пока нет).

## История

| Дата | Изменение |
|---|---|
| 2026-05-21 | Baseline собран. 53% weighted Conv., italy выбивается (13%), beepitron лидер (93%). |
