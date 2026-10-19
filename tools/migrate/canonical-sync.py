#!/usr/bin/env python3
"""
Полная синхронизация canonical mirage → mirage-v2 (platform-format).
Конвертирует ВСЁ из data/content/*.json в data/json/ru/{pages,seo,tires,news}/*.json.
"""
import json, os, re, sys
from pathlib import Path

CANON = Path('/Users/danich/Sites/mirage-russia.ru/project')
V2 = Path('/Users/danich/Sites/mirage-russia.ru-v2')

TR = str.maketrans({
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y',
    'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
    'х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
})

def slugify(s, max_len=80):
    t = s.lower().translate(TR)
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')[:max_len]

def strip_root(path):
    """Убрать ведущий слэш для consistency."""
    if not isinstance(path, str): return path
    return path.lstrip('/')

# === Маппинг page_id ===
PAGE_RENAME = {
    'catalog': 'tires',
    'articles': 'news',
    'guarantee': 'warranty',
    'index': 'index', 'about': 'about', 'contacts': 'contacts',
    'buy': 'dealers', 'cookies-policy': 'cookies-policy',
}
# Renamed section names
SECTION_RENAME = {'cataloglist': 'tires', 'articleslist': 'news'}
# Frame covers по страницам
FRAME_COVERS = {
    'index': None, 'about': 'data/img/frame/cover8.webp',
    'tires': 'data/img/frame/cover7.webp', 'news': 'data/img/frame/cover14.webp',
    'contacts': 'data/img/frame/cover5.webp', 'warranty': 'data/img/frame/cover12.webp',
    'dealers': 'data/img/frame/cover9.webp', 'cookies-policy': 'data/img/frame/cover3.webp',
}

