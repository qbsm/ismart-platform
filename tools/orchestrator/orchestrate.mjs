#!/usr/bin/env node
/**
 * tools/orchestrator/orchestrate.mjs
 *
 * Раннер оркестратора. Прогоняет analyzer'ы и собирает summary report.
 *
 * Запуск: npm run orchestrate
 * Также: npm run orchestrate -- --only=data-flow
 *
 * См. docs/architecture/orchestrator-role.md.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dataFlowAudit } from './analyzers/data-flow-audit.mjs';
import { divergenceAudit } from './analyzers/divergence-audit.mjs';
import { patternDetector } from './analyzers/pattern-detector.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLATFORM = resolve(__dirname, '../..');
const SIBLING_PARENT = resolve(PLATFORM, '..');

const DEPLOYMENTS = [
  'kumho-tires.ru',
  'italycommunity.ru',
  'beepitron.com',
  'trazano-tires.ru-v2',
  'mirage-russia.ru-v2',
];

const args = process.argv.slice(2);
const only = args.find(a => a.startsWith('--only='))?.split('=')[1];

async function main() {
  const deployments = DEPLOYMENTS
    .map(slug => ({ slug, path: join(SIBLING_PARENT, slug) }))
    .filter(d => existsSync(d.path));

  console.log(`Оркестрация по ${deployments.length} deployments...\n`);

  const results = {};

  if (!only || only === 'data-flow') {
    console.log('▸ data-flow-audit...');
    results.dataFlow = await dataFlowAudit(deployments);
  }
  if (!only || only === 'divergence') {
    console.log('▸ divergence-audit...');
    results.divergence = await divergenceAudit(PLATFORM, deployments);
  }
  if (!only || only === 'patterns') {
    console.log('▸ pattern-detector...');
    results.patterns = await patternDetector(deployments);
  }

  // Сборка report'а
  const reportDir = join(PLATFORM, 'docs/orchestrator');
  if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const reportPath = join(reportDir, `health-${date}.md`);

  const report = renderReport(results, date, deployments);
  writeFileSync(reportPath, report);

  console.log(`\n✓ Отчёт: ${reportPath.replace(PLATFORM + '/', '')}`);
  console.log('\nКраткая сводка:');
  for (const [k, v] of Object.entries(results)) {
    const count = Array.isArray(v) ? v.length : v?.findings?.length ?? '?';
    console.log(`  ${k}: ${count} findings`);
  }
}

function renderReport(results, date, deployments) {
  const lines = [];
  lines.push(`# Health Report — ${date}`);
  lines.push('');
  lines.push(`Автоматический отчёт оркестратора по ${deployments.length} deployments:`);
  for (const d of deployments) lines.push(`- \`${d.slug}\``);
  lines.push('');
  lines.push(`Сгенерирован: \`npm run orchestrate\``);
  lines.push(`См. концепцию: [docs/architecture/orchestrator-role.md](../architecture/orchestrator-role.md)`);
  lines.push('');

  if (results.dataFlow) {
    lines.push('## Data flow — пустые секции с доступными источниками');
    lines.push('');
    if (results.dataFlow.length === 0) {
      lines.push('✓ Clean — нет секций с пустым `data.items` где есть entity-папка.');
    } else {
      lines.push('| Deployment | Page | Section | Источник |');
      lines.push('|---|---|---|---|');
      for (const f of results.dataFlow) {
        lines.push(`| ${f.deployment} | ${f.page} | ${f.section} | ${f.source} |`);
      }
      lines.push('');
      lines.push('**Рекомендация:** добавить `data.items_from` в baseline (см. opportunities), либо runtime populate.');
    }
    lines.push('');
  }

  if (results.divergence) {
    lines.push('## Divergence — drift между deployments и baseline');
    lines.push('');
    const counts = results.divergence;
    if (counts.length === 0) {
      lines.push('✓ Все deployments sync с baseline (по CORE).');
    } else {
      lines.push('| Deployment | Drifted | Identical | Missing | Unique |');
      lines.push('|---|---|---|---|---|');
      for (const c of counts) {
        lines.push(`| ${c.deployment} | ${c.drifted} | ${c.identical} | ${c.missing} | ${c.unique} |`);
      }
      lines.push('');
      lines.push('Детально: `npm run distill -- diff <deployment>`.');
    }
    lines.push('');
  }

  if (results.patterns) {
    lines.push('## Pattern detector — anti-patterns / legacy');
    lines.push('');
    if (results.patterns.length === 0) {
      lines.push('✓ Patterns clean.');
    } else {
      const byDep = {};
      for (const p of results.patterns) {
        if (!byDep[p.deployment]) byDep[p.deployment] = [];
        byDep[p.deployment].push(p);
      }
      for (const [dep, list] of Object.entries(byDep)) {
        lines.push(`### ${dep}`);
        for (const p of list) {
          lines.push(`- **${p.kind}** в \`${p.file}\`: ${p.detail}`);
        }
        lines.push('');
      }
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## Open opportunities (см. roadmap)');
  lines.push('');
  lines.push('Систематические улучшения которые просятся в baseline — список в [opportunities.md](opportunities.md).');
  lines.push('');

  return lines.join('\n');
}

main().catch(err => { console.error(err); process.exit(1); });
