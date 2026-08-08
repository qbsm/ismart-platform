# 2026-07-21 — Дистилляция промо-посадки Sollers Авилон

## Задача
Создать посадочную страницу официального дилера **SOLLERS** (АО «Авилон», ДЦ Белая Дача, Котельники) на промо-стеке iSmart. Домен `promo.sollers-avilon.ru`. Светлая гамма. Референсы «нашей» версии — `sollers-nevastar.ru`, `sollers-cargo.ru`.

## Что сделано
Форк `promo.foton-avilon.ru` → `~/Sites/promo.sollers-avilon.ru` (rsync без .git/node_modules/cache/logs), свежий `git init`, первый коммит (976 файлов, ветка master).

- **Тема:** светлая (механика по havalpro), акцент — фирменный оранжевый SOLLERS `#f47c30` (источник — `sollers-nevastar.ru/dev/src/assets/brands/sollers/variables.css`). `assets/css/base/variables.css` переписан.
- **Бренд/контакты:** `data/json/global.json` — SOLLERS / «Sollers Авилон», адрес «Котельники, Белая Дача, Коммерческий пр-д, 10», coords `55.649518,37.835236`, юрлицо/телефон/соцсети базово от Авилон (foton). Логотипы SOLLERS сгенерированы из `brand-logo-color-2.svg` Невы (color/black/white/vertical), favicons скопированы из Невы.
- **9 моделей** — генератор `scratchpad/gen-models.js` (шаблон foton × данные Невы) собрал `models/`+`pages/`+`seo/` для: sp7, st9, sf1, sf5-van-l2h1, sf5-van-l3h2, atlant-gruzpass, atlant-van-l3, atlant-van-l3h2, argo. Реальные спеки/цены/цвета для SP7/ST9/SF1 — из `sollers-nevastar.ru/project/data/production/models/*.json`.
- **Колор-пикер** = штатный `deg360` при `countImages360:1`, для всех моделей с цветовыми изображениями. Реальные рендеры Невы разложены в `data/img/range/{model}/360/{color}/1.webp`: SP7 (5 цветов), SF1 (6), ST9 (2). Argo/Atlant/SF5 — `360/default/1.webp` (одиночное фото).
- **Конфигуратор РАЗМЕРОВ** (уточнение пользователя: «конфигуратор размеров, а не цветов; колор-пикеры для всех, у кого есть изображения») — селектор модификации (база/крыша/тип: L2H1/L3H2, Грузопассажирский/VAN L3/VAN L3H2) через `grades`-dropdown `deg360`. Цель: SF5 (L2H1/L3H2) и Atlant (3 модификации) как единые страницы с селектором размера. **Пока не собран** — нужны габариты по модификациям (таблица УТП) + фото вариантов; механика движка готова.
- **Главная** `pages/index.json` + `seo/index.json` — переписаны под SOLLERS (intro, runline, range с 9 моделями, actions, profits, finance, faq).
- **Прочее ядро:** `config/project.php` (sitemap_pages), `.env` (APP_BASE_URL=promo.sollers-avilon.ru.test, MAIL_*), `robots.txt`, `CLAUDE.md`, favicons.twig, зачистка всех остаточных `foton`-вхождений в data/config/templates.

## Ключевой нюанс (pitfall)
`deg360.js` запрашивает кадры по адресу `360/{color}/{644|1280}/{n}.webp` (размер = ширина контейнера × DPR). `npm run build:images` ресайзит **только** `raw/`-папки — 360-кадры вне `raw/` не сайзились → 404 при переключении цвета. Foton держит sized-варианты 360 закоммиченными рядом с мастером. Сгенерировал `644/` и `1280/` варианты для всех 360-кадров sharp-скриптом (38 файлов). **На будущих `npm run build` эти варианты не регенерируются** — они закоммичены как ассеты (как в foton).

## Верификация
- `validate-json` — 38 файлов ОК; сборки `build:critical/css/js/images` — зелёные.
- Локально (Valet parked `~/Sites`) все маршруты 200: `/`, все 9 моделей, `/contacts`.
- Браузер (playwright): главная (хедер, лого SOLLERS, оранж, адрес Белая Дача, модельный ряд 9 табов), страница SP7 — конфигуратор рендерит реальный минивэн, 5 свотчей, переключение цвета работает (`black/1280/1.webp`), console 0 errors после фикса 360-размеров.

