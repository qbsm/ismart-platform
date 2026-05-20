# Гайд: миграция legacy-boilerplate → ismart-platform (полная инструкция)

**Цель**: по этой инструкции пройти от существующего legacy-сайта (trazano/mirage и т.п.) до полностью работающего deployment на baseline-архитектуре. Линейный путь, без вилок «или-или».

**Ключевое решение**: все секции переписываются на **baseline-стиль** (Slim 4 + Twig 3 + `{data.*}` параметры). Legacy-twig (`{{root}}{{path}}` + globals `models`/`brand`) **не используем** — это даёт постоянные конфликты, доказано опытом.

**Время**: 4-8 часов на проект, в зависимости от объёма контента и количества brand-specific секций.

---

## 0. Pre-requisites

```bash
# Проверка окружения
php --version       # ≥ 8.5
node --version      # ≥ 18
composer --version  # ≥ 2.5
git --version

# Проверка baseline
ls ~/Sites/ismart-platform/tools/distill/distill.mjs   # должен быть
```

**Переменные** (заменить под свой проект, использовать в дальнейшем):

```bash
# Внутри baseline:
PLATFORM=~/Sites/ismart-platform

# Legacy-проект, который мигрируем:
LEGACY=~/Sites/<slug>.ru        # например ~/Sites/trazano-tires.ru
NEW=~/Sites/<slug>.ru-v2        # например ~/Sites/trazano-tires.ru-v2

# Имя бренда и slug
SLUG=<slug>                     # например trazano-tires.ru
BRAND_NAME="<Brand Display>"    # например "TRAZANO Tyres"
DEV_DOMAIN=$SLUG-v2.test        # например trazano-tires.ru-v2.test
```

---

## 1. Pre-migration audit (10 мин)

Цель: понять что переносить, прежде чем создавать новый проект.

```bash
cd $LEGACY

# Структура контента
ls project/data/content/                              # JSON-страницы и seo.json
ls dev/src/components/ | head -20                     # legacy-секции (компонентный подход)
ls dev/src/pages/                                     # 10-20 страниц

# Brand-палитра (ОБЯЗАТЕЛЬНО проверить)
cat dev/src/assets/brands/*/variables.css

# Шрифты
find dev/src/assets/css/fonts -name "*.css" | head    # @font-face декларации
find project/assets/fonts -type f                     # реальные woff2 файлы

# Изображения (объём)
du -sh project/data/img/

# globals в index.json
python3 -c "import json; d=json.load(open('project/data/content/index.json')); print(list(d.get('globals',{}).keys()))"
```

**Что записать на бумажке:**

- Brand-цвета (значения `--color-3`, `--color-4`, `--color-5`)
- Шрифт-семейство (Gilroy / Futura PT / другое; CDN или локальные)
- Список страниц (`about, articles, buy, catalog, contacts, ...`)
- Количество entity'ов (моделей шин, статей)
- URL-схема (`/catalog/`, `/articles/`, `/buy/{city}/`)

---

## 2. Bootstrap нового deployment (5 мин)

```bash
cd $PLATFORM

# Создать sibling-каталог с CORE baseline
npm run distill -- init $SLUG-v2 \
  --name "$BRAND_NAME" \
  --domain $SLUG

cd $NEW

# Фикс баги distill init: MAIL_SUBJECT_PREFIX с brackets
sed -i '' 's|^MAIL_SUBJECT_PREFIX=\[.*\]|MAIL_SUBJECT_PREFIX="['"$BRAND_NAME"']"|' .env

# Dev-URL вместо production
sed -i '' "s|^APP_BASE_URL=.*|APP_BASE_URL=http://$DEV_DOMAIN/|" .env
sed -i '' "s|^APP_ENV=.*|APP_ENV=development|" .env

# Install
composer install --no-dev --optimize-autoloader
npm install
mkdir -p logs cache

# Smoke baseline
npm run build:dev
php -S 127.0.0.1:8080 -t public &
sleep 1
curl -sI http://127.0.0.1:8080/health | head -1   # ожидаем HTTP/1.1 200
kill %1
```

---

## 3. Brand assets (15 мин)

### 3.1 Цвета (`assets/css/base/variables.css`)

Возьми из `$LEGACY/dev/src/assets/brands/<brand>/variables.css` все brand-vars и положи в новый файл:

