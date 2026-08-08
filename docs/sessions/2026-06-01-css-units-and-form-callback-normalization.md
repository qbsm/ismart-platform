# 2026-06-01 — check:css-units, подтяжка пропозалов из tank, внедрение ADR-0010 (form-callback naming)

## Контекст

Сессия в canonical baseline. Три блока работ: (1) новая build-команда проверки
единиц CSS, (2) подтяжка пропозалов из deployment'а `tank-avilon` + анализ его
session-логов на фичи для дистилляции, (3) внедрение последнего пропозала танка
(0016 — нормализация нейминга `form-callback`).

## 1. `npm run check:css-units`

Новый чекер `tools/build/check-css-units.js` (PostCSS) — enforcement
`docs/conventions/css-naming.md` §4: layout-свойства блоков → `rem`, `font-size` → `em`.
Исключения: нулевые значения, проценты, безразмерные, `var()/calc()`, корневой
якорь `html/:root { font-size: 10px }`. Сканирует `assets/css/**` кроме `build/`,
принимает опциональный путь (для прогона по deployments) и флаг `--warn`.

Решение по интеграции (по запросу пользователя): команда **в `check`, но не в `build`**.
Вынес прежний набор в `check:base`; `check` = `check:base` + `check:css-units`;
`build` завязан на `check:base` (css-units на сборку не влияет). Та же команда
зеркалирована в `tank-avilon` (там `check:css-units` стоит с `--warn`).

Прогон: baseline — 133 нарушения в 17 файлах; tank-avilon — 58 в 18 (унаследованный
дрейф px/em/rem в hero/partners/trust/form-callback/tires). Чистка — отдельным заходом.

## 2. Пропозалы из tank → baseline

Подтянуты отсутствовавшие 0011–0015 + 0016 (общие 0001–0010 идентичны). Все —
core/convention-scoped, написаны из танк-деплоймента.

Анализ session-логов + `docs/local/plan.md` танка (агентом) выделил кандидатов на
дистилляцию (реализации живут в танке, в baseline пока только спецификации
пропозалов): маска телефона +7 (0014), LCP-фиксы `TemplateDataBuilder` (0013),
conditional Yandex Maps, configurable `schema_type` (AutoDealer/LocalBusiness),
fallback-фейсы шрифтов + GPU-слои анти-jank (0013), GLightbox async-чанк, конвенция
vendor-prefixes (0015). Deployment-specific (оставить в танке): ленивый 360-вьювер,
удаление мёртвого CSS. **Не внедрялись в этой сессии** — только зафиксированы как очередь.

Висячие ссылки в подтянутых пропозалах: `docs/conventions/css-vendor-prefixes.md`
и два session-лога танка отсутствуют в baseline (0015 ещё не дистиллирован).

## 3. ADR-0010 — нормализация нейминга form-callback

Внедрён proposal 0016: `block__element--modifier` (kumho-наследие) → standalone-классы
по конвенции. Карта: `__control--select/textarea` → `.__control.control-*`,
`__field--checkbox/full/rules/submit` → `.__field.field-*`. Блок-модификатор
`--inline` в baseline отсутствовал.

Затронуто 3 файла: `assets/css/components/form-callback.css` (селекторы),
`templates/components/form-callback.twig` (по два класса на узле),
`assets/js/components/form-callback/ui.js:207` (строка className error-баннера).
JS по `--`-классам не селектил (только базовые `.__field`/`.__control` + `.error`) —
поведение не задето.

Lifecycle: proposal 0016 → Status `Accepted → ADR-0010`; создан
`docs/architecture/decisions/0010-form-callback-naming-normalization.md`; индекс
decisions/README обновлён (добавлены 0009, 0010 — отставал).

### Verify

- `npm run build:css` / `build:js` — успешно;
- `npm run lint:css` — 0 ошибок (новые `.element.modifier` валидны);
- `vitest` — 21/21;
- grep: `--`-модификаторов в исходниках компонента не осталось, новые селекторы корректны.
- **Ограничение:** в canonical baseline нет страницы, рендерящей `form-callback`
  (форму используют deployments, dataset baseline — только `index`), поэтому
  визуальный runtime-прогон формы выполнится на ближайшем distill sync в deployment
  с формой. Локальный `php -S` подтвердил `/` → 200 (через `--noproxy '*'`: системный
  proxy перехватывал localhost и отдавал 503).

## Дальше

- Чистка css-units нарушений (baseline 133) с рендер-проверкой; затем вернуть
  `check:css-units` в blocking при готовности.
- Дистилляция остальных кандидатов из п.2 (по решению пользователя, пофайлово, с verify).
- Sync ADR-0010 в deployments (`kumho-tires.ru` и др.) — по явному запросу.