## Ожидается от пользователя (TODO)
1. Таблица УТП + ежемесячные лизинговые платежи (вставить в модели/секции — сейчас цены есть только для SP7/ST9/SF1 из Невы, остальные «Цена по запросу»).
2. Реальные фото SF5 (сейчас временная заглушка = рендер SF1 white) — «фото на один ресурс».
3. Брендбук с Я.Диска `disk.yandex.ru/d/1Q6WqLFVNCZ0iA`: веб-шрифты TT Commons Pro (сейчас фолбэк Arimo), вертикальный логотип, заглушки.
4. Счётчик Яндекс.Метрики (сейчас `YANDEX_METRIC_ID=0`), реальный телефон/почта ДЦ Sollers Авилон.
5. Создать GitHub-репо `qbsm/promo.sollers-avilon.ru` и запушить (сейчас только локальный коммит, remote не заведён).

См. память `project_sollers_avilon_deployment`.

## 2026-07-22 — доводка темы + конфигуратор модификаций

**Фиксы светлой темы** (наследие тёмного foton поверх светлого havalpro): лого в шапке → чёрные варианты во все слоты (как havalpro); intro-плашки → светлое стекло; бургер/header reduced-motion → var(--glass-bg); галочка бенефитов card-model → белая на оранжевом круге (была белая на прозрачном); разделитель лого → тёмный; button-3 → тёмный графит (в палитре SOLLERS color-3==color-9, кнопки сливались). Изображения FOTON в actions/finance (6 шт., проверены глазами — TUNLAND и фургоны Foton) → лайфстайл SOLLERS из Невы.

**Конфигуратор «как на Неве»** — новый компонент платформенного стиля:
- `templates/components/card-model.twig`: при `model.configurations` вместо deg360 рендерится блок `.configurator` (табы модификаций + обложка + опц. базы + JSON в `<script class="js-configurator-data">`); хуки `js-configurator-price`/`js-configurator-chars`.
- `assets/js/components/configurator.js` (vanilla, onReady): таб → обложка+цена+базы+характеристики; база → обложка+характеристики. Схема данных = nevastar (configurations[{slug,title,price,cover,bases[],characteristics[]}]).
- `assets/css/components/configurator.css`: табы-пилюли (active = оранж), базы — подчёркнутые пилюли.
- **Pitfall:** raw-source платформы разворачивает `data/img`-пути в JSON моделей в АБСОЛЮТНЫЕ URL — в JS нельзя оборачивать их window.url() повторно (было задвоение base → 404).

**Группировка ряда 9→6:** SP7, ST9, SF1 (колор-пикеры) + SF5 (VAN L2H1/L3H2), Atlant (Грузопассажирский/VAN L3/VAN L3H2), Argo (тент/рефрижератор/промтоварный) — конфигураторы. Redirects старых слагов в config/redirects.json.

**Данные SF5 — с ПРОДА Невы** (`ssh root@ismart.pro`, бот-коммиты не в GitHub): `models/sf5.json` с реальными характеристиками баз L2 (5650/2405, 9,7 м³) и L3 (5990/2675, 12,4 м³) + рендеры cmf/cmf-l3/gruzopass/bus/prom + галерея. Atlant/Argo — обложки вариантов из Невы (просмотрены глазами: m-atlant-01=ЦМФ, 06-02=грузопасс, 06-03=высокая крыша; argo tent/refrigerator/plakmetall), характеристики каркасные до УТП.

Верификация: все 7 маршрутов 200, переключение SF5 L2H1→L3H2 в браузере меняет обложку (1280, loaded) и спеки (5 650→5 990), console чист. Коммиты dadd0f5, aa91cc2.

## 2026-07-22 (2) — масштабы карточек + ревизия изображений

По опыту WEY/havalpro из docs.ismart.pro (правило: «фит — только CSS: object-fit contain + --deg360-scale/origin/shift, не обрезкой картинок»):
- `.configurator__item.cover-wrap` приведён к геометрии `deg360__stage` (24rem/34rem, aspect 2.2/1 на xs, белый стенд, radius) — конфигураторные карточки были 213px высоты против 340px у deg360.
- В twig конфигуратора проброшены `--configurator-scale/origin/shift-x/y` из model.scale/objectPosition/offsetX/offsetY (симметрично deg360). SP7 scale 1.12.
- Все 6 карточек просмотрены скринами — соразмерны.

**Ревизия изображений** (скрипт: все img-url из HTML 8 страниц × curl): было 36 битых → 0 из 391.
- 26 × `/1280/` галерей и обложек: build:images не апскейлит (<1280w исходники) — по WEY-конвенции raw приведены к ≥1280w (29 файлов sharp'ом).
- favicon-16/32/android-chrome-96 (ждёт favicons.twig) сгенерированы из невского icon.png.
- Заодно: ST9 — «Пикап с двойной кабиной» (рендер — пикап; описание ошибочно звало фургоном, перенос с невских спеков).

Коммит ca8fd1f (после 62053cb).
