#!/usr/bin/env python3
"""
Legacy iSmart-сайтов архетип-инвентарь.

Сканирует все доступные legacy-сайты (../*/project/data/content/+templates/parts/),
выявляет:
- какие pages есть в каждом (content/*.json)
- какие sections используются (templates/parts/*.twig)
- какие globals-ключи (index.json::globals)
- какие fields у моделей/статей (если есть)

Output: docs/orchestrator/legacy-archetypes.md — markdown-таблица для cross-deployment
анализа и выявления общих паттернов.
"""
import json, os, re, sys
from collections import Counter, defaultdict
from pathlib import Path

SITES_ROOT = Path('/Users/danich/Sites')
SKIP_NAMES = {'ismart-platform', 'kumho-tires.ru', 'italycommunity.ru', 'beepitron.com'}
SKIP_PATTERN = re.compile(r'-v2$|^\.|node_modules|_backup|^master')

def scan_site(site_dir):
    """Возвращает структуру архетипа для одного legacy сайта."""
    info = {'slug': site_dir.name, 'path': str(site_dir)}
    content_dir = site_dir / 'project' / 'data' / 'content'
    parts_dir = site_dir / 'project' / 'templates' / 'parts'
    components_dir = site_dir / 'dev' / 'src' / 'components'

    if not content_dir.exists():
        info['error'] = 'no_canonical_legacy_structure'
        return info

    # pages
    pages = sorted([f.stem for f in content_dir.glob('*.json')])
    info['pages'] = pages

    # globals keys (из index.json)
    index_file = content_dir / 'index.json'
    if index_file.exists():
        try:
            data = json.loads(index_file.read_text())
            globals_ = data.get('globals', {})
            info['globals_keys'] = list(globals_.keys())
            # Подсчёт моделей/статей если есть
            info['models_count'] = len(globals_.get('models', []))
            info['articles_count'] = len(globals_.get('articles', []))
            info['has_brand'] = bool(globals_.get('brand'))
            info['has_phone'] = bool(globals_.get('phone'))
            info['has_email'] = bool(globals_.get('email'))
            info['has_nav'] = bool(globals_.get('nav'))
            # Index page sections
            fs = [s.get('name') for s in data.get('firstScreen', []) if s.get('visible', True)]
            ss = [s.get('name') for s in data.get('secondaryScreen', []) if s.get('visible', True)]
            info['index_sections'] = fs + ss
        except Exception as e:
            info['index_parse_error'] = str(e)

    # parts (templates/parts/)
    if parts_dir.exists():
        parts = sorted([f.stem for f in parts_dir.glob('*.twig') if 'critical' not in f.stem])
        info['parts'] = parts

    # components (dev/src/components/)
    if components_dir.exists():
        components = sorted([d.name for d in components_dir.iterdir() if d.is_dir()])
        info['components'] = components

    # Sample tire entity structure (если есть)
    if index_file.exists():
        try:
            data = json.loads(index_file.read_text())
            models = data.get('globals', {}).get('models', [])
            if models:
                m0 = models[0]
                info['model_keys'] = list(m0.keys())
        except: pass

    return info

def find_sites():
    sites = []
    for p in SITES_ROOT.iterdir():
        if not p.is_dir(): continue
        if p.name in SKIP_NAMES: continue
        if SKIP_PATTERN.search(p.name): continue
        if (p / 'project').exists():
            sites.append(p)
    return sorted(sites, key=lambda x: x.name)