```bash
cat > $NEW/assets/css/base/variables.css <<'CSS'
:root {
  /* Brand colors (из legacy dev/src/assets/brands/<brand>/variables.css) */
  --color-1: #fff;
  --color-2: #000;
  --color-3: <BRAND-ACCENT>;   /* пример: #f39910 для TRAZANO, #EEB136 для Mirage */
  --color-4: <BRAND-SECONDARY>;
  --color-5: <BRAND-DARK>;
  --color-6: hsla(0, 0%, 50%, 1);
  --color-7: hsla(0, 0%, 90%, 1);

  /* Font families (Gilroy / Futura PT / другое — из того же brand variables.css) */
  --font-default: 'BlinkMacSystemFont', -apple-system, 'Helvetica Neue', sans-serif;
  --font-1-light:     '<FontFamily>-Light', var(--font-default);
  --font-1-regular:   '<FontFamily>-Regular', var(--font-default);
  --font-1-book:      '<FontFamily>-Regular', var(--font-default);
  --font-1-medium:    '<FontFamily>-Medium', var(--font-default);
  --font-1-demi:      '<FontFamily>-Semibold', var(--font-default);
  --font-1-semibold:  '<FontFamily>-Semibold', var(--font-default);
  --font-1-bold:      '<FontFamily>-Bold', var(--font-default);
  --font-1-extrabold: '<FontFamily>-ExtraBold', var(--font-default);
  --font-1-heavy:     '<FontFamily>-Heavy', var(--font-default);
  --font-num: var(--font-1-bold);

  /* z-index (legacy-схема: меньше число = выше) */
  --z-index-1: 1000; --z-index-2: 990; --z-index-3: 980; --z-index-4: 970;
  --z-index-5: 960;  --z-index-6: 950; --z-index-7: 940; --z-index-8: 930;
  --z-index-9: 920;  --z-index-10: 910;

  /* Shadows, overlays, layout */
  --overlay-1: hsla(0, 0%, 7%, .4);
  --shadow-1: 0 1px 6px hsla(0, 0%, 7%, .7);
  --shadow-2: 0 1px 6px hsla(0, 0%, 7%, .4);
  --shadow-3: 0 8px 36px 2px #f3f5f8;
  --root-padding: 2rem;
  --container-max-width: 144rem;
  --radius-1: 0.4rem;
  --transition-1: 0.3s ease;
}
CSS
```

### 3.2 Шрифты (`assets/css/base/fonts.css`)

**Вариант CDN** (Gilroy у TRAZANO):

```css
@font-face {
  font-family: 'Gilroy-Light';
  src: url('https://static.ismart.pro/fonts/gilroy/Gilroy-Light.woff2') format('woff2');
  font-display: swap;
}
/* ...повторить для Regular, Medium, Semibold, Bold, ExtraBold, Heavy */
```

**Вариант локальные** (Futura PT у Mirage):

```bash
mkdir -p $NEW/assets/fonts/<family>
cp $LEGACY/project/assets/fonts/<family>/*.woff2 $NEW/assets/fonts/<family>/

# fonts.css с локальными путями
cat > $NEW/assets/css/base/fonts.css <<'CSS'
@font-face {
  font-family: '<FontFamily>-Light';
  src: url('../../fonts/<family>/<family>-light-webfont-<hash>.woff2') format('woff2');
  font-display: swap;
}
/* ... */
CSS
```

### 3.3 Типография (`assets/css/base/typography.css`)

Универсальная (kumho-стиль + крупные размеры):

```css
html { font-size: 10px; }
* { font-size: 1em; }

body, input, select, textarea {
  font-size: 1.6rem;
  font-family: var(--font-1-regular);
  line-height: 1.4;
  color: var(--color-2);
  @media (--lg) { font-size: 1.8rem; }
}

h1, h2, h3, h4, h5, h6, .heading, .title {
  margin-block: 0;
  font-family: var(--font-1-medium);
  line-height: 1.2;
}

h1, .h1 { font-size: 2.4em; @media (--lg) { font-size: 4em; } }
h2, .h2 { font-size: 2em;   @media (--lg) { font-size: 3em; } }
h3, .h3 { font-size: 1.6em; @media (--lg) { font-size: 2.2em; } }
h4, .h4 { font-size: 1.4em; @media (--lg) { font-size: 1.8em; } }
h5, .h5 { font-size: 1.2em; @media (--lg) { font-size: 1.4em; } }
h6, .h6 { font-size: 1.05em; @media (--lg) { font-size: 1.2em; } }

b, strong { font-family: var(--font-1-medium); }
p { margin: 0 0 1em; }
a { color: inherit; text-decoration: none; }

.font-1-light    { font-family: var(--font-1-light); }
.font-1-regular  { font-family: var(--font-1-regular); }
.font-1-medium   { font-family: var(--font-1-medium); }
.font-1-bold     { font-family: var(--font-1-bold); }
.weight-400 { font-family: var(--font-1-regular); }
.weight-500 { font-family: var(--font-1-medium); }
.weight-700 { font-family: var(--font-1-bold); }
.uppercase  { text-transform: uppercase; }
.opacity-70 { opacity: 0.7; }
.opacity-50 { opacity: 0.5; }
.nowrap     { white-space: nowrap; }
```

