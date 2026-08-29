/**
 * Divergence-audit analyzer.
 *
 * Для каждого deployment'а делает file-level diff с baseline и классифицирует
 * drift с учётом `.distill/state.json :: overrides`:
 *
 *   intentional   — drifted файл явно зафиксирован как override (намеренный)
 *   ready-to-sync — drifted файл НЕ override → можно `distill sync` (улучшение в baseline)
 *   unreviewed    — drifted без override и без явного решения (требует ревью)
 *
 * В текущем MVP intentional + unreviewed = drifted minus ready-to-sync;
 * differentiator между intentional и unreviewed = присутствие в overrides.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function divergenceAudit(platformPath, deployments) {
  const results = [];
  const distill = join(platformPath, 'tools/distill/distill.mjs');
  if (!existsSync(distill)) return results;

  for (const d of deployments) {
    try {
      const out = execSync(
        `node "${distill}" diff "${d.path}" --limit=10000 --no-unique 2>/dev/null`,
        { cwd: platformPath, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
      );

      const overrides = readOverrides(d.path);
      const drifted = extractFilesByPrefix(out, /^\s+M\s+(\S.*)$/gm);

      let intentional = 0;
      let readyToSync = 0;
      for (const file of drifted) {
        if (overrides.has(file)) intentional++;
        else readyToSync++;
      }

      const counts = {
        deployment: d.slug,
        identical: parseLineCount(out, /identical[:\s]+(\d+)/i),
        drifted: drifted.length || parseLineCount(out, /drifted[:\s]+(\d+)/i),
        missing: parseLineCount(out, /missing[^\s:]*[:\s]+(\d+)/i),
        unique: parseLineCount(out, /unique[^\s:]*[:\s]+(\d+)/i),
        intentional,
        readyToSync,
        overridesTotal: overrides.size,
      };
      if (counts.drifted > 0 || counts.missing > 0) results.push(counts);
    } catch (e) {
      results.push({ deployment: d.slug, error: e.message?.slice(0, 200) || 'distill diff failed' });
    }
  }
  return results;
}

function readOverrides(deploymentPath) {
  const set = new Set();
  try {
    const data = JSON.parse(readFileSync(join(deploymentPath, '.distill/state.json'), 'utf8'));
    for (const file of Object.keys(data.overrides || {})) set.add(file);
  } catch {}
  return set;
}

function extractFilesByPrefix(text, regex) {
  const result = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    const file = m[1].trim();
    if (file && !file.startsWith('...')) result.push(file);
  }
  return result;
}

function parseLineCount(text, pattern) {
  const m = text.match(pattern);
  return m ? parseInt(m[1], 10) : 0;
}
