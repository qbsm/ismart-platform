/**
 * deployment-proposals analyzer (ADR-0008)
 *
 * Сканирует <deployment>/docs/proposals/*.md во всех siblings'ах,
 * извлекает title + Status, группирует по похожим темам (keyword overlap)
 * — выявляет паттерны для cross-deployment baseline proposal или ADR.
 *
 * Вывод: структурированный JSON для health-report.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ORCH_ROOT = resolve(dirname(__filename), '../../..');

const SIBLING_DEPLOYMENTS = ['kumho-tires.ru', 'italycommunity.ru', 'beepitron.com'];

/**
 * Простая heuristic: 2 proposal'а на одну тему, если у них пересекаются
 * >= 2 значимых слова в title (длиннее 3 символов, не стоп-слова).
 */
const STOPWORDS = new Set([
  'для', 'через', 'после', 'нужно', 'надо', 'когда', 'если', 'этот', 'этого', 'этой',
  'для', 'про', 'без', 'про', 'или', 'это', 'все', 'все', 'свои', 'свой',
  'and', 'the', 'for', 'with', 'from', 'into', 'after', 'before', 'this', 'that',
]);

function extractKeywords(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^а-яё\w\s-]/giu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  );
}

function intersect(a, b) {
  const out = new Set();
  for (const x of a) if (b.has(x)) out.add(x);
  return out;
}

function readProposal(path) {
  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  const lines = content.split('\n');
  const title = (lines[0] || '').replace(/^#+\s*/, '').trim();
  const statusMatch = content.match(/\*\*Status[:\*]+\s*([^\n*]+)/i);
  const status = statusMatch ? statusMatch[1].trim() : 'Proposed';
  return { title, status, keywords: extractKeywords(title) };
}

export async function analyzeDeploymentProposals() {
  const parent = dirname(ORCH_ROOT);
  const all = [];

  for (const slug of SIBLING_DEPLOYMENTS) {
    const proposalsDir = join(parent, slug, 'docs', 'proposals');
    if (!existsSync(proposalsDir)) continue;
    let files;
    try {
      files = readdirSync(proposalsDir).filter((f) => f.endsWith('.md') && f !== 'README.md');
    } catch {
      continue;
    }
    for (const file of files) {
      const data = readProposal(join(proposalsDir, file));
      if (data === null) continue;
      all.push({
        deployment: slug,
        file: `${slug}/docs/proposals/${file}`,
        ...data,
      });
    }
  }

  // Группируем по pattern (2+ deployments на похожую тему)
  const patterns = [];
  const seen = new Set();
  for (let i = 0; i < all.length; i++) {
    if (seen.has(i)) continue;
    const group = [all[i]];
    for (let j = i + 1; j < all.length; j++) {
      if (seen.has(j)) continue;
      if (all[i].deployment === all[j].deployment) continue; // pattern только cross-deployment
      const common = intersect(all[i].keywords, all[j].keywords);
      if (common.size >= 2) {
        group.push(all[j]);
        seen.add(j);
      }
    }
    if (group.length >= 2) {
      patterns.push({
        keywords: [...intersect(group[0].keywords, group[1].keywords)],
        proposals: group.map(({ deployment, file, title, status }) => ({
          deployment,
          file,
          title,
          status,
        })),
      });
      seen.add(i);
    }
  }

  return {
    total: all.length,
    by_deployment: SIBLING_DEPLOYMENTS.map((slug) => ({
      deployment: slug,
      count: all.filter((p) => p.deployment === slug).length,
    })),
    patterns,
    all_proposals: all.map(({ deployment, file, title, status }) => ({
      deployment,
      file,
      title,
      status,
    })),
  };
}

export function renderDeploymentProposalsSection(result) {
  const lines = [];
  lines.push('## Deployment Proposals (ADR-0008)');
  lines.push('');
  lines.push(`Всего proposals в deployments: ${result.total}`);
  for (const { deployment, count } of result.by_deployment) {
    lines.push(`- ${deployment}: ${count}`);
  }

  if (result.patterns.length > 0) {
    lines.push('');
    lines.push('### Pattern: 2+ deployments на схожую тему — кандидат на baseline ADR');
    lines.push('');
    for (const p of result.patterns) {
      lines.push(`**Keywords:** ${p.keywords.join(', ')}`);
      for (const item of p.proposals) {
        lines.push(`- ${item.file} — ${item.title} _(${item.status})_`);
      }
      lines.push('');
    }
  } else {
    lines.push('');
    lines.push('_Пока нет cross-deployment паттернов._');
  }

  if (result.all_proposals.length > 0) {
    lines.push('');
    lines.push('### Все proposals по deployments');
    lines.push('');
    for (const p of result.all_proposals) {
      lines.push(`- ${p.file} — ${p.title} _(${p.status})_`);
    }
  }

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  analyzeDeploymentProposals().then((res) => {
    console.log(renderDeploymentProposalsSection(res));
  });
}
