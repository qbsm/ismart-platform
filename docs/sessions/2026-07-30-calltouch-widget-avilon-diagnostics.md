# 2026-07-30 — Виджет CallTouch на CTA не открывается (Авилон): диагностика

## Симптом

На части лендингов Авилона клик по CTA перестал открывать виджет обратного звонка CallTouch.
Подмена номеров при этом работает везде. Первичная гипотеза — регрессия от удаления
виджета «Автогороскоп» (акция «Звезды рекомендуют» закончилась 29.07).

## Разделение сайтов (подтверждено автопрогоном и вручную)

| сайт | counter (`CALLTOUCH_CLIENT_ID`) | ключ виджета | виджет |
|---|---|---|---|
| promo.tank-avilon.ru | `mr1mmkvw` | `promotion1` (хардкод) | **нет** |
| promo.avilon-changanauto.ru | `432uwb79` | `callback` (хардкод) | **нет** |
| promo.havalpro-avilon.ru | `k1apih77` | `callback` (appConfig) | **нет** |
| promo.foton-avilon.ru | `4c96d6ds` | `callback` (appConfig) | да |
| promo.havalavilon.ru | `f3xs8emn` | `callback` (appConfig) | да |
| promo.sollers-avilon.ru | `8g4fcl4s` | `callback` (appConfig) | да |
| promo.moskvich-avilon.ru | `akwkrzmo` | `callback` (хардкод) | да |
| promo.wey-avilon.ru | `4t0hh7ji` | `callback` (хардкод) | да |
| sales.avatr-avilon-moscow.ru | `tee930la,hukyocph,38ill904` | `callback` (хардкод) | да |

## Гороскоп не при чём

Реверты гороскопа прошли 30.07 11:11–15:30 на пяти сайтах: changanauto (`5dd2b1f`),
havalavilon (`e622eec`), havalpro (`a0a02c9`), avatr (`bab265d`), foton (`bbf336a`).
Диффы затрагивают только `public/goroskop/*`, блок гороскопа в `base.twig`, баннеры интро
и `index.json` — ни строки с `calltouch`/`analytics.twig`.

Корреляция не сходится: гороскоп был на 3 из 6 рабочих сайтов, а **tank сломан, хотя
гороскопа там не было никогда**. Остатков `#horoscope` в живом HTML нет, CTA ведут
на `#modalCallback`, `git status` чистый.

## Причина — сторона кабинета CallTouch

Для счётчиков `mr1mmkvw`, `432uwb79`, `k1apih77` конфиг `d_client_new.js` содержит только
`init_matcher_replacement` (подмена номеров). Модуль виджетов
(`mod.calltouch.ru/front/init-widget.js`) не подгружается вообще, поэтому
`ct('modules','widgets','openExternal', KEY, cb)` не вызывает колбэк.

Чистый эксперимент: на домене каждого сайта отдавалась минимальная страница **только**
со счётчиком CallTouch, без нашего `main.js` и `analytics.twig`:

```
counter    init-widget  openExternal        факт на сайте
mr1mmkvw   false        TIMEOUT             не работает
432uwb79   false        TIMEOUT             не работает
k1apih77   false        TIMEOUT             не работает
4c96d6ds   true         {"error":false}     работает
f3xs8emn   true         {"error":false}     работает
4t0hh7ji   true         {"error":false}     работает
akwkrzmo   true         {"error":false}     работает
8g4fcl4s   true         {"error":false}     работает
```

Поведение воспроизводится без нашего JS → код сайтов ни при чём.

**Виджет привязан к конкретному счётчику.** У avatr три счётчика, и виджет живёт только
на третьем:

```
tee930la   init-widget=false  openExternal=TIMEOUT
hukyocph   init-widget=false  openExternal=TIMEOUT
38ill904   init-widget=true   openExternal={"error":false}
```

Сайт работает потому, что `analytics.twig` инжектит все три счётчика из
`CALLTOUCH_CLIENT_ID` (значение разбивается по запятой в `config/settings.php`).

## Заявки не теряются

На всех трёх сломанных сайтах клик открывает встроенную модалку `form-callback`
(проверено визуально — «Получить предложение» на tank, «Заказать звонок» на havalpro),
а `CT_ENABLE=true` в `.env` — серверный канал `CallTouchChannel` доставляет лид в кабинет.
Откат в `modal.js` срабатывает по `catch`, консольных ошибок нет.

## Что делать

Запросить в кабинете CallTouch id счётчика, к которому привязан виджет обратного звонка
для TANK / Changan / Haval Pro, и дописать его в `CALLTOUCH_CLIENT_ID` через запятую
(паттерн avatr). Правки в коде не требуются.

## Серверный канал: проверен живыми заявками

Коды ошибок API `widget-service/v1/api/widget-request/user-form/create`:
`10013` — некорректный номер (проверяется ПЕРВЫМ, поэтому «пустышкой» ключ не проверить),
`10003` — нет активных виджетов с указанным ключом, `403 Invalid credentials` — битый токен.