### 3.4 Логотипы

```bash
mkdir -p $NEW/data/img/ui/logos
# Найди brand-logo* SVG в legacy:
find $LEGACY/project/data/img -name "*logo*" -name "*.svg"

# Скопируй (имена под baseline-схему):
cp $LEGACY/project/data/img/ui/<brand-logo-color>.svg $NEW/data/img/ui/logos/logo-h-color-1.svg
cp $LEGACY/project/data/img/ui/<brand-logo-color-dark>.svg $NEW/data/img/ui/logos/logo-h-color-2.svg
cp $LEGACY/project/data/img/ui/<brand-logo-vertical>.svg $NEW/data/img/ui/logos/logo-v-color-1.svg
# Аналогично logo-v-color-2.svg

# UI-иконки (опционально)
cp $LEGACY/project/data/img/ui/*.svg $NEW/data/img/ui/ 2>/dev/null
```

### 3.5 Изображения контента

```bash
# Полный rsync без --info=stats0 (macOS rsync 2.6.9 не поддерживает)
rsync -a $LEGACY/project/data/img/ $NEW/data/img/

# Проверка
find $NEW/data/img -type f | wc -l         # должно быть >50
du -sh $NEW/data/img

# Если cover.webp отсутствует у entity'ев — создать из 1.webp
for d in $NEW/data/img/models/*/; do
  [ ! -f "$d/cover.webp" ] && [ -f "$d/1.webp" ] && cp "$d/1.webp" "$d/cover.webp"
done
```

---

## 4. Контент: global.json (5 мин)

`data/json/global.json` — глобальные данные для всех страниц.

```bash
cat > $NEW/data/json/global.json <<'JSON'
{
  "lang": [
    { "title": "Русский", "code": "ru", "direction": "ltr" }
  ],
  "phones": [
    { "title": "<PHONE-TITLE>", "href": "tel:<PHONE-HREF>" }
  ],
  "email": "<email@domain>",
  "nav": {
    "ru": {
      "items": [
        { "title": "О нас", "href": "/about/" },
        { "title": "Каталог", "href": "/catalog/" },
        { "title": "Статьи", "href": "/articles/" },
        { "title": "Гарантия", "href": "/guarantee/" },
        { "title": "Где купить", "href": "/buy/" },
        { "title": "Контакты", "href": "/contacts/" }
      ]
    }
  },
  "logo": {
    "alt": "<Brand Name>",
    "horizontal": {
      "white": { "src": "data/img/ui/logos/logo-h-color-1.svg", "alt": "<Brand>" },
      "black": { "src": "data/img/ui/logos/logo-h-color-2.svg", "alt": "<Brand>" }
    },
    "vertical": {
      "white": { "src": "data/img/ui/logos/logo-v-color-1.svg", "alt": "<Brand>" },
      "black": { "src": "data/img/ui/logos/logo-v-color-2.svg", "alt": "<Brand>" }
    }
  },
  "socials": [],
  "socials-headings": { "ru": "Мы в социальных сетях" },
  "policy": { "ru": { "title": "Политика конфиденциальности", "href": "/policy/" } },
  "copyright": { "ru": "© <Brand Name>" },
  "form-callback": {
    "placeholder": {
      "name": "Имя", "phone": "Телефон", "email": "E-mail", "message": "Сообщение"
    }
  },
  "cookie-panel": {
    "ru": {
      "desc": "Мы используем <a href='/cookies-policy/' class='link color-2 weight-400'>cookie-файлы</a> для вашего удобства пользования сайтом",
      "button": {
        "title": "Принять",
        "class": "button button-sm outline-color-2 button-animated animation-shift uppercase link nowrap js-cookie"
      }
    }
  }
}
JSON
```

Берёшь `phone`, `email`, `brand` из legacy `project/data/content/index.json:globals`.

---

## 5. Контент: pages (15-30 мин)