def convert_section(s, page_id):
    """Конвертировать canonical-section в platform sections-format."""
    name = s.get('name')
    if not s.get('visible', True): return None
    name = SECTION_RENAME.get(name, name)

    # Сборка data: всё кроме служебных ключей name/visible
    data = {k: v for k, v in s.items() if k not in ('name', 'visible')}

    # heading: string → object ТОЛЬКО для секций которые используют merge() filter (dealers/tires/news)
    # Остальные секции (range, digits, about, intro, profits, etc.) ожидают heading как string.
    HEADING_AS_OBJECT_SECTIONS = {'dealers', 'tires', 'news'}
    if isinstance(data.get("heading"), str) and name in HEADING_AS_OBJECT_SECTIONS:
        data["heading"] = {"title": data["heading"]}
    if "map" in data and isinstance(data["map"].get("zoom"), str):
        try: data["map"]["zoom"] = int(data["map"]["zoom"])
        except: pass

    # frame: подставить cover из mapping если не задан
    if name == 'frame':
        if not data.get('cover') and FRAME_COVERS.get(page_id):
            data['cover'] = FRAME_COVERS[page_id]

    # tires / news section → items_from inject
    if name == 'tires':
        data['items_from'] = 'tires'
        if 'heading' not in data:
            data['heading'] = {'title': 'Каталог шин Mirage'}
        if 'filter' not in data:
            data['filter'] = {
                'visible': True,
                'seasons': [
                    {'label': 'Летние', 'value': 'summer', 'icon': 'data/img/ui/icons/sun-color-1.svg'},
                    {'label': 'Всесезонные', 'value': 'allseason', 'icon': 'data/img/ui/icons/allseason-color-1.svg'},
                    {'label': 'Зимние', 'value': 'winter', 'icon': 'data/img/ui/icons/snow-color-1.svg'},
                ]
            }
    if name == 'news':
        data['items_from'] = 'news'

    # content: разные canonical-форматы → единый platform items[]-format
    if name == 'content':
        # Mirage-format: {class: {container: "narrow"}, heading: "...", article: "<HTML>"}
        # Trazano-format: {class: "section content", items: [{class: "container narrow", content: "<HTML>"}]}
        if not data.get('items') and (data.get('article') or data.get('heading')):
            # Mirage → Trazano format
            container_cls = 'container narrow'
            if isinstance(data.get('class'), dict):
                # canonical mirage: class: {container: "narrow"} → 'container narrow'
                base = next(iter(data['class'].keys()), 'container')
                modif = next(iter(data['class'].values()), '')
                container_cls = f'{base} {modif}'.strip()
            heading_html = ''
            if data.get('heading'):
                heading_html = f'<div class="section__item heading-wrap"><h3 class="heading">{data["heading"]}</h3></div>'
            article_html = data.get('article', '')
            if article_html:
                article_html = f'<div class="section__item article-wrap"><span class="article">{article_html}</span></div>'
            data['items'] = [{'class': container_cls, 'content': heading_html + article_html}]
            data['class'] = 'section content'
            # Удалить старые поля mirage-format
            data.pop('heading', None)
            data.pop('article', None)
        else:
            # Trazano-format: refactor items[]
            for it in data.get('items', []):
                cls = it.get('class', '')
                if 'narrow' not in cls and 'container' in cls:
                    it['class'] = cls.replace('container', 'container narrow').strip()
                elif 'narrow' not in cls and not cls:
                    it['class'] = 'container narrow'
                html = it.get('content', '')
                if html:
                    html = re.sub(r'^\s*<div class="container[^"]*">\s*', '', html)
                    html = re.sub(r'\s*</div>\s*$', '', html)
                    it['content'] = html
        # Финал: data.class всегда string
        if isinstance(data.get('class'), dict):
            data['class'] = 'section content'

    # intro: slides[].cover string → {src,alt}; href→/tires (kumho-style)
    if name == 'intro':
        # Поддержка двух форматов: data.slides[] (canonical) и data.slider.items[] (legacy migrated)
        for slide in data.get('slides', []):
            if isinstance(slide.get('cover'), str):
                slide['cover'] = slide['cover'].lstrip('/')
            if 'href' not in slide:
                slide['href'] = '/tires'
        if 'slider' in data:
            for s in data['slider'].get('items', []):
                if isinstance(s.get('cover'), str):
                    s['cover'] = s['cover'].lstrip('/')

    # range: items[].cover → path normalize; items[].href → /tires
    if name == 'range':
        for it in data.get('items', []):
            if isinstance(it.get('cover'), str):
                it['cover'] = it['cover'].lstrip('/')
            if it.get('href') == '/catalog/' or it.get('href') == '/catalog':
                it['href'] = '/tires/'

    # about: items[].icon path normalize
    if name == 'about':
        for it in data.get('items', []):
            if isinstance(it.get('icon'), str):
                it['icon'] = it['icon'].lstrip('/')

    # digits: items[].title → ensure number/string; cover normalize
    if name == 'digits':
        for it in data.get('items', []):
            title = it.get('title')
            if isinstance(title, str) and title.isdigit():
                it['title'] = int(title)
        if isinstance(data.get('cover'), str):
            data['cover'] = data['cover'].lstrip('/')

    # cap: cover normalize + href
    if name == 'cap':
        if isinstance(data.get('cover'), str):
            data['cover'] = data['cover'].lstrip('/')

    # dealers: heading object (уже handled выше); map zoom уже int
    # items[] (дилеры) — оставляем как есть, kumho-dealers.twig их обрабатывает

    # Чистка путей: убрать ведущий слэш для всех data/img/ строк
    def walk(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if isinstance(v, str) and v.startswith('/data/img/'):
                    obj[k] = v.lstrip('/')
                else: walk(v)
        elif isinstance(obj, list):
            for i in obj: walk(i)
    walk(data)

    return {'name': name, 'data': data}

# === 1. Загрузка canonical ===
canon_index = json.loads((CANON / 'data/content/index.json').read_text())
globals_ = canon_index.get('globals', {})
models = globals_.get('models', [])
articles = globals_.get('articles', [])

# === 2. Pages — конверсия ===
PAGES_OUT = V2 / 'data/json/ru/pages'
PAGES_OUT.mkdir(parents=True, exist_ok=True)
SEO_OUT = V2 / 'data/json/ru/seo'
SEO_OUT.mkdir(parents=True, exist_ok=True)

for content_file in sorted((CANON / 'data/content').glob('*.json')):
    page_name = content_file.stem
    if page_name in ('product', 'article'):  # entity-template, не page
        continue
    canon_page = json.loads(content_file.read_text())
    new_page_id = PAGE_RENAME.get(page_name, page_name)
    sections = []
    for s in canon_page.get('firstScreen', []) + canon_page.get('secondaryScreen', []):
        sec = convert_section(s, new_page_id)
        if sec is None: continue
        # Skip 'burger' section (у platform header-component уже есть burger)
        if sec['name'] == 'burger': continue
        sections.append(sec)

    page_data = {
        'title': canon_page.get('title', ''),
        'sections': sections,
    }
    # items для list-страниц (tires/news/dealers): top-level slugs
    if new_page_id == 'tires':
        page_data['items'] = [m['slug'] for m in models if m.get('visible', True)]
    elif new_page_id == 'news':
        page_data['items'] = [slugify(a.get('title','')) or f"article-{a['id']}" for a in articles if a.get('visible', True)]
    elif new_page_id == 'dealers':
        # canonical buy.json::dealers — массив дилеров
        page_data['items'] = canon_page.get('dealers', [])

    (PAGES_OUT / f'{new_page_id}.json').write_text(json.dumps(page_data, ensure_ascii=False, indent=2))

    # SEO в platform-format (title из канона, description пусто)
    title = canon_page.get('title', '')
    desc = canon_page.get('description', '')
    seo = {
        'title': title,
        'meta': []
    }
    if desc: seo['meta'].append({'name': 'description', 'content': desc})
    seo['meta'].extend([
        {'property': 'og:type', 'content': 'article' if new_page_id == 'news' else 'website'},
        {'property': 'og:title', 'content': title},
        {'property': 'og:description', 'content': desc},
        {'property': 'og:image', 'content': '{base_url}/data/img/meta/og.jpg'},
        {'property': 'og:url', 'content': '{base_url}/' + ('' if new_page_id == 'index' else new_page_id)},
    ])
    (SEO_OUT / f'{new_page_id}.json').write_text(json.dumps(seo, ensure_ascii=False, indent=2))

print(f'  pages: {len(list(PAGES_OUT.glob("*.json")))} файлов')

# === 3. Tire entities ===
SEASON_MAP = {'Лето': ['summer'], 'Зима': ['winter'], 'Всесезонная': ['allseason']}
TIRES_OUT = V2 / 'data/json/ru/tires'
TIRES_OUT.mkdir(parents=True, exist_ok=True)
# Удалить старые
for f in TIRES_OUT.glob('*.json'): f.unlink()

for m in models:
    if not m.get('visible', True): continue
    slug = m['slug']
    season = m.get('season', '')
    entity = {
        'slug': slug,
        'visible': True,
        'item': {
            'name': m.get('name', ''),
            'code': m.get('name', '').upper(),
            'season': season,
            'types': m.get('types', []),
            'cover': strip_root(m.get('cover', '')),
            'bg': strip_root(m.get('bg', '')),
            'shadow': strip_root(m.get('shadow', '')),
        },
        'image': {'src': strip_root(m.get('cover', '')), 'alt': m.get('name', '')},
        'images': [
            {'src': strip_root(img.get('src','')), 'alt': img.get('alt', m.get('name','')), 'visible': img.get('visible', True)}
            for img in m.get('images', []) if isinstance(img, dict)
        ],
        'desc': {'short': '', 'full': m.get('desc', '')},
        'filter': {
            'season': SEASON_MAP.get(season, ['summer']),
            'diameters': sorted(set(s.get('diameter','') for s in m.get('sizes',[]) if s.get('diameter'))),
            'widths': sorted(set(s.get('width','') for s in m.get('sizes',[]) if s.get('width'))),
            'profiles': sorted(set(s.get('aspect_ratio', s.get('height','')) for s in m.get('sizes',[]) if s.get('aspect_ratio') or s.get('height'))),
        },
        'sizes': m.get('sizes', []),
    }
    (TIRES_OUT / f'{slug}.json').write_text(json.dumps(entity, ensure_ascii=False, indent=2))

print(f'  tires: {len(models)} entities')

# === 4. News entities ===
NEWS_OUT = V2 / 'data/json/ru/news'
NEWS_OUT.mkdir(parents=True, exist_ok=True)
for f in NEWS_OUT.glob('*.json'): f.unlink()

for a in articles:
    if not a.get('visible', True): continue
    title = a.get('title', '')
    slug = slugify(title) or f"article-{a.get('id', 'x')}"
    entity = {
        'slug': slug,
        'visible': True,
        'news': {
            'id': a.get('id'),
            'date': a.get('date', ''),
            'title': title,
            'cover': {'src': strip_root(a.get('cover', '')), 'alt': title},
            'lead': a.get('desc', ''),
            'body': a.get('full', ''),
        }
    }
    (NEWS_OUT / f'{slug}.json').write_text(json.dumps(entity, ensure_ascii=False, indent=2))

print(f'  news: {len(articles)} entities')

# === 5. Global.json — brand/contacts из canonical ===
g_path = V2 / 'data/json/global.json'
g = json.loads(g_path.read_text())
g['brand'] = globals_.get('brand', {})
phone = globals_.get('phone', {})
email = globals_.get('email', {})
g['phones'] = [phone] if phone else g.get('phones', [])
if isinstance(email, dict):
    g['email'] = email.get('title', '')
else:
    g['email'] = email
# nav (kumho-style URLs)
nav = globals_.get('nav', [])
nav_map = {'/about': '/about/', '/articles': '/news/', '/guarantee': '/warranty/', '/catalog': '/tires/', '/contacts': '/contacts/', '/buy': '/buy/'}
g_nav_items = []
for n in nav:
    href = nav_map.get(n.get('href', ''), n.get('href', ''))
    title = 'Шины' if n.get('title') == 'Каталог' else n.get('title', '')
    g_nav_items.append({'title': title, 'href': href})
g['nav'] = {'ru': {'items': g_nav_items}}
g_path.write_text(json.dumps(g, ensure_ascii=False, indent=2))
print(f'  global.json: brand={g["brand"].get("short")}, phones={len(g.get("phones",[]))}, nav={len(g_nav_items)}')

# === 6. Pages alias для kumho-tires.twig load_json ===
# pages/tires.json — уже есть. Не дублировать (kumho hard-codes этот путь, у нас совпадает после rename catalog→tires)
print('\nDONE.')