Живая отправка (номер владельца, `utm_source=ismart-diagnostics`):

| сайт | routeKey | результат |
|---|---|---|
| promo.tank-avilon.ru | `volg_tank` | **200**, `widgetRequestId=242839778` |
| promo.havalpro-avilon.ru | `volg_haval-pro` | **200**, `widgetRequestId=242839780` |
| promo.avilon-changanauto.ru | `volg_changan` | **400**, `10003` — заявки теряются |

Та же ошибка `10003` на changan лежала в логе от 22.06 — то есть канал там мёртв
минимум с июня. Перебраны и отклонены варианты ключа: `changan_volg`, `izm_changan`,
`changan_izm`, `izmailovo_changan`, `changan_izmailovo`, `changan_izmaylovo`,
`volg_changanauto`, `changanauto_volg`, `changan`, `avilon_changan`. Нужен актуальный
ключ из кабинета.

Важно: активность виджета для серверного API и для фронтового `openExternal` — **разные
сущности**. На tank и havalpro серверный канал работает, хотя виджет на странице не
открывается.

E2E через реальную форму (`POST /api/send` с csrf, поле согласия — `policy=on`) на tank:
`{"channels":{"mail":"failed","calltouch":"warning",...}}`. Warning у CallTouch —
«Превышен лимит минимального интервала между отправкой заявок по номеру телефона»,
то есть следствие моего же теста минутой ранее, а не поломка.

## Сделано: CTA открывают модалку сразу

В течение сессии на прод приехал `fix(lead): CTA не молчат, когда виджета CallTouch нет
в кабинете` — ожидание `#CalltouchWidgetFrame` с откатом на форму. Кнопки перестали
молчать, но открывались с паузой: замер (headless, клик сразу после загрузки) дал
1962 / 2075 / 1203 мс на tank / changan / havalpro.

Поверх добавлен флаг `CT_WIDGET_ENABLED = false` в `assets/js/components/modal.js` —
попытка виджета снимается целиком, пока он не активирован в кабинете:

| репозиторий | коммит |
|---|---|
| qbsm/promo.tank-avilon.ru | `9f66281` |
| qbsm/promo.avilon-changanauto.ru | `710585a` |
| qbsm/promo.havalpro-avilon.ru | `489253a` |

После деплоя (`git pull` + `npm run build:js` от пользователя `promo`) задержка
191 / 211 / 129 мс при клике сразу и 21–106 мс при прогретой странице. Модалка проверена
визуально на changan и havalpro. Вернуть виджет — переключить флаг в `true`.

Деплой на этом сервере: пулить нужно **от пользователя `promo`** (`sudo -u promo -H bash
-lc "cd … && git pull --ff-only && npm run build:js"`). Ключ root'а — deploy key только
для `promo.sollers-avilon.ru`, на остальные репозитории он даёт `Repository not found`;
ключ `promo` авторизуется как аккаунт `qbsm` и видит все.

## Почта сломана на всех сайтах сервера

`MAILER_DSN=smtp://localhost:25` у всех, локальный MTA отдаёт сертификат
`CN=autoconfig.ismart.pro` → Symfony Mailer при STARTTLS сверяет имя с `localhost`:

```
Unable to connect with STARTTLS: stream_socket_enable_crypto():
Peer certificate CN=`autoconfig.ismart.pro' did not match expected CN=`localhost'
```

В логах `italycommunity.ru` эта ошибка идёт весь июль — проблема давняя, не от тестов.
Перебор транспортов на проде:

```
smtp://localhost:25                 FAIL (cert CN mismatch)
smtp://localhost:25?verify_peer=0   OK
smtp://autoconfig.ismart.pro:25     FAIL (550 Sender address rejected)
sendmail://default                  FAIL (connection closed)
```

Починка — `MAILER_DSN=smtp://localhost:25?verify_peer=0`. Соединение локальное, наружу
трафик не идёт, проверка имени ни от чего не защищает. Правка `.env` на проде в этой
сессии заблокирована классификатором — применяет владелец.

Это же значение стоит поправить в `.env.dist`/шаблоне деплоймента, иначе баг
воспроизводится на каждом новом сайте.

## Отдельная находка (не связана с виджетом)

Серверный канал отправки заявок в кабинет выключен на четырёх сайтах —
`CT_ENABLE=false`, пустые `CT_ROUTE_KEY`/`CT_TOKEN`: foton, havalavilon, wey, sollers.
`.env` датированы 21.07 / 25.06 / 29.07, то есть токены там не прописывали изначально.
Также на wey полностью отсутствует Яндекс.Метрика.

`MAIL_TO` на сайтах Авилона ведёт на ящики iSmart (`leads@ismart.pro`,
`danil.fedorovich@ismart.pro`), Telegram и Google Sheets выключены. То есть при мёртвом
канале CallTouch дилер заявку не получает вообще.

Логи в проде пишутся от WARNING (`APP_ENV=production`), поэтому успешные отправки
(`INFO "CallTouch: заявка отправлена"`) не видны — отсутствие свежих логов ≠ отсутствие
проблем.