Все страницы — в baseline-формате `{title, sections: [{name, data: {...}}]}`.

### 5.1 `data/json/ru/pages/index.json`

```json
{
  "title": "<SEO Title главной>",
  "sections": [
    { "name": "header", "data": {} },
    {
      "name": "intro",
      "data": {
        "slider": {
          "id": "introSlider",
          "items": [
            { "cover": "data/img/intro/cover1.webp", "alt": "..." },
            { "cover": "data/img/intro/cover.webp", "alt": "..." }
          ]
        },
        "heading": {
          "tag": "h1",
          "title": "<H1 главной>",
          "subtitle": "<Подзаголовок>"
        }
      }
    },
    {
      "name": "actions",
      "data": {
        "heading": {"tag": "h2", "title": "Категории шин"},
        "items": [
          { "cover": "data/img/range/1.webp", "title": "Легковая", "href": "/catalog/" },
          { "cover": "data/img/range/2.webp", "title": "Внедорожная", "href": "/catalog/" },
          { "cover": "data/img/range/3.webp", "title": "Коммерческая", "href": "/catalog/" }
        ]
      }
    },
    {
      "name": "us",
      "data": {
        "heading": {"tag": "h2", "title": "О компании"},
        "desc": "<HTML описание бренда>"
      }
    },
    {
      "name": "trust",
      "data": {
        "heading": {"tag": "h2", "title": "<Бренд> в цифрах"},
        "items": [
          { "title": "2 000 000", "desc": "грузовых шин в год" },
          { "title": "6 000 000", "desc": "легковых шин в год" },
          { "title": "120 стран", "desc": "присутствия бренда" }
        ]
      }
    },
    {
      "name": "news",
      "data": {
        "heading": {"tag": "h2", "title": "Статьи"},
        "all_news_link": "/articles/"
      }
    },
    { "name": "footer", "data": {} }
  ]
}
```

**Маппинг legacy-секций → baseline:**

| Legacy `name` | Baseline `name` | Куда положить данные |
|---|---|---|
| `header` | `header` | без data (всё из global) |
| `burger` | (часть header) | удалить, header умеет burger |
| `intro` (slides) | `intro` (slider.items) | `slides` → `slider.items`; поля `cover`/`heading`/`subheading` сохраняются |
| `range` (items) | `actions` | items с `{cover, title, href}` |
| `about` (desc) | `us` или `content` | `data.heading` + `data.desc` |
| `digits` (items) | `trust` | items с `{title, desc}` |
| `articleslist` | `news` | `data.heading` + `data.all_news_link` |
| `cataloglist` | `tires` | `data.filter` + items автоматически из коллекции |
| `dealers` | `dealers` | items на верхнем уровне страницы |
| `cap` | (удалить) | декоративная |
| `footer` | `footer` | без data |

### 5.2 `data/json/ru/pages/tires-list.json`

```json
{
  "title": "Каталог шин <Brand>",
  "sections": [
    { "name": "header", "data": {} },
    {
      "name": "frame",
      "data": { "heading": {"tag": "h1", "title": "Каталог шин"} }
    },
    {
      "name": "tires",
      "data": {
        "heading": {"tag": "h2", "title": "Все модели"},
        "filter": {
          "visible": true,
          "seasons": [
            { "label": "Лето", "value": "summer" },
            { "label": "Зима", "value": "winter" },
            { "label": "Всесезонные", "value": "allseason" }
          ]
        }
      }
    },
    { "name": "footer", "data": {} }
  ]
}
```

Items загружаются автоматически из коллекции `tires` (см. §7).

### 5.3 `data/json/ru/pages/articles.json` (news list)

```json
{
  "title": "Статьи <Brand>",
  "sections": [
    { "name": "header", "data": {} },
    { "name": "frame", "data": { "heading": {"tag": "h1", "title": "Статьи"} } },
    {
      "name": "news",
      "data": { "heading": {"tag": "h2", "title": "Все статьи"} }
    },
    { "name": "footer", "data": {} }
  ]
}
```

### 5.4 `data/json/ru/pages/dealers.json`

```json
{
  "title": "Дилеры <Brand>",
  "sections": [
    { "name": "header", "data": {} },
    { "name": "frame", "data": { "heading": {"tag": "h1", "title": "Где купить"} } },
    { "name": "dealers", "data": { "heading": {"tag": "h2", "title": "Дилерские центры"} } },
    { "name": "footer", "data": {} }
  ]
}
```

