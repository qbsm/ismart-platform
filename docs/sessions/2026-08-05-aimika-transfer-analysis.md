# Сессия 2026-08-05 — Что берём в платформу из aimika-neiro-global

Разведочная сессия: разбор соседнего проекта `~/Sites/aimika-neiro-global` (AIMIKA Global) на предмет решений, переносимых в iSmart Platform. Кода не меняли — итог в виде списка кандидатов.

## Что за проект

TS-монорепо (npm workspaces): Next.js 14 app router + Prisma/Supabase + Upstash Redis + Cloudflare R2 + Stripe + Resend. `packages/core` (каталог инструментов, провайдеры ИИ, энергия/лимиты/расходы), `packages/db` (Prisma), `apps/web` (~300 файлов, 40 lib-модулей, 41 API-роут), `apps/bot` (grammy). Документация: `architecture/` (11 нумерованных доков), `plans/` (~50 планов с фазами), `idea/`, `business/`.

Стек несовместим с нашим (PHP/Slim/Twig), поэтому переносим **решения и паттерны**, не код. Автотестов в проекте нет вообще — наш гейт `npm run verify` + смоук сильнее, при заимствовании практик это не терять.

## Кандидаты (по убыванию ценности для нас)

**CSP-allowlist вместо `https:`.** Наш `SecurityHeadersMiddleware::DEFAULT_CSP` разрешает `script-src 'self' 'unsafe-inline' https:` — это любой сторонний скрипт с любого домена; нет `object-src 'none'`, `frame-ancestors 'self'` вместо `'none'`. У них (`apps/web/next.config.mjs`) — явный allowlist (`frame-src`/`form-action` только Stripe), `object-src 'none'`, `frame-ancestors 'none'`. Для нас: CSP как параметр deployment'а с allowlist аналитики (Метрика, CallTouch, GTM, виджеты) + `object-src 'none'`.

**Rate limit: пересобрать хранилище.** Наш `RateLimitMiddleware` — фиксированное окно, read→write без блокировки на чтении, файл на каждый IP в `cache/rate_limit/` без сборки мусора (директория растёт бесконечно). У них `apps/web/lib/rate-limit.ts` — один интерфейс, основной бэкенд (sliding window) + fallback, `Retry-After`, честный комментарий о допустимой гонке в fallback. Взять: скользящее окно, gc старых файлов, блокировку на весь цикл, ключ IP+форма.

**Ретеншн и удаление ПД.** Формы собирают ПД и рассылают в 4 канала; срока хранения и чистки нет нигде, `docs/architecture/admin-requests-security.md` описывает несуществующие `ApiRouter`/`RequestsViewerController` (единственные упоминания в репо — сам док устарел). У них `plans/2026-07-27-security-hardening.md` Ф2/Ф3: срок хранения одной константой, `purgeExpired()` не удаляет строки, если не удалились файлы, чек-лист безопасности разделён на «закрыто» и «открыто». Для нас: ADR о хранении заявок/логов/вложений + актуализация дока.

**Крон-эндпоинты fail-closed.** `apps/web/app/api/cron/finalize-pending/route.ts`: без `CRON_SECRET` роут закрыт для всех, сравнение секрета в постоянное время, секрет в заголовке (в `?key=` только как запасной вариант — попадает в логи прокси), сам крон — серверный бэкстоп для задач, которые клиент не доделал. Применимо к фид-парсерам деплойментов (sollers/cm.expert) и любому HTTP-крону.

**SSRF-safe HTTP-клиент.** `apps/web/lib/fetch-url.ts`: резолв всех A-записей и отсев приватных диапазонов (включая 169.254.169.254), проверка на каждом редиректе (`redirect: manual`), таймаут, лимит байт, проверка content-type. Кандидат в `src/Support/` поверх `symfony/http-client` — как только появится интеграция, где URL приходит извне.

**AI-слой как порт (задел под Django/агентов).** `packages/core/src/providers/index.ts` — выбор провайдера по env, mock по умолчанию, деградация с предупреждением вместо падения (ровно наш `isEnabled() → disabled`); `app/model-registry.ts` — курируемый набор моделей с ценой и `recommended`, failover-цепочка; `apps/web/lib/spend-guard.ts` — суточный потолок расходов из env, аварийный порог с письмом (молчаливый рубильник = загадочная поломка).

**Защита от prompt-injection.** `apps/web/lib/community-ai.ts`: чужой текст в рамке со случайным маркером + `defuse()` (вырезает маркеры и подделки служебных префиксов), но главный рубеж — валидация вывода `replyRejectionReason()` (ссылки, домены, разметка, упоминания). Понадобится, если на публичных страницах появится ИИ-текст.

**Storage-порт с `remove()`.** `packages/core/src/app/storage.ts`: интерфейс save/remove, адаптеры локальный диск / S3, `keyFromUrl()` с белым списком формата ключа. Актуально, когда вложения форм начнут оседать у нас.

**Процессное.** План-документ с фазами и финальным блоком «СТАТУС: ГОТОВО → что поймал цикл проверки → проверено на живой базе → осталось»; аудит с severity и явным разделом «НЕ вошло (осознанно)»; handoff-док «что готово и пошаговый план запуска».

## Не берём

Prisma/Supabase/Vercel/Upstash/Stripe/R2-специфику, энергетическую экономику и тарифы, community/UGC с модерацией, docgen/deckgen (DOCX/PDF/PPTX), кабинет фрилансера, центр обучения (у нас JSON-контент закрывает это).

## Открытые вопросы

- Оформлять ли CSP-allowlist и rate limit как ADR или как записи в `docs/notes/improvements.md`.
- Нужен ли платформе ретеншн-крон в ядре или это deployment-специфика (у части деплойментов заявки нигде не оседают).
