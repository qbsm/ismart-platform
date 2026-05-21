/**
 * Divergence-audit analyzer.
 *
 * Для каждого deployment'а делает file-level diff с baseline (через хеши
 * .distill/manifest.json) и считает категории drift.
 *
 * Использует уже существующий tools/distill/distill.mjs cmdDiff (importable
 * не сразу, пока шаг — shell-out).
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export async function divergenceAudit(platformPath, deployments) {
  const results = [];
  const distill = join(platformPath, 'tools/distill/distill.mjs');
  if (!existsSync(distill)) return results;

  for (const d of deployments) {
    try {
      const out = execSync(`node "${distill}" diff "${d.path}" --no-unique --quiet 2>/dev/null || node "${distill}" diff "${d.path}" 2>/dev/null`, {
        cwd: platformPath,
        encoding: 'utf8',
      });
      // Парсим типичный output cmdDiff: ищем "identical: N", "drifted: N" etc.
      const counts = {
        deployment: d.slug,
        identical: parseLineCount(out, /identical[:\s]+(\d+)/i),
        drifted: parseLineCount(out, /drifted[:\s]+(\d+)/i),
        missing: parseLineCount(out, /missing[^\s:]*[:\s]+(\d+)/i),
        unique: parseLineCount(out, /unique[^\s:]*[:\s]+(\d+)/i),
      };
      if (counts.drifted > 0 || counts.missing > 0) results.push(counts);
    } catch (e) {
      results.push({ deployment: d.slug, error: e.message?.slice(0, 200) || 'distill diff failed' });
    }
  }
  return results;
}

function parseLineCount(text, pattern) {
  const m = text.match(pattern);
  return m ? parseInt(m[1], 10) : 0;
}