`items` нужно положить на верхний уровень (см. §7.3 — скрипт).

### 5.5 Статичные страницы (about, contacts, guarantee, cookies-policy)

```json
{
  "title": "<page title>",
  "sections": [
    { "name": "header", "data": {} },
    {
      "name": "frame",
      "data": { "heading": {"tag": "h1", "title": "<page title>"} }
    },
    {
      "name": "content",
      "data": {
        "heading": {"tag": "h2", "title": "<заголовок раздела>"},
        "body": "<HTML текст со всем содержимым>"
      }
    },
    { "name": "footer", "data": {} }
  ]
}
```

---

## 6. Контент: entities (tires + news) (15 мин)

### 6.1 Скрипт-конвертер для tires

Создай `/tmp/migrate-tires.py`:

```python
import json
from pathlib import Path

LEGACY = Path('<LEGACY-path>')      # ~/Sites/<slug>.ru
NEW = Path('<NEW-path>')             # ~/Sites/<slug>.ru-v2
OUT = NEW / 'data/json/ru/tires'
OUT.mkdir(parents=True, exist_ok=True)

# Legacy models — в index.json globals.models
idx = json.load(open(LEGACY / 'project/data/content/index.json'))
models = idx.get('globals', {}).get('models', [])

for m in models:
    if not isinstance(m, dict) or not m.get('slug'):
        continue
    slug = m['slug']
    # baseline формат: {slug, item: {name, code, season, types}, desc: {short, full}, cover, images, sizes}
    entity = {
        'slug': slug,
        'visible': m.get('visible', True),
        'item': {
            'name': m.get('name', ''),
            'season': m.get('season', ''),
            'types': m.get('types', []),
        },
        'desc': {
            'short': '',
            'full': m.get('desc', ''),
        },
    }
    # Top-level: cover, images, sizes, shadow, bg — переносим как есть
    for key in ('cover', 'images', 'sizes', 'shadow', 'bg', 'features'):
        if key in m:
            entity[key] = m[key]
    json.dump(entity, open(OUT / f"{slug}.json", 'w'), ensure_ascii=False, indent=2)
    print(f'✓ {slug}.json')

# Источник slugs для baseline injectListItems: data/json/ru/pages/catalog.json
tire_slugs = sorted([f.stem for f in OUT.glob('*.json')])
json.dump({'items': tire_slugs}, open(NEW / 'data/json/ru/pages/catalog.json', 'w'),
          ensure_ascii=False, indent=2)
print(f'\ncatalog.json: {len(tire_slugs)} items')
```

Запустить:

```bash
sed -i '' "s|<LEGACY-path>|$LEGACY|; s|<NEW-path>|$NEW|" /tmp/migrate-tires.py
python3 /tmp/migrate-tires.py
```

### 6.2 Скрипт-конвертер для news

Создай `/tmp/migrate-news.py`:

```python
import json
from pathlib import Path

LEGACY = Path('<LEGACY-path>')
NEW = Path('<NEW-path>')
OUT = NEW / 'data/json/ru/news'
OUT.mkdir(parents=True, exist_ok=True)

idx = json.load(open(LEGACY / 'project/data/content/index.json'))
articles = idx.get('globals', {}).get('articles', [])

slugs = []
for a in articles:
    if not isinstance(a, dict):
        continue
    slug = a.get('slug') or f"article-{a.get('id', '')}"
    if not slug:
        continue
    entity = {
        'slug': slug,
        'visible': a.get('visible', True),
        'news': {
            'title': a.get('title', ''),
            'date': a.get('date', ''),
            'cover': a.get('cover', ''),
            'lead': a.get('desc', ''),
            'body': a.get('full', ''),
        },
    }
    json.dump(entity, open(OUT / f"{slug}.json", 'w'), ensure_ascii=False, indent=2)
    slugs.append(slug)
    print(f'✓ {slug}.json')

# Добавить items в pages/articles.json
ap = NEW / 'data/json/ru/pages/articles.json'
if ap.exists():
    a = json.load(open(ap))
    a['items'] = sorted(slugs)
    json.dump(a, open(ap, 'w'), ensure_ascii=False, indent=2)
    print(f'\narticles.json items: {len(slugs)}')
```

### 6.3 Скрипт-конвертер для dealers

