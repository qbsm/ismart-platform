# GEO — стратегия оптимизации для AI-поисковиков

GEO (Generative Engine Optimization) — оптимизация контента для поисковых систем на базе больших языковых моделей (LLM): Google AI Overviews, Bing Chat, Perplexity, ChatGPT Search и др. Цель: чтобы AI могли находить, понимать и цитировать контент экосистемы.

## Принципы

1. **Доступность для краулеров** — AI-боты должны иметь доступ к страницам и к машиночитаемым описаниям (llms.txt, sitemap).
2. **Структурированные данные** — Schema.org JSON-LD (Organization, WebSite, BreadcrumbList, при необходимости — типы под проект: Restaurant, Product, FAQPage и т.д.) помогают LLM однозначно интерпретировать сущности.
3. **Цитируемость** — чёткие факты, структурированные блоки (таблицы, списки), формат «вопрос — ответ».
4. **Семантика** — иерархия заголовков (h1→h2→h3), теги `<article>`, `<section>`, `<address>`, `<time>`, атрибуты `lang`.
5. **Мета и заголовки** — уникальные, информативные `<title>` и `<meta name="description">` как первичный источник для понимания страницы.

## Реализовано в проекте

| Элемент           | Описание                                                                                                                                                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **llms.txt**      | `public/llms.txt` — краткое описание сайта, основные страницы, контакты.                                                                                                                                                                                                                 |
| **llms-full.txt** | `public/llms-full.txt` — расширенное описание сущностей (каталоги, разделы). **Конфиг:** `config/llms-full.php` (коллекции, поля). Ядро универсальное: под любой тип проекта (рестораны, каталог, события и т.д.). Обновление: `npm run generate-llms`.                                  |
| **robots.txt**    | Разрешены `/llms.txt` и `/llms-full.txt`; в комментариях перечислены AI-краулеры. При необходимости для отдельных ботов можно добавить блок с `Disallow: /`.                                                                                                                             |
| **sitemap.xml**   | Маршрут `GET /sitemap.xml` (`SitemapAction`) — список страниц из **config:** `settings['sitemap_pages']` (массив page_id). Ядро универсальное.                                                                                                                                           |
| **Schema.org**    | Organization, WebSite, BreadcrumbList (base.twig); FAQPage в JSON-LD (accordion.twig и блок «Часто задаваемые вопросы» на странице ресторана); **Restaurant** в JSON-LD на страницах ресторанов (`/{slug}/` → `pages/restaurant.twig`, данные из `data/json/{lang}/restaurants/*.json`). |
| **Мета и OG**     | Динамические title/description, Open Graph, Twitter Card, canonical, hreflang (см. base.twig).                                                                                                                                                                                           |

## Чеклист GEO (соответствует Roadmap в README)

- [x] Создать `public/llms.txt`
- [x] Создать `public/llms-full.txt` и скрипт генерации (`npm run generate-llms`)
- [x] Обновить `public/robots.txt` (AI-краулеры, Allow для llms)
- [x] Генерация `sitemap.xml` с учётом мультиязычности (`/sitemap.xml`)
- [x] JSON-LD Restaurant на страницах ресторанов (`/italy-bolshaya-morskaya/` и др.)
- [x] JSON-LD BreadcrumbList
- [x] FAQ в формате JSON-LD FAQPage (accordion.twig)
- [x] JSON-LD WebSite (SearchAction — при появлении поиска)
- [x] Цитируемость: факты и структурированные блоки (таблица часов, списки) на странице ресторана; Q&A — блок «Часто задаваемые вопросы» на странице ресторана (JSON-LD FAQPage) и аккордеоны на других страницах
- [x] Семантическая разметка: иерархия заголовков (h1→h2), теги `<article>`, `<section>`, `<address>` в restaurant.twig и секциях; атрибут `lang` — см. ниже
- [ ] **Периодически:** проверять видимость в AI-поисковиках (см. раздел «Периодические действия» ниже).
- [ ] **После изменений разметки:** валидировать JSON-LD (см. раздел «Периодические действия» ниже).

### Атрибут `lang` на контентных блоках

Язык страницы задаётся в `<html lang="{{ lang_code }}">`. Если на одной странице появляется контент на другом языке (цитата, термин, вставка на английском и т.п.), такой фрагмент нужно оборачивать в элемент с атрибутом языка, например: `<span lang="en">...</span>`. На текущей экосистеме каждая страница отдаётся на одном языке (версии по hreflang), поэтому явный `lang` на блоках нужен только при появлении смешанного контента.

### Периодические действия

- **Видимость в AI-поисковиках:** периодически (например раз в квартал) тестировать целевые запросы в Perplexity, Bing Chat, Google AI Overviews — проверять, цитирует ли AI сайт и насколько точно.
- **Валидация JSON-LD:** после каждого изменения разметки (добавление/правка типов Schema.org) проверять страницы в [Google Rich Results Test](https://search.google.com/test/rich-results) и [Schema.org Validator](https://validator.schema.org/).

**Опционально при появлении данных:** JSON-LD `Menu`/`MenuSection` для ресторанов — при появлении в `data/json/{lang}/restaurants/*.json` структурированного меню (например, `menu.sections[]` с `name` и `items[]` с `name`, `description`, `price`) добавить отдельный блок JSON-LD типа `Menu` с `hasMenuSection` → `MenuSection` → `MenuItem`. Пока в разметке Restaurant выводится только ссылка на меню (`menu` = URL из `menuLink`). JSON-LD `Review`/`AggregateRating` — при появлении полей `reviews[]` и/или `aggregateRating` (ratingValue, reviewCount, bestRating) в данных ресторана добавить вывод в JSON-LD Restaurant.

## Инструменты проверки

| Инструмент                                                              | Назначение                                                                                            |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [Google Rich Results Test](https://search.google.com/test/rich-results) | Проверка JSON-LD и расширенных результатов.                                                           |
| [Schema.org Validator](https://validator.schema.org/)                   | Валидация разметки Schema.org.                                                                        |
| Perplexity / Bing Chat / Google AI Overviews                            | Ручная проверка: ввод целевых запросов и оценка, цитирует ли AI сайт.                                 |
| Проверка llms.txt                                                       | Убедиться, что `https://ваш-домен/llms.txt` отдаётся как `text/plain` и содержит актуальное описание. |

## Универсальное ядро (без хардкода под тип проекта)

- **Sitemap:** список страниц задаётся в `config/settings.php` → `sitemap_pages` (массив page_id). Маршруты URL → page_id задаются в `route_map` (slug => page_id).
- **llms-full:** коллекции и поля задаются в `config/llms-full.php` (title, intro, collections). В каждой коллекции: `list_path`, `list_key`, `item_dir`, `name_key`, `desc_key`, `visible_key`, `fields` (label + key в dot-notation). Подходит для любых сущностей (рестораны, товары, события и т.д.).
- **llms.txt** — статический файл в `public/`; содержание можно менять под проект.

## Обновление llms-full.txt

После изменения данных в каталогах/файлах, указанных в `config/llms-full.php`, выполните:

```bash
npm run generate-llms
```

Скрипт: `php tools/ops/generate-llms-full.php`; вывод записывается в `public/llms-full.txt`. Языки берутся из `data/json/global.json` (поле `lang`).

## Ссылки

- Roadmap GEO: раздел «GEO (оптимизация для LLM)» в [README](../README.md).
- Конвенция llms.txt: [llms.txt](https://llmstxt.org/) — машиночитаемое описание сайта для LLM.
