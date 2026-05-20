# Структура data/json и примеры

Краткое описание каталогов и формата данных. При росте проекта можно добавить JSON Schema для валидации.

## Каталоги

| Путь                            | Назначение                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `data/json/global.json`         | Глобальные настройки: языки (`lang`), навигация (`nav`), контакты (`phones`, `email`), тексты форм, cookie, соцсети и т.д.                                 |
| `data/json/{lang}/pages/`       | JSON страниц по `page_id` (index, contacts, policy, agree, restaurants-list, 404). Каждый файл задаёт `name`, `sections` (массив секций с `name`, `data`). |
| `data/json/{lang}/seo/`         | SEO-данные по `page_id`: `title`, `meta` (массив `{name                                                                                                    | property, content}`), опционально `json_ld`. |
| `data/json/{lang}/restaurants/` | Данные сущностей (в текущем проекте — рестораны). Список slug'ов задаётся в `pages/restaurants.json` (`items`).                                            |

## Пример: global.json (фрагмент)

```json
{
  "lang": [{ "title": "Русский", "code": "ru", "direction": "ltr" }],
  "nav": {
    "ru": { "items": [{ "title": "Главная", "href": "/" }] }
  },
  "phones": [{ "title": "+7 (000) 000-00-00", "href": "tel:+70000000000" }]
}
```

## Пример: страница (pages/index.json)

```json
{
  "name": "index",
  "sections": [
    {"name": "header", "visible": true, "data": {}},
    {"name": "intro", "visible": true, "data": {"slider": {...}}}
  ]
}
```

## Пример: SEO (seo/index.json)

```json
{
  "name": "index",
  "title": "Заголовок страницы",
  "meta": [
    { "name": "description", "content": "Описание" },
    { "property": "og:title", "content": "..." }
  ]
}
```

## Валидация

- Сейчас: скрипт `npm run validate-json` проверяет, что все JSON-файлы в `data/json` валидны (синтаксис).
- При росте проекта: можно описать схему (JSON Schema) для `global.json` и для страниц (`sections`, обязательные поля) и добавить проверку в CI или в `validate-json`.