```python
import json
from pathlib import Path

LEGACY = Path('<LEGACY-path>')
NEW = Path('<NEW-path>')
buy = json.load(open(LEGACY / 'project/data/content/buy.json'))
dealers = buy.get('dealers', [])

items = []
for d in dealers:
    if not isinstance(d, dict):
        continue
    items.append({
        'name':     d.get('name', ''),
        'city':     d.get('city', ''),
        'region':   d.get('region', ''),
        'address':  d.get('address', ''),
        'location': d.get('location', ''),
        'site':     d.get('site', {}),
        'phones':   d.get('phones', []),
    })

# Берём dealers.json (созданный в §5.4) и добавляем items
p = NEW / 'data/json/ru/pages/dealers.json'
data = json.load(open(p))
data['items'] = items
json.dump(data, open(p, 'w'), ensure_ascii=False, indent=2)

cities = {it['city'] for it in items if it['city']}
print(f'dealers items: {len(items)}, городов: {len(cities)}')
```

---

## 7. Контент: SEO (5 мин)

```python
# /tmp/migrate-seo.py
import json
from pathlib import Path

LEGACY = Path('<LEGACY-path>')
NEW = Path('<NEW-path>')
OUT = NEW / 'data/json/ru/seo'
OUT.mkdir(parents=True, exist_ok=True)

seo = json.load(open(LEGACY / 'project/data/content/seo.json'))
pages_seo = seo.get('pages', [])

# Mapping legacy page name → baseline page_id (через route_map в §8)
name_map = {
    'index': 'index', 'about': 'about', 'articles': 'articles',
    'buy': 'dealers', 'catalog': 'tires-list',
    'contacts': 'contacts', 'cookies-policy': 'cookies-policy',
    'guarantee': 'guarantee',
}

for page in pages_seo:
    if not isinstance(page, dict) or 'name' not in page:
        continue
    name = page['name']
    target = name_map.get(name, name)
    title, description = '', ''
    og_title, og_description = '', ''
    for m in page.get('meta', []):
        n = m.get('name') or m.get('property', '')
        c = m.get('content', '')
        if n == 'title': title = c
        elif n == 'description': description = c
        elif n == 'og:title': og_title = c
        elif n == 'og:description': og_description = c

    # Если title не из meta — взять из pages/<target>.json title
    if not title:
        pf = NEW / 'data/json/ru/pages' / f'{target}.json'
        if pf.exists():
            title = json.load(open(pf)).get('title', '')

    out = {
        'title': title,
        'description': description,
        'og': {
            'type': 'website',
            'title': og_title or title,
            'description': og_description or description,
        },
    }
    json.dump(out, open(OUT / f'{target}.json', 'w'), ensure_ascii=False, indent=2)
    print(f'✓ seo/{target}.json')
```

---

## 8. config/project.php (3 мин)

```bash
cat > $NEW/config/project.php <<'PHP'
<?php
return [
    'route_map' => [
        'catalog' => 'tires-list',
        'articles' => 'articles',
        'buy' => 'dealers',
        'about' => 'about',
        'contacts' => 'contacts',
        'guarantee' => 'guarantee',
        'cookies-policy' => 'cookies-policy',
    ],

    'collections' => [
        'tires' => [
            'nav_slug'     => 'catalog',
            'list_page_id' => 'tires-list',
            'template'     => 'pages/tire.twig',
            'item_key'     => 'item',
            'data_dir'     => 'tires',
            'slugs_source' => 'items',
            'og_type'      => 'website',
            'extras_key'   => 'tire',
            'entity_url_pattern' => '/catalog/{slug}',
        ],
        'news' => [
            'nav_slug'     => 'articles',
            'list_page_id' => 'articles',
            'template'     => 'pages/news.twig',
            'item_key'     => 'news',
            'data_dir'     => 'news',
            'slugs_source' => 'items',
            'og_type'      => 'article',
            'extras_key'   => 'news',
            'entity_url_pattern' => '/articles/{slug}',
        ],
    ],

    'sitemap_pages' => [
        'index', 'about', 'guarantee', 'contacts', 'cookies-policy',
        'tires-list', 'articles', 'dealers',
    ],

    'sitemap_dynamic_pages' => [
        'dealers' => [
            'data_page' => 'dealers',
            'list_key' => 'items',
            'value_key' => 'city',
            'slugger' => 'city',
        ],
    ],

    'integrations' => [],
];
PHP
```

---

## 9. Entity templates (tire.twig + news.twig) (2 мин)

baseline по умолчанию имеет только `pages/page.twig`. Для коллекций нужны specific templates:

```bash
cp $PLATFORM/../kumho-tires.ru/templates/pages/tire.twig $NEW/templates/pages/
cp $PLATFORM/../kumho-tires.ru/templates/pages/news.twig $NEW/templates/pages/

# Помечаем как overrides
cd $PLATFORM
npm run distill -- mark-override $NEW templates/pages/tire.twig "tire entity layout (заимствован из kumho)"
npm run distill -- mark-override $NEW templates/pages/news.twig "news entity layout (заимствован из kumho)"
```

---

## 10. Smoke + deploy fixes (5 мин)

### 10.1 Build

```bash
cd $NEW
npm run build:dev
# Должно завершиться "compiled successfully"
```

### 10.2 Symlink `public/assets`

Если `public/assets/` существует как директория (а не symlink), нужно пересоздать:

```bash
[ -d $NEW/public/assets ] && [ ! -L $NEW/public/assets ] && rm -rf $NEW/public/assets && ln -s ../assets $NEW/public/assets
ls -la $NEW/public/assets   # должно показывать lrwxr-xr-x ... -> ../assets
```

### 10.3 Корневой `.htaccess` для Valet

```bash
cat > $NEW/.htaccess <<'HTACCESS'
<IfModule mod_authz_core.c>
    <FilesMatch "^\.env">
        Require all denied
    </FilesMatch>
</IfModule>

<IfModule mod_rewrite.c>
    RewriteEngine On

    RewriteRule ^\.env(\..*)?$ - [F,L]
    RewriteRule ^\.git(/|$) - [F,L]
    RewriteRule ^(config|src|tools|cache|logs|vendor|docs|tests|node_modules)/ - [F,L]

    RewriteCond %{REQUEST_FILENAME} -f
    RewriteRule ^ - [L]
    RewriteCond %{REQUEST_FILENAME} -d
    RewriteCond %{REQUEST_URI} ^/(assets|data)/
    RewriteRule ^ - [L]

    RewriteRule ^ public/index.php [QSA,L]
</IfModule>
HTACCESS

# index.php wrapper (для Valet, который смотрит в корень)
cat > $NEW/index.php <<'PHP'
<?php require __DIR__ . '/public/index.php';
PHP
```

### 10.4 Local smoke

```bash
cd $NEW
mkdir -p logs cache
php -S 127.0.0.1:8080 -t public &
sleep 1

for url in / /catalog /catalog/<first-tire-slug> /articles /buy /sitemap.xml /health; do
  curl -s --noproxy '*' -o /dev/null -w "  $url → HTTP %{http_code}\n" http://127.0.0.1:8080$url
done

kill %1
```

Ожидаемое: все 200 (кроме `/health` который должен отдать `{"status":"ok"}`).

---

## 11. Git + push (3 мин)

```bash
cd $NEW
git init
git checkout -b feat/migrate-to-ismart-platform
git remote add origin git@github.com:<org>/$SLUG.git
git add -A
git commit -m "init: миграция $SLUG на ismart-platform baseline

Создан через 'distill init' из ismart-platform.
Архитектура: Slim 4 + Twig 3 + scaffold (baseline ismart-platform).
Контент и брендинг — адаптированы из legacy $SLUG."
git push -u origin feat/migrate-to-ismart-platform
```

---

## 12. Post-migration QA checklist

Открой в браузере `http://$DEV_DOMAIN/` и проверь:

- [ ] Главная — все 8 секций видны (header, intro со слайдером, actions/categories, us, trust, news, footer)
- [ ] CSS подгружается (`Network` tab: `main.<hash>.css` `Content-Type: text/css`)
- [ ] JS подгружается (`main.<hash>.js` `Content-Type: application/javascript`)
- [ ] Шрифты подгружаются (Gilroy/Futura PT — нет 404)
- [ ] Логотип в шапке — фирменный
- [ ] Brand-цвет применился (кнопки, акценты — не серые/красные дефолты)
- [ ] z-index header — header всегда сверху при scroll
- [ ] Заголовки — крупные, h1 ~ 40px на desktop, h2 ~ 30px
- [ ] `/catalog/` — карточки шин с изображениями (cover)
- [ ] `/catalog/<slug>/` — детальная шины: галерея + размеры + описание
- [ ] `/articles/` — статьи (если есть)
- [ ] `/buy/` — города дилеров
- [ ] Cookie-panel внизу — отображается, кнопка работает
- [ ] `/sitemap.xml` — все URL'ы (index, about, catalog, articles, buy, etc.)
- [ ] `/health` → `{"status":"ok"}`
- [ ] DevTools console — нет `ERR_BLOCKED_BY_ORB`, нет 404
- [ ] Lighthouse perf score ≥ 80 (mobile)

