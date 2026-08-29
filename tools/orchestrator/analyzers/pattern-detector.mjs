/**
 * Pattern detector.
 *
 * Сканирует templates/, assets/css/, data/json/ deployments на anti-patterns.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const TEMPLATE_DIRS = ['templates'];
const DATA_DIRS = ['data/json'];

const PATTERNS = [
  {
    kind: 'numeric-id-slug',
    glob: 'data/json',
    isMatch: async (path) => /\/(?:management|catalogs|certificates|docs|categories|services|products|news|video)\/\d+\.json$/.test(path),
    describe: () => 'entity-файл с numeric slug — лучше переименовать в семантический',
  },
  {
    kind: 'legacy-container-narrow',
    glob: 'templates',
    test: /<div\s+class="container\s+narrow"/,
    describe: () => '"container narrow" — legacy. Использовать .container-sm',
  },
  {
    kind: 'inline-color-hex',
    glob: 'assets/css',
    test: /background:\s*#[0-9A-Fa-f]{3,6}\b(?!\s*var)/,
    describe: () => 'hex-цвет hardcoded — вынести в --color-* в variables.css',
  },
  {
    kind: 'inline-style',
    glob: 'templates',
    test: /<div[^>]+style="(?!background-image:url)/,
    describe: () => 'inline style — вынести в CSS-класс',
  },
];

export async function patternDetector(deployments) {
  const findings = [];
  for (const d of deployments) {
    for (const pattern of PATTERNS) {
      const root = join(d.path, pattern.glob);
      const files = await walk(root);
      for (const file of files) {
        try {
          if (pattern.isMatch) {
            if (await pattern.isMatch(file)) {
              findings.push({
                deployment: d.slug,
                kind: pattern.kind,
                file: file.replace(d.path + '/', ''),
                detail: pattern.describe(file),
              });
            }
          } else if (pattern.test) {
            const content = await readFile(file, 'utf8');
            if (pattern.test.test(content)) {
              findings.push({
                deployment: d.slug,
                kind: pattern.kind,
                file: file.replace(d.path + '/', ''),
                detail: pattern.describe(file),
              });
            }
          }
        } catch {}
      }
    }
  }
  return findings;
}

async function walk(dir) {
  const out = [];
  let entries;
  try { entries = await readdir(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    let s;
    try { s = await stat(p); } catch { continue; }
    if (s.isDirectory()) {
      if (['node_modules', 'vendor', '.git', 'cache', 'logs', 'build'].includes(e)) continue;
      out.push(...await walk(p));
    } else {
      out.push(p);
    }
  }
  return out;
}
