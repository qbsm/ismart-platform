# 2026-07-10 — Дистилляция foton-avilon (АВИЛОН FOTON)

Новый deployment promo-стека: **~/Sites/foton-avilon** — промо-сайт дилера АВИЛОН по бренду FOTON
(коммерческий транспорт: пикапы TUNLAND G9/V7/V9, фургоны TOANO PRO/VIEW, грузопассажирский TOANO).
Форк от promo.havalpro-avilon.ru, свежий git init, первый коммит `19db1c7`.

**Прод-домен не определён** — рабочее имя `foton-avilon` (без выдуманных доменов), локально
`foton-avilon.test`. Детальный журнал — в самом деплойменте:
`~/Sites/foton-avilon/docs/sessions/2026-07-10-distillation-foton-avilon.md`.

Ключевое для платформы (кандидаты в паттерны promo-стека):
- **Зачёркивание цены** в `card-model.twig` сделано условным (`<s>` только при `model.monthly`) —
  форки без кредитной программы показывают обычную «Цена от X ₽». Кандидат на distill sync в havalpro/wey/avatr.
- **Деплой без вебшрифтов**: убраны fonts-async.css/preload — вариант «системная гарнитура» стоит
  оформить как штатный путь скаффолда (Foton/брендбуки с Arial).
- Извлечение контента с сайтов на антибот-JS: Playwright + AutomationControlled off + обычный UA
  (foton-mbrus.ru отдаёт пустую статику, весь контент клиентский).
- Фид наличия Foton (foton-mbb.ru, XML c ценами/VIN/опциями) — кандидат на секцию «В наличии» promo-стека.