---

## 13. Troubleshooting (если что-то не работает)

| Симптом | Причина | Фикс |
|---|---|---|
| 503 от curl на `.test` | Прокси перехватывает | `curl --noproxy '*'` |
| 500 на главной | `Dotenv InvalidFileException` (брекеты) | Проверь `.env` `MAIL_SUBJECT_PREFIX="[Brand]"` (кавычки) |
| `ERR_BLOCKED_BY_ORB` на CSS/JS | `public/assets` директория, не symlink | `rm -rf public/assets && ln -s ../assets public/assets` |
| 404 на /assets/* через Valet | Корневой `.htaccess` блокирует | Переписать `.htaccess` (см. §10.3) |
| `<title>` пустой (default) | SEO/index.json без title | Запустить SEO-конвертер (§7) |
| /catalog пустой (без карточек) | items[] в catalog.json пустой | Запустить tires-конвертер (§6.1) |
| /catalog/{slug} → 404 | Slug не в `pages/catalog.json:items` | Проверь файл, должны быть все slug'и |
| /catalog/{slug} → 500 | `templates/pages/tire.twig` отсутствует | Скопировать из kumho (§9) |
| /buy → 500 | dealers items пустой | Запустить dealers-конвертер (§6.3) |
| Кнопки красные/серые | `--color-3` не из brand variables | Перечитать `dev/src/assets/brands/<brand>/variables.css` |
| Шрифты дефолтные | `--font-1-*` ссылается на несуществующий font-family | Проверить `fonts.css` с правильными именами `@font-face` |
| Двойной URL `/http://...` | Legacy-twig смешан с baseline JsonProcessor | Не использовать legacy-twig (этот гайд их не копирует) |
| Header без z-index | `--z-index-*` не определены | Добавить в `variables.css` (см. §3.1) |

---

## 14. Все скрипты в одном месте

Если предпочитаешь автоматизировать — собери все скрипты-конвертеры в один и запусти за раз. См. `tools/migrate-legacy.mjs` в baseline (будет создан в следующей итерации).

---

## Summary (TL;DR)

```bash
# 1. Bootstrap
PLATFORM=~/Sites/ismart-platform; LEGACY=~/Sites/<slug>; NEW=~/Sites/<slug>-v2
cd $PLATFORM && npm run distill -- init <slug>-v2 --name "<Brand>" --domain <slug>
cd $NEW
sed -i '' 's|MAIL_SUBJECT_PREFIX=\[|MAIL_SUBJECT_PREFIX="[|; s|\(MAIL_SUBJECT_PREFIX=".*\)\]|\1]"|' .env
sed -i '' "s|APP_BASE_URL=.*|APP_BASE_URL=http://<slug>-v2.test/|" .env
composer install --no-dev && npm install && mkdir -p logs cache

# 2. Brand assets
# Скопировать brand-цвета + шрифты в base/{variables,fonts,typography}.css (§3)
# Логотипы → data/img/ui/logos/
# Все изображения: rsync -a $LEGACY/project/data/img/ $NEW/data/img/

# 3. Контент
# global.json (§4)
# pages/{index,tires-list,articles,dealers,about,contacts,guarantee,cookies-policy}.json (§5)
# Конвертеры (§6, §7) — tires, news, dealers, seo
# config/project.php (§8)

# 4. Entity templates
cp $PLATFORM/../kumho-tires.ru/templates/pages/{tire,news}.twig $NEW/templates/pages/

# 5. Deploy fixes
rm -rf $NEW/public/assets && ln -s ../assets $NEW/public/assets
# .htaccess + index.php wrapper (§10.3)

# 6. Build + smoke
cd $NEW && npm run build:dev
php -S 127.0.0.1:8080 -t public &
for url in / /catalog /articles /buy /sitemap.xml /health; do
  curl -s --noproxy '*' -o /dev/null -w "$url → %{http_code}\n" http://127.0.0.1:8080$url
done
kill %1

# 7. Git + push
git init && git checkout -b feat/migrate-to-ismart-platform
git remote add origin git@github.com:<org>/<slug>.git
git add -A && git commit -m "init: миграция на ismart-platform baseline"
git push -u origin feat/migrate-to-ismart-platform
```

Через 4-8 часов работы (большую часть занимает наполнение pages JSON под трazано-контент) — рабочий сайт на новой архитектуре.