def render_markdown(sites_info):
    lines = []
    lines.append('# Legacy iSmart sites — архетип-инвентарь')
    lines.append('')
    lines.append('Авто-генерация: `python3 tools/orchestrator/analyzers/legacy-archetype-inventory.py`')
    lines.append('')
    lines.append(f'Просканировано: **{len(sites_info)}** legacy-сайтов.')
    lines.append('')

    # Cross-site stats
    all_pages = Counter()
    all_sections = Counter()
    all_globals_keys = Counter()
    all_parts = Counter()
    archetypes = defaultdict(list)

    for info in sites_info:
        for p in info.get('pages', []): all_pages[p] += 1
        for s in info.get('index_sections', []): all_sections[s] += 1
        for k in info.get('globals_keys', []): all_globals_keys[k] += 1
        for p in info.get('parts', []): all_parts[p] += 1
        # Архетип определяется по globals-структуре
        if info.get('has_nav') and info.get('has_brand'):
            arch = 'A: globals.{nav,brand,phone,email,models,articles}'
        elif 'header' in info.get('globals_keys', []) and 'footer' in info.get('globals_keys', []):
            arch = 'B: globals.{header.menus, footer.links}'
        else:
            arch = 'C: other / mixed'
        archetypes[arch].append(info['slug'])

    lines.append('## Архетипы по globals-структуре')
    lines.append('')
    for arch, slugs in archetypes.items():
        lines.append(f'### {arch}')
        lines.append('')
        for s in slugs:
            lines.append(f'- {s}')
        lines.append('')

    lines.append('## Pages — частотность по всем сайтам')
    lines.append('')
    lines.append('| Page | Sites count |')
    lines.append('|---|---|')
    for page, count in all_pages.most_common(30):
        lines.append(f'| `{page}` | {count} |')
    lines.append('')

    lines.append('## Sections (parts) — частотность')
    lines.append('')
    lines.append('| Section | Sites count |')
    lines.append('|---|---|')
    for sect, count in all_parts.most_common(40):
        lines.append(f'| `{sect}` | {count} |')
    lines.append('')

    lines.append('## Index-page sections — частотность')
    lines.append('')
    lines.append('| Section | Sites count |')
    lines.append('|---|---|')
    for sect, count in all_sections.most_common(30):
        lines.append(f'| `{sect}` | {count} |')
    lines.append('')

    lines.append('## Globals top-level keys')
    lines.append('')
    lines.append('| Key | Sites count |')
    lines.append('|---|---|')
    for key, count in all_globals_keys.most_common():
        lines.append(f'| `{key}` | {count} |')
    lines.append('')

    lines.append('## Сайты подробно')
    lines.append('')
    for info in sites_info:
        lines.append(f'### {info["slug"]}')
        lines.append('')
        if 'error' in info:
            lines.append(f'- error: {info["error"]}')
            lines.append('')
            continue
        lines.append(f'- pages ({len(info.get("pages",[]))}): `{", ".join(info.get("pages",[])[:15])}`')
        lines.append(f'- globals keys: `{info.get("globals_keys", [])}`')
        lines.append(f'- index sections: `{info.get("index_sections", [])}`')
        lines.append(f'- models/articles: {info.get("models_count",0)} / {info.get("articles_count",0)}')
        lines.append(f'- brand={info.get("has_brand",False)} phone={info.get("has_phone",False)} email={info.get("has_email",False)} nav={info.get("has_nav",False)}')
        if info.get('model_keys'):
            lines.append(f'- model.keys: `{info["model_keys"]}`')
        lines.append(f'- parts ({len(info.get("parts",[]))}): `{", ".join(info.get("parts",[])[:15])}{"..." if len(info.get("parts",[])) > 15 else ""}`')
        lines.append('')

    return '\n'.join(lines)

def main():
    sites = find_sites()
    print(f'Found {len(sites)} legacy sites:')
    sites_info = []
    for s in sites:
        info = scan_site(s)
        print(f'  - {s.name}: {len(info.get("pages",[]))} pages, {len(info.get("parts",[]))} parts')
        sites_info.append(info)

    md = render_markdown(sites_info)
    out = Path(__file__).resolve().parents[2].parent / 'docs/orchestrator/legacy-archetypes.md'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(md)
    print(f'\nReport: {out}')

if __name__ == '__main__':
    main()
