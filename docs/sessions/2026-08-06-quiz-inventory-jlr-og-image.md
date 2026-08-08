# Сессия 2026-08-06 — Где стоит quiz + чужая og-картинка на chat.jlr.borishof.ru

Инвентаризация компонента `quiz` по всем проектам в `~/Sites` и починка превью ссылки
на `chat.jlr.borishof.ru`, где в og стояло фото чужого дилерского центра.

## Quiz: где он есть

Компонент — из старого стека (`dev/src/components/quiz` + `project/templates/parts/quiz.twig`),
все носители — форки одного репо `bitbucket:ismart-team/soueast-mb-belyaevo`. На платформе iSmart
(`ismart-platform` и её deployment'ы) quiz'а нет вообще.

Работает на проде (`<section class="quiz section">` присутствует в DOM):

| Сайт | Заголовок |
|---|---|
| chat.jlr.borishof.ru | «Узнайте, какие проблемы у вас с машиной» |
| service.altufievo-changanauto.ru | «Калькулятор сервисных услуг» |
| service.avtodom-gac.ru | «Калькулятор сервисных услуг» |
| service.borishof-haval.ru | «Калькулятор сервисных услуг» |

Есть в репо, но не отдаётся: `promo.avilongeely.ru` (`visible: false`),
`promo.soueast-mbb.ru` и `service.vlv-tul.ru` (домены не резолвятся; живой `vlv-tul.ru` без quiz),
`sollers-service` + `sollers-nevastar.ru-quiz` (две рабочие копии сайта «Звезда Невы Sollers»,
на живом `sollers-nevastar.ru` quiz'а нет).

Мёртвый груз (шаблон или папка картинок без контента): `solaris-krylatskoe.ru`,
`sollers-nevastar.ru`, `hyundai-service.borishof.ru`, `service-borishof-exeed.ru`,
`rabotazotman.ru`.

Метод проверки: наличие файла компонента ничего не доказывает — критерий это `"name": "quiz"`
с `visible: true` в `data/production/index-production.json` **и** секция в живом HTML.
Grep по `quiz` в HTML тоже врёт: слово встречается в критическом CSS даже там, где секции нет.

## chat.jlr.borishof.ru — превью ссылки показывало салон SOUEAST

`og:image` и `twitter:image` рендерились как `{{ origin }}/{{ dealers[0].cover }}`, то есть
`data/img/map/1.webp` — фото заснеженной площадки дилерского центра **SOUEAST** (вывеска в кадре),
md5 байт-в-байт совпадало с `promo.soueast-mbb.ru/data/img/map/1.webp`. При форке шаблона фото
дилера не заменили, и оно же уходило в превью. Плюс WebP 1280×960: Telegram превью с WebP
не рендерит — og-картинка обязана быть JPEG 1200×630.

Сайт целиком под `noindex` + `robots.txt Disallow: /`, поэтому «сниппет» здесь — превью ссылки
в мессенджере, не выдача.

Сделано на проде (`/var/www/ismart/chat.jlr.borishof.ru`, метод sel-local, ветка `php7`,
коммит `7a10142`, запушен в `github:qbsm/chat.jlr.borishof.ru`):

- `data/img/og.jpg` — 1200×630 JPEG, фасад JLR-центра БорисХоф (исходник — галерея дилера
  `borishof.ru/dealers/borishof-jaguar-land-rover-tsentr/`, кадр без чужого брендинга);
- `data/img/map/1.webp` — то же фото вместо SOUEAST (используется в карточке дилера на карте);
- `layout.twig` — `og:image`/`twitter:image` теперь `{{ ogImage|default(dealers[0].cover) }}`,
  `ogImage` добавлен в `globals` обоих JSON (`data/content/index.json` и
  `data/production/index-production.json` — рендер идёт из production-копии).

Проверено под UA `TelegramBot`: `og:image` → 200 `image/jpeg` 1200×630. Кэш превью в Telegram
для уже отправленных ссылок сбрасывается через @WebpageBot.

## Грабли

- Из галереи борисхофовского дилера не годятся кадры, где в кадр попадает чужая вывеска
  (`Rolls-Royce Motor Cars` в шоуруме, `INCHCAPE` на фасаде старого фото) — смотреть каждый кадр
  глазами, а не брать первый попавшийся.
- Локальная копия `~/Sites/chat.jlr.borishof.ru` сильно отстала от прода: og-разметки
  (коммит `89e8f83`) в ней нет вообще. Правки делались на sel, оттуда push.
- `git fetch`/`push` в этом каталоге — только `sudo -u promo`: у root нет deploy key.
