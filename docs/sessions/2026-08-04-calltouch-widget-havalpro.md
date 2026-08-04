# 2026-08-04 — Haval Pro: вместо виджета CallTouch открывается модалка сайта

## Симптом

На `promo.havalpro-avilon.ru` клик по CTA открывает встроенное окно «Заказать звонок»,
а не виджет обратного звонка CallTouch. На соседних лендингах Авилона открывается виджет.

## Причина — наш флаг, оставшийся от обхода 30.07

В `assets/js/components/modal.js` стоит `const CT_WIDGET_ENABLED = false` (havalpro `489253a`,
tank `9f66281`, changan `710585a`). Флаг ставился 30.07, когда виджет не был подключён к
счётчикам в кабинете и CTA впустую ждали `#CalltouchWidgetFrame` до 2 секунд
(см. `2026-07-30-calltouch-widget-avilon-diagnostics.md`). С флагом попытка виджета снимается
целиком: клик всегда идёт в откат — модалку `form-callback`.

Остальные лендинги (foton, havalavilon, sollers, moskvich, wey, avatr) этого флага не получали —
их `modal.js` зовёт `openExternal` сразу, поэтому у них открывается виджет.

## Кабинет к 04.08 виджет активировал

Живая проверка headless-браузером на реальных доменах: `mod.calltouch.ru/front/init-widget.js`
грузится на **всех** девяти лендингах, `ct('modules','widgets','openExternal', KEY, cb)`
отвечает `{"error":false}` — включая три «сломанных» 30.07 счётчика.

| сайт | counter | ключ | openExternal | флаг в modal.js | что открывается |
|---|---|---|---|---|---|
| promo.havalpro-avilon.ru | `k1apih77` | `callback` (env) | `{"error":false}` | **`false`** | модалка сайта |
| promo.tank-avilon.ru | `mr1mmkvw` | `promotion1` (хардкод) | `{"error":false}` | **`false`** | модалка сайта |
| promo.avilon-changanauto.ru | `432uwb79` | `callback` (хардкод) | `{"error":false}` | **`false`** | модалка сайта |
| promo.foton-avilon.ru | `4c96d6ds` | `callback` (env) | `{"error":false}` | нет | виджет |
| promo.havalavilon.ru | `f3xs8emn` | `callback` (env) | `{"error":false}` | нет | виджет |
| promo.sollers-avilon.ru | `8g4fcl4s` | `callback` (env) | `{"error":false}` | нет | виджет |
| promo.moskvich-avilon.ru | `akwkrzmo` | `callback` (хардкод) | `{"error":false}` | нет | виджет |
| promo.wey-avilon.ru | `4t0hh7ji` | `callback` (хардкод) | `{"error":false}` | нет | виджет |
| sales.avatr-avilon-moscow.ru | `tee930la,hukyocph,38ill904` | `callback` (хардкод) | `{"error":false}` | нет | виджет |

Ключ по-прежнему привязан к сайту: `promotion1` на havalpro/havalavilon даёт
`NOT_FOUND`, на tank — `{"error":false}` (там же и `callback` работает).

Клик по «ЗАКАЗАТЬ ЗВОНОК» на havalpro: `#CalltouchWidgetFrame` остаётся свёрнутой трубкой
112×112, поверх открывается `#modalCallback`. На foton/sollers тот же клик разворачивает
фрейм на весь вьюпорт (1440×900) — это форма виджета, модалка не открывается.

## Прочие расхождения в настройках (не влияют на виджет)

Серверный канал `CallTouchChannel` (`CT_ENABLE`/`CT_ROUTE_KEY`/`CT_TOKEN`) по-прежнему выключен
на foton, havalavilon, sollers, wey — заявка с этих сайтов в кабинет не уходит, только на почту
iSmart. На havalpro/tank/changan/moskvich/avatr канал включён. Находка от 30.07 не закрыта.

`CALLTOUCH_CALLBACK_WIDGET_ID` вынесен в `.env` только у havalpro, foton, havalavilon, sollers;
у tank, changan, moskvich, wey, avatr ключ захардкожен в `modal.js`.

## Сделано: виджет вернули на все три сайта

`CT_WIDGET_ENABLED` выпилен из `modal.js` — попытка виджета снова живёт, откат на модалку
остаётся страховкой.

| репозиторий | commit |
|---|---|
| qbsm/promo.havalpro-avilon.ru | `1e95386` |
| qbsm/promo.tank-avilon.ru | `d0d3c56` |
| qbsm/promo.avilon-changanauto.ru | `b6efab7` |

## Второй баг: ранний клик по CTA молчал

После возврата виджета замер по времени клика показал дыру: клик в первые ~3 секунды
не открывал ни виджет, ни модалку. Причина — `#CalltouchWidgetFrame` появляется в DOM
нулевого размера за ~2.5с и разворачивается в трубку 112×112 только к ~5с; вызов
`openExternal` в этом промежутке — тихий no-op (в консоли `openExternal not found`,
колбэк не приходит), а наш код считал наличие фрейма признаком готовности.

Готовностью теперь считается ненулевой размер фрейма, плюс сторож на колбэк (1с):
молчание виджета уводит на модалку. Коммиты `0c78e79` / `a7d20c8` / `fa1b347`.

Замер после выката (клик через N секунд после загрузки, headless):

| клик | havalpro | tank | changan |
|---|---|---|---|
| 1с | модалка через 1.4с | виджет | модалка |
| 3с | виджет | виджет | виджет |
| 7с | виджет | виджет | виджет |

Виджеты у всех трёх — брендированные формы кабинета (Haval Pro «Оставьте заявку»,
TANK «выгода до 850 000 ₽», Changan «Ваш Changan с максимальной выгодой»), проверено
скриншотами.

## Прод разошёлся с GitHub

На всех трёх сайтах в проде лежит коммит, которого нет в origin: `fix(preview): session_start
без cache_limiter` (`282ae68` / `0d2a27e` / `6281ed3`, правит `src/Action/ApiSendAction.php`
и `src/Action/PageAction.php`) — почерк автономного бота, который чинит деплойменты прямо
на сервере и не пушит. Поэтому `git pull --ff-only` там невозможен: фиксы доставлены
`git cherry-pick` от пользователя `promo`. Расхождение осталось — его надо разобрать
отдельно (пуш прод-коммитов в origin либо ребейз).
