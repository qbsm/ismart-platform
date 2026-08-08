# 2026-08-03 — Фавиконы sales/service.bmw-avtoport.ru в Яндексе

## Запрос
Клиент сообщил, что фавиконов нет в выдаче Яндекса на `sales.bmw-avtoport.ru` и `service.bmw-avtoport.ru`.

## Метод проверки
1. HTTP-проверка `/favicon.ico`, `/favicon.png`, `robots.txt`, `sitemap.xml`, meta/X-Robots-Tag — включая запросы под UA `YandexBot` и `YandexFavicons`.
2. Реальное состояние в Яндексе — через сервис фавиконов:
   `https://favicon.yandex.net/favicon/v2/https://<домен>?size=32`
   Серая заглушка с текстом названия = Яндекс фавикон не знает. Контроли: `bmw-avtoport.ru` и `kumho-tires.ru` вернули настоящие иконки, значит метод валиден.
3. Визуальный просмотр всех иконок (апскейл до 160–256 px).

## Результат

### sales.bmw-avtoport.ru — фавикона в Яндексе НЕТ
`favicon.yandex.net` отдаёт серую заглушку «АВТОПОРТ».

Причины (по значимости):
1. **`robots.txt` на проде закрывает сайт целиком**:
   ```
   Disallow: /
   Allow: /favicon.ico
   ```
   Без директивы `User-agent:` — формально некорректная группа. Файл унаследован из FTP-снапшота старого сайта (коммит `1455ba4` «Import sales landing from avtoport.net»), никогда не правился. Без индексации сниппета нет → фавикона в выдаче нет.
2. `<link rel="icon" href="/favicon.ico?v=3">` — query-строка в URL иконки; часть роботов фавикон с query не забирает.
3. Сам `favicon.ico` валиден (ICO 16/32/48, логотип BMW), но выложен 28.07.2026 — Яндекс переобходит фавиконы 2 недели–месяц.
4. `sitemap.xml` — 404.

### service.bmw-avtoport.ru — фавикон в Яндексе ЕСТЬ, но мыльный
`favicon.yandex.net` отдаёт логотип BMW в низком качестве.

Причина: в HTML `<link rel="icon" href="/favicon.png">`, а `/favicon.png` — **PNG 16×16, 264 байта**. Яндекс рендерит 32×32 → апскейл. Рядом в корне лежит нормальный `/favicon.ico` (16/32/48), но он не подключён.

Прод-`robots.txt` — 404 (не задеплоен), поэтому индексация не блокирована. **Риск:** в репозитории `service` лежит тот же `Disallow: /` (коммит `f3a3174`); при полном деплое корня сайт повторит судьбу `sales`.

## Рекомендованные правки
`sales`: robots.txt → `User-agent: *` + `Allow: /` (+ `Sitemap:`) или удалить файл; убрать `?v=3` из href; добавить PNG 180–192 px и `apple-touch-icon`.
`service`: переключить `<link rel="icon">` на `/favicon.ico` (или пересобрать `favicon.png` в 192×192); robots.txt из репо на прод не деплоить; добавить `apple-touch-icon`.
После правок — переобход главной в Яндекс.Вебмастере; фавикон обновляется до месяца.

## Инфраструктура
Прод — masterhost, Apache, деплой по FTP. Стейджи: `/var/www/ismart/{sales,service}.bmw-avtoport.ru.ismart.pro`, репозитории `qbsm/sales.bmw-avtoport.ru`, `qbsm/service.bmw-avtoport.ru`.

Правки не вносились — только диагностика.
