# Инструкция по созданию SEO-метаданных для страниц

SEO в платформе строится **двумя путями**:

1. **Статический SEO** (большинство страниц) — JSON-файл `data/json/{lang}/seo/{page_id}.json`, читается `DataLoaderService::loadSeo()`. Этот документ описывает именно его.

2. **Динамический SEO для entity-страниц коллекций** (tire, news, restaurant, …) — через **`SeoBuilderRegistry` + builder per collection** (см. [ADR-0003](../architecture/decisions/0003-seo-builder-strategy.md)). См. раздел [Динамический SEO для entity-страниц](#динамический-seo-для-entity-страниц) ниже.

## Расположение файлов
SEO файлы находятся в директории: `data/json/ru/seo/`

Структура папок:
- `data/json/ru/seo/` — основные страницы сайта

## Типы SEO файлов

### 1. SEO для обычных страниц
Файлы создаются с именем, соответствующим slug страницы, например:
- `avtorskiy-nadzor.json`
- `landshaftnoe-proektirovanie.json`
- `team.json`
- `contacts.json`

## Динамический SEO для entity-страниц

Entity-страницы коллекций (`/catalog/at52/`, `/news/launch-2026/`, `/restaurants/atelier/`) не имеют статического `data/json/{lang}/seo/<slug>.json` — SEO строится **в runtime** из entity-данных через `SeoBuilderInterface`.

### Как это работает

```
URL /catalog/sport-sa-37
  ↓
PageAction::__invoke()
  ↓
DataLoaderService::loadEntity() → entity-данные
  ↓
SeoBuilderRegistry::get('tires') → builder для коллекции 'tires'
  ↓ (если не зарегистрирован — DefaultSeoBuilder)
$builder->build($entity, $baseUrl, $langCode, $config, $global) → SEO-массив
  ↓
SeoService::processTemplates() → render Twig-подстановки внутри SEO
  ↓
Twig базовый шаблон → meta-теги, JSON-LD в `<head>`
```

### Добавить кастомный builder для новой коллекции

#### 1. Создать класс `src/Service/<Entity>SeoBuilder.php`

```php
<?php
declare(strict_types=1);
namespace App\Service;

final class RestaurantSeoBuilder implements SeoBuilderInterface
{
    public function build(array $entity, string $baseUrl, string $langCode, array $config, array $global): array
    {
        $r = $entity['restaurant'] ?? [];
        $name = (string) ($r['name'] ?? $entity['slug'] ?? '');
        $desc = (string) ($entity['desc']['short'] ?? '');

        return [
            'title' => $name,
            'meta' => [
                ['name' => 'description', 'content' => $desc],
                ['property' => 'og:type', 'content' => 'restaurant'],
                ['property' => 'og:title', 'content' => $name],
            ],
            'json_ld' => [
                '@context' => 'https://schema.org',
                '@type' => 'Restaurant',
                'name' => $name,
                'address' => $r['address'] ?? null,
            ],
            'json_ld_faq' => null,
        ];
    }
}
```

#### 2. Зарегистрировать в `config/container.php`

```php
RestaurantSeoBuilder::class => \DI\autowire(),

SeoBuilderRegistry::class => static fn(ContainerInterface $c) => new SeoBuilderRegistry(
    [
        'restaurants' => $c->get(RestaurantSeoBuilder::class),
    ],
    $c->get(DefaultSeoBuilder::class),  // fallback для остальных коллекций
),
```

Ключ массива (`'restaurants'`) — имя коллекции из `config/project.php:collections.*`.

#### 3. Если не делать ничего — работает DefaultSeoBuilder

`DefaultSeoBuilder` использует `item.name`/`item.title` для `<title>` и `og:title`, `entity.desc.short` для description. Этого достаточно для базового SEO большинства коллекций (tires, products, services).

Кастомный builder нужен **только** если коллекция требует:
- Schema.org/JSON-LD per тип (Product, Restaurant, Article)
- FAQPage block
- Кастомных `og:type` (`product`, `article`, `restaurant`)
- Cover из специфичного поля entity (`covers[0]`, `gallery[0]`)

### Когда что использовать

| Сценарий | Как делать |
|---|---|
| Простая страница (about, contacts) | Статический `data/json/{lang}/seo/{slug}.json` |
| Entity без Schema.org (общая коллекция) | DefaultSeoBuilder автоматически |
| Entity со Schema.org (Restaurant, Product, Article) | Кастомный builder + Registry-binding |
| FAQ-блок на entity-странице | Builder возвращает `json_ld_faq` |

---

## Структура SEO файла

### Базовая структура
```json
{
  "name": "page-slug",
  "title": "SEO заголовок страницы",
  "h1": "H1 заголовок страницы",
  "meta": [
    {
      "name": "description",
      "content": "SEO описание страницы"
    },
    {
      "property": "og:url",
      "content": "https://example.com/page-url/"
    },
    {
      "property": "og:type",
      "content": "website"
    },
    {
      "property": "og:title",
      "content": "SEO заголовок страницы"
    },
    {
      "property": "og:description",
      "content": "SEO описание страницы"
    },
    {
      "property": "og:site_name",
      "content": "Студия"
    },
    {
      "property": "og:image",
      "content": "https://example.com/data/img/seo/og.webp?v=1"
    },
    {
      "property": "og:image:secure_url",
      "content": "https://example.com/data/img/seo/og.webp?v=1"
    }
  ]
}
```

### Описание полей

#### Основные поля
- **name** - идентификатор страницы, должен совпадать со slug страницы
- **title** - SEO заголовок, отображается в поисковой выдаче и во вкладке браузера
- **h1** - заголовок H1 на странице, обычно совпадает с основным заголовком из JSON страницы
- **meta** - массив мета-тегов для страницы

#### Иерархия заголовков (SEO и доступность)
- На каждой странице — **один `<h1>`** (главный заголовок страницы).
- Остальные заголовки секций — **`<h2>`**, подпункты — **`<h3>`**, без пропусков уровней (после h1 идёт h2, после h2 — h3).
- В данных страницы (JSON) для секций задаётся `heading.tag`: `"h1"` для главного заголовка страницы, `"h2"` / `"h3"` для подзаголовков. Декоративные подписи (например, в слайдере) могут использовать `"span"`.

#### Изображения (alt)
- У каждого контентного изображения должен быть осмысленный атрибут **alt** (описание для SEO и доступности).
- Декоративные изображения (иконки, фон, элементы оформления) должны иметь **alt=""** и при необходимости **role="presentation"**.
- В компоненте `picture.twig` alt задаётся параметром `alt` или полем `image.alt`; при вызове из JSON в объекте изображения указывается поле `alt`.

#### Обязательные мета-теги
- **description** - краткое описание страницы для поисковых систем (до 160 символов)
- **og:url** - полный URL страницы
- **og:type** - тип контента (`website` для страниц, `article` для статей)
- **og:title** - заголовок для социальных сетей
- **og:description** - описание для социальных сетей
- **og:site_name** - название сайта (всегда "Студия")
- **og:image** - изображение для социальных сетей
- **og:image:secure_url** - защищённый URL изображения

## Примеры для разных типов страниц

### 1. Обычная страница услуг
```json
{
  "name": "avtorskiy-nadzor",
  "title": "Авторский надзор за реализацией проекта | Студия",
  "h1": "Авторский надзор",
  "meta": [
    {
      "name": "description",
      "content": "Профессиональный авторский надзор за реализацией ландшафтного проекта. Сохраняем концепцию и качество от идеи до финальной посадки."
    },
    {
      "property": "og:url",
      "content": "https://example.com/avtorskiy-nadzor/"
    },
    {
      "property": "og:type",
      "content": "website"
    },
    {
      "property": "og:title",
      "content": "Авторский надзор за реализацией проекта | Company"
    },
    {
      "property": "og:description",
      "content": "Профессиональный авторский надзор за реализацией ландшафтного проекта. Сохраняем концепцию и качество от идеи до финальной посадки."
    },
    {
      "property": "og:site_name",
      "content": "Студия"
    },
    {
      "property": "og:image",
      "content": "https://example.com/data/img/seo/og.webp?v=1"
    },
    {
      "property": "og:image:secure_url",
      "content": "https://example.com/data/img/seo/og.webp?v=1"
    }
  ]
}
```

### 2. Каталожная страница
```json
{
  "name": "chastnye-sady",
  "title": "Частные сады - портфолио проектов ландшафтного дизайна | Company",
  "h1": "Частные сады",
  "meta": [
    {
      "name": "description",
      "content": "Портфолио частных садов студии Company. Скандинавские сады, авторские проекты ландшафтного дизайна для загородных домов."
    },
    {
      "property": "og:url",
      "content": "https://example.com/chastnye-sady/"
    },
    {
      "property": "og:type",
      "content": "website"
    },
    {
      "property": "og:title",
      "content": "Частные сады - портфолио проектов | Company"
    },
    {
      "property": "og:description",
      "content": "Портфолио частных садов студии Company. Скандинавские сады, авторские проекты ландшафтного дизайна для загородных домов."
    },
    {
      "property": "og:site_name",
      "content": "Студия"
    },
    {
      "property": "og:image",
      "content": "https://example.com/data/img/seo/og.webp?v=1"
    },
    {
      "property": "og:image:secure_url",
      "content": "https://example.com/data/img/seo/og.webp?v=1"
    }
  ]
}
```

## Правила заполнения

### SEO заголовки (title)
- Длина: 50-60 символов
- Включать ключевые слова
- Заканчивать названием студии: "| Company" или "| Студия"
- Быть уникальными для каждой страницы

### SEO описания (description)
- Длина: 120-160 символов
- Краткое и понятное описание содержимого страницы
- Включать основные ключевые слова
- Призывать к действию (где уместно)

### URL структуры
- **Главная**: `https://example.com/`
- **Услуги**: `https://example.com/service-name/`
- **Каталоги**: `https://example.com/category-name/`

### Open Graph изображения
- **По умолчанию**: `https://example.com/data/img/seo/og.webp?v=1`
- Размер: желательно 1200x630px
- Формат: WebP или JPG

### Специальные правила

#### Для услуг
- **og:type** всегда `"website"`
- **description** должно описывать суть услуги

## Соответствие с контентом

### Связь с JSON страницы
- **h1** из SEO должен совпадать с `heading.title` из promo секции страницы
- **og:image** при наличии обложки должен совпадать с `cover.src` из JSON страницы
- **name** должен совпадать с `name` или `slug` страницы

### Проверка качества
- SEO заголовки не должны дублироваться
- Описания должны быть уникальными
- URL должны быть корректными и доступными
- Изображения должны существовать по указанным путям

## Технические требования
- Валидный JSON формат
- Кодировка UTF-8
- Корректное экранирование кавычек
- Обязательная проверка синтаксиса перед сохранением
- Проверка доступности изображений
- Соответствие длины title и description рекомендациям 