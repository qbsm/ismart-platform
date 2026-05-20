#!/usr/bin/env node

/**
 * distill — CLI для file-level tracking между ismart-platform (baseline)
 * и production deployments (kumho-tires.ru, italycommunity.ru, beepitron.ru, ...).
 *
 * Команды:
 *   scan                       Построить manifest baseline'а → .distill/manifest.json
 *   diff <deployment-path>     Сравнить baseline с deployment'ом
 *   status                     Обзор drift'а по всем siblings (kumho/italy/beepitron)
 *
 * Запуск:
 *   node tools/distill/distill.mjs <command> [args]
 *   npm run distill -- <command> [args]
 *
 * Документация: docs/architecture/distillation.md, §6.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import {
  PLATFORM_ROOT,
  buildManifest,
  loadOrBuildBaseline,
  compareManifests,
} from './lib.mjs';

const SIBLING_DEPLOYMENTS = ['kumho-tires.ru', 'italycommunity.ru', 'beepitron.ru'];
const STATUS_ICONS = { drift: 'M', unique: '+', missing: '-' };

async function cmdScan() {
  process.stderr.write(`сканирую ${PLATFORM_ROOT} ...\n`);
  const files = await buildManifest(PLATFORM_ROOT);
  const manifest = {
    $schema: 'https://ismart.pro/schemas/distill-manifest-v1.json',
    platform_version: '1.0.0',
    generated_at: new Date().toISOString(),
    file_count: Object.keys(files).length,
    files,
  };
  const outDir = join(PLATFORM_ROOT, '.distill');
  if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, 'manifest.json');
  await writeFile(outPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✓ manifest: ${manifest.file_count} файлов → ${relative(PLATFORM_ROOT, outPath)}`);
}

async function cmdDiff(deploymentPath, opts) {
  const deploymentAbs = resolve(deploymentPath);
  if (!existsSync(deploymentAbs)) {
    console.error(`deployment не найден: ${deploymentAbs}`);
    process.exit(1);
  }
  process.stderr.write(`baseline:   ${PLATFORM_ROOT}\n`);
  process.stderr.write(`deployment: ${deploymentAbs}\n`);

  const baseline = await loadOrBuildBaseline();
  const deployment = await buildManifest(deploymentAbs);
  const { identical, drifted, uniqueToDeployment, missingInDeployment } =
    compareManifests(baseline, deployment);

  const limit = opts.limit ?? 50;
  console.log();
  console.log(`=== drift report ===`);
  console.log(`baseline:   ${PLATFORM_ROOT}`);
  console.log(`deployment: ${deploymentAbs}`);
  console.log();
  console.log(`identical:              ${identical.length}`);
  console.log(`drifted:                ${drifted.length}`);
  console.log(`unique-to-deployment:   ${uniqueToDeployment.length}`);
  console.log(`missing-in-deployment:  ${missingInDeployment.length}`);
  console.log();

  printGroup('DRIFTED (содержимое расходится)', drifted, STATUS_ICONS.drift, limit);
  printGroup('MISSING IN DEPLOYMENT (есть в baseline, нет в deployment)', missingInDeployment, STATUS_ICONS.missing, limit);
  if (opts.showUnique !== false) {
    printGroup('UNIQUE TO DEPLOYMENT (есть в deployment, нет в baseline)', uniqueToDeployment, STATUS_ICONS.unique, opts.uniqueLimit ?? 30);
  }
}

function printGroup(title, items, icon, limit) {
  if (!items.length) return;
  console.log(`--- ${title} ---`);
  items.sort();
  items.slice(0, limit).forEach(p => console.log(`  ${icon} ${p}`));
  if (items.length > limit) console.log(`  ... и ещё ${items.length - limit}`);
  console.log();
}

async function cmdStatus() {
  const parent = dirname(PLATFORM_ROOT);
  const baseline = await loadOrBuildBaseline();

  console.log();
  console.log(`baseline: ${PLATFORM_ROOT}  (${Object.keys(baseline).length} файлов)`);
  console.log();
  console.log('deployment           | identical | drifted | unique | missing');
  console.log('---------------------|-----------|---------|--------|--------');

  for (const name of SIBLING_DEPLOYMENTS) {
    const path = join(parent, name);
    if (!existsSync(path)) {
      console.log(`${name.padEnd(20)} | (not found at ${path})`);
      continue;
    }
    const dep = await buildManifest(path);
    const { identical, drifted, uniqueToDeployment, missingInDeployment } =
      compareManifests(baseline, dep);
    console.log(
      `${name.padEnd(20)} | ${pad(identical.length, 9)} | ${pad(drifted.length, 7)} | ${pad(uniqueToDeployment.length, 6)} | ${pad(missingInDeployment.length, 7)}`,
    );
  }
  console.log();
}

const pad = (n, w) => String(n).padStart(w);

function printHelp() {
  console.log(`distill — file-level tracking между ismart-platform и deployments

Команды:
  scan                       Построить manifest baseline'а → .distill/manifest.json
  diff <deployment-path>     Сравнить baseline с deployment'ом
  status                     Обзор drift'а по всем siblings (kumho/italy/beepitron)
  help                       Это сообщение

Флаги для diff:
  --limit=N                  Ограничить drift/missing N строками (default 50)
  --unique-all               Не обрезать список unique-to-deployment
  --no-unique                Скрыть unique-to-deployment

Примеры:
  npm run distill:scan
  npm run distill -- diff ../kumho-tires.ru
  npm run distill -- status

Документация: docs/architecture/distillation.md §6, tools/distill/README.md.
`);
}

function parseArgs(args) {
  const opts = {};
  const positional = [];
  for (const a of args) {
    if (a.startsWith('--limit=')) opts.limit = parseInt(a.slice(8), 10);
    else if (a === '--unique-all') opts.uniqueLimit = Infinity;
    else if (a === '--no-unique') opts.showUnique = false;
    else positional.push(a);
  }
  return { opts, positional };
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return printHelp();
  const { opts, positional } = parseArgs(rest);

  switch (cmd) {
    case 'scan':
      return cmdScan();
    case 'diff':
      if (!positional[0]) {
        console.error('Использование: distill diff <deployment-path>');
        process.exit(1);
      }
      return cmdDiff(positional[0], opts);
    case 'status':
      return cmdStatus();
    default:
      console.error(`неизвестная команда: ${cmd}`);
      printHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
