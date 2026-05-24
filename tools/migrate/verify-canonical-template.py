#!/usr/bin/env python3
"""
Pofiлово verify миграции legacy iSmart-сайта → platform v2.

ОБЯЗАТЕЛЬНЫЙ шаг после каждой миграции (memory: feedback-pofile-verify-required).
Не отчитываться «под ключ» пока verify не зелёный.

Usage:
    python3 verify-canonical-template.py \
        --canon /Users/danich/Sites/<legacy-slug> \
        --v2    /Users/danich/Sites/<deployment-v2> \
        --host  <deployment-v2>.test \
        --urls  / /catalog /buy /contact /actions /catalog/<sample-slug>

Проверяет (критичные → exit 1 при FAIL):
1. templates/sections — canonical parts vs v2 sections (NOTE, не fail — kumho-canvas валиден)
2. Brand variables — --color-N exact match (canonical brand ⊆ v2)
3. Data/img — все referenced пути в render существуют на диске
4. Public symlinks — public/{data,assets} → ../{data,assets}
5. JS build manifest — asset-manifest.json refs → on-disk
6. scripts.twig refs — assets/js/*.js существуют
7. HTTP-smoke per URL — 0 warnings, 0 'Не найдены', size > 5KB
"""
import json, re, os, subprocess, sys, argparse
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('--canon', required=True, help='Путь к legacy-сайту (с dev/+project/)')
ap.add_argument('--v2', required=True, help='Путь к v2-deployment')
ap.add_argument('--host', required=True, help='HTTP_HOST (например doublestar.ru-v2.test)')
ap.add_argument('--brand', default=None, help='Имя бренда для brands/<brand>/variables.css')
ap.add_argument('--urls', nargs='*', default=['/'], help='URLs для smoke')
args = ap.parse_args()

CANON, V2, HOST = Path(args.canon), Path(args.v2), args.host
BASE_URL = f'http://{HOST}'
fails = []
def fail(msg): fails.append(msg); print(f'    ✗ {msg}')

print('=' * 70)
print(f' POFILE VERIFY: {CANON.name} → {V2.name}')
print('=' * 70)

def render(url):
    p = subprocess.run(['php', str(V2/'public/index.php')],
        env={**os.environ, 'REQUEST_URI': url, 'REQUEST_METHOD': 'GET',
             'HTTP_HOST': HOST, 'APP_BASE_URL': BASE_URL},
        capture_output=True, text=True, cwd=V2, timeout=20)
    return p.stdout

# 1. Templates
print('\n### 1. Templates /sections ###')
parts_dir = CANON/'project/templates/parts'
if parts_dir.exists():
    canon_parts = sorted([f.stem for f in parts_dir.glob('*.twig') if 'critical' not in f.stem])
    v2_sections = sorted([f.stem for f in (V2/'templates/sections').glob('*.twig')])
    miss = set(canon_parts) - set(v2_sections)
    print(f'  canonical parts: {len(canon_parts)} | v2 sections: {len(v2_sections)}')
    if miss: print(f'  NOTE (ок если kumho-canvas): {sorted(miss)[:10]}')
else:
    print('  (canonical без templates/parts)')

# 2. Brand variables (КРИТИЧНО)
print('\n### 2. Brand variables ###')
brand_dir = CANON/'dev/src/assets/brands'
bvf = None
if brand_dir.exists():
    brands = [d for d in brand_dir.iterdir() if d.is_dir() and (d/'variables.css').exists()]
    bvf = (brand_dir/args.brand/'variables.css') if args.brand else (brands[0]/'variables.css' if brands else None)
v2vf = V2/'assets/css/base/variables.css'
if bvf and bvf.exists() and v2vf.exists():
    norm = lambda s: set(re.sub(r'\s+', '', x) for x in re.findall(r'--color-\d+:\s*[^;]+;', s))
    cset, vset = norm(bvf.read_text()), norm(v2vf.read_text())
    print(f'  canonical colors: {len(cset)} | matched в v2: {len(cset & vset)}')
    if not (cset <= vset): fail(f'brand colors не в v2: {cset - vset}')
else:
    print('  (brand variables не найдены — проверить вручную)')

# 3. Data/img (КРИТИЧНО)
print('\n### 3. Data/img references ###')
all_paths, missing = set(), set()
for url in args.urls:
    for p in re.findall(r'data/img/[a-zA-Z0-9_./\-]+', render(url)):
        all_paths.add(p)
        if not (V2/p).exists(): missing.add(p)
print(f'  total unique paths: {len(all_paths)}')
if missing:
    for p in sorted(missing): fail(f'image missing: {p}')
else:
    print('  ✓ all exist')

# 4. Public symlinks (КРИТИЧНО)
print('\n### 4. Public symlinks ###')
for name in ['data', 'assets']:
    p = V2/'public'/name
    if p.is_symlink(): print(f'  ✓ public/{name} → {os.readlink(p)}')
    else: fail(f'public/{name} не symlink (assets+data будут 404)')

# 5. JS build manifest (КРИТИЧНО)
print('\n### 5. JS build manifest ###')
mp = V2/'assets/js/build/asset-manifest.json'
if mp.exists():
    m = json.loads(mp.read_text())
    for k, v in m.items():
        if not k.endswith('.map') and not (V2/v).exists(): fail(f'JS chunk missing: {v}')
    print(f'  ✓ {len([k for k in m if not k.endswith(".map")])} chunks')
else:
    fail('no asset-manifest.json — run npm run build:dev')

# 6. scripts.twig
print('\n### 6. Scripts.twig refs ###')
sp = V2/'templates/components/scripts.twig'
if sp.exists():
    for ref in re.findall(r'assets/js/[a-zA-Z0-9_./\-]+\.js', sp.read_text()):
        if not (V2/ref).exists(): fail(f'scripts.twig ref missing: {ref}')
    print('  ✓ checked')

# 7. HTTP smoke (КРИТИЧНО)
print('\n### 7. HTTP smoke per URL ###')
for url in args.urls:
    out = render(url)
    size = len(out)
    warn = len(re.findall(r'Warning|Array to string|Не найдены|Ошибка сервера|Fatal error', out))
    if size < 5000 or warn > 0: fail(f'{url}: size={size}b warnings={warn}')
    else: print(f'  ✓ {url}: {size}b')

print('\n' + '=' * 70)
if fails:
    print(f'VERIFY FAILED — {len(fails)} проблем')
    sys.exit(1)
print('✓ VERIFY PASSED')
sys.exit(0)
