# Сессия 2026-05-24 — Аудит JSON на соответствие текущей kumho-архитектуре

Запрос: «проверь что все json на текущей архитектуре kumho-styled и если нет приведи к нему». kumho — источник дистилляции → эталон. Проверка по всему стеку (kumho, italy, beepitron, doublestar-v2, mirage-v2, trazano-v2 + baseline).

## Что проверено

**1. raw-source v2 для image-объектов (ADR-0007) — самая свежая kumho-архитектура JSON-контента.** Прогон идемпотентного `tools/migrate/json-to-raw-paths.js --dry-run` в каждом репо: **0 переписанных по ВСЕМ** (kumho 53, italy 30, beepitron 176, doublestar 51, mirage 35, trazano 35, baseline 3 файла). → формат картинок (`{400,800,...}` → raw-путь / `{src,alt}`) уже консистентен везде. ✅

**2. Корневой `name` (json-naming.md §1/§3).** kumho: `name`=pageId во всех pages + страничных seo (`{name,title,meta}`). tire-v2 + baseline: `name` **отсутствовал** во всех pages и страничных seo (был только дисплейный `title`). Движок терпит (breadcrumb fallback `title ?? name`), но это отклонение от конвенции и kumho.

## Что сделано

Добавлен `name`=pageId первым ключом (точечная вставка, остальное байт-в-байт, идемпотентно, `title` сохранён) — **57 файлов**:
- pages: doublestar 12, mirage 8, trazano 8, baseline 1 = 29
- страничные seo: doublestar 11, mirage 8, trazano 8, baseline 1 = 28

Исключены 6 per-entity seo-файлов trazano (`seo/radial-h188.json` и пр.) — фильтр «есть соответствующий `pages/{stem}.json`».

italy + beepitron — `name` уже везде, не трогались.

## Verify (рантайм)

`php -S … --noproxy '*'` (локальный HTTP-прокси отдаёт ложный 503):
- doublestar: `/`, `/about`, `/catalog` (65859 bytes — листинг шин), `/technology`, `/company`, `/actions`, `/contact` — все **200, 0 ошибок**.
- mirage `/` 200, trazano `/` 200 — 0 ошибок.
- Формат: `{"name":"about","title":"О нас","sections":[…]}` — `name` первым, как у kumho.

## Отклонения от kumho, НЕ изменённые автоматически (валидны / больший риск — на отдельное решение)

| Отклонение | Где | Почему не трогал |
|---|---|---|
| slug-источник совмещён с листинг-страницей (`nav_slug==list_page_id`, `items` в корне) vs kumho-разделение (`pages/{nav}.json={items}` ⟂ `pages/{list}-list.json`) | doublestar/mirage/trazano | движок поддерживает оба (ADR-0004 + `slugs_page` опциональны), рендерится корректно |
| per-entity seo-файлы `seo/{tire}.json` | trazano (6 шт.) | kumho генерит entity-SEO динамически (нет таких файлов); удаление деструктивно — это кастомный контент |
| legacy globals-ключи `header`/`footer` (архетип-B) | doublestar global.json | требует синхронной правки header/footer-шаблонов — отдельная задача |
| section-data shapes (intro `slides` vs `slider`+`heading`; footer-data) | tire-v2 | контент/дизайн per-deployment, не архитектурный конверт |

## Не закоммичено

Правки локальные в 4 репо (3 deployment + baseline), без commit/push.
