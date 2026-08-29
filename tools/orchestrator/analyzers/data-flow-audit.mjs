/**
 * Data-flow analyzer.
 *
 * Находит секции на pages где data.items пуст ИЛИ отсутствует, но есть
 * entity-папка совпадающая с именем секции (или её корнем без -list/-slider/-container).
 *
 * Это самый частый источник "не найдено" в baseline (8/8 случаев в beepitron audit).
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const SECTION_SUFFIXES = ['-list', '-slider', '-container'];

export async function dataFlowAudit(deployments) {
  const findings = [];
  for (const d of deployments) {
    const langsRoot = join(d.path, 'data/json');
    let langs = [];
    try { langs = await readdir(langsRoot); } catch { continue; }
    for (const lang of langs) {
      const langPath = join(langsRoot, lang);
      try { if (!(await stat(langPath)).isDirectory()) continue; } catch { continue; }
      const pagesDir = join(langPath, 'pages');
      try { await stat(pagesDir); } catch { continue; }

      // Entity-папки в lang (все sibling-папки от pages/, кроме pages, seo)
      const entityDirs = new Set();
      for (const e of await readdir(langPath)) {
        if (e === 'pages' || e === 'seo') continue;
        try {
          const s = await stat(join(langPath, e));
          if (s.isDirectory()) entityDirs.add(e);
        } catch {}
      }

      // Pages
      for (const pageFile of await readdir(pagesDir)) {
        if (!pageFile.endsWith('.json')) continue;
        let pageData;
        try {
          pageData = JSON.parse(await readFile(join(pagesDir, pageFile), 'utf8'));
        } catch { continue; }
        const pageId = pageFile.replace('.json', '');
        const sections = pageData.sections;
        if (!Array.isArray(sections)) continue;

        for (const s of sections) {
          if (!s || typeof s !== 'object') continue;
          const name = s.name;
          if (!name) continue;
          const items = s.data?.items;
          if (Array.isArray(items) && items.length > 0) continue;
          // ADR-0004: секция с data.items_from резолвится DataLoader'ом на runtime — не finding.
          if (typeof s.data?.items_from === 'string' && s.data.items_from !== '') continue;

          // Determine candidate entity dir
          let candidate = entityDirs.has(name) ? name : null;
          if (!candidate) {
            for (const suf of SECTION_SUFFIXES) {
              if (name.endsWith(suf)) {
                const base = name.slice(0, -suf.length);
                if (entityDirs.has(base)) { candidate = base; break; }
              }
            }
          }
          if (!candidate) continue;

          // Skip noise: header, footer, hero (special-case через injectListItems)
          if (['header', 'footer'].includes(name)) continue;

          findings.push({
            deployment: d.slug,
            page: `${lang}/${pageId}.json`,
            section: name,
            source: `data/json/${lang}/${candidate}/*.json`,
          });
        }
      }
    }
  }
  return findings;
}
