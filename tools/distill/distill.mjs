#!/usr/bin/env node

/**
 * distill — CLI для file-level tracking между ismart-platform (baseline)
 * и production deployments (kumho-tires.ru, italycommunity.ru, bp, ...).
 *
 * MVP (этап 1):
 *   - scan                    построить manifest baseline'а
 *   - diff <deployment-path>  сравнить baseline с deployment'ом
 *   - status                  обзор всех известных deployment'ов
 *
 * Запуск:
 *   node tools/distill/distill.mjs <command> [args]
 *   npm run distill -- <command> [args]
 *
 * Документация: DISTILLATION.md, §6.
 */

import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const PLATFORM_ROOT = resolve(dirname(__filename), '..', '..');

// Что НЕ включаем в manifest. Применяется к baseline и deployments одинаково.
const EXCLUDE_PREFIXES = [
  '.git',
  '.distill',
  'node_modules',
  'vendor',
  'cache',
  'logs',
  'tmp',
  'assets/css/build',
  'assets/js/build',
  'data/img',
  'data/catalogs',
  'public/data',
  'public/assets',
  'public/vendor',
  'public/src',
  'public/config',
  'public/templates',
];

// Файлы, которые игнорируем по имени независимо от пути.
const EXCLUDE_NAMES = new Set([
  '.DS_Store',
  'Thumbs.db',
  '.env',
  '.env.local',
  '.gitconfig',
  'composer.lock',
  'package-lock.json',
]);

// Расширения, которые игнорируем (бинарные медиа).
const EXCLUDE_EXTENSIONS = new Set([
  '.webp', '.avif', '.jpg', '.jpeg', '.png', '.gif',
  '.mp4', '.webm', '.mov', '.pdf', '.zip', '.tar', '.gz',
  '.ttf', '.woff', '.woff2', '.eot', '.otf',
]);

const STATUS_ICONS = {
  identical: '=',
  drift: 'M',
  unique_to_deployment: '+',
  missing_in_deployment: '-',
};

async function* walkFiles(root, rel = '') {
  const dirPath = rel ? join(root, rel) : root;
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const relPath = rel ? join(rel, entry.name) : entry.name;
    const relPosix = relPath.split(sep).join('/');
    if (isExcluded(relPosix, entry.name)) continue;
    if (entry.isDirectory()) {
      yield* walkFiles(root, relPath);
    } else if (entry.isFile()) {
      yield relPosix;
    }
  }
}

function isExcluded(relPosix, name) {
  if (EXCLUDE_NAMES.has(name)) return true;
  const dot = name.lastIndexOf('.');
  if (dot > 0 && EXCLUDE_EXTENSIONS.has(name.slice(dot).toLowerCase())) return true;
  for (const prefix of EXCLUDE_PREFIXES) {
    if (relPosix === prefix || relPosix.startsWith(prefix + '/')) return true;
  }
  return false;
}

async function fileSha256(path) {
  const content = await readFile(path);
  return createHash('sha256').update(content).digest('hex');
}

async function buildManifest(root) {
  const files = {};
  for await (const relPath of walkFiles(root)) {
    const abs = join(root, relPath);
    const st = await stat(abs);
    files[relPath] = {
      sha256: await fileSha256(abs),
      size: st.size,
    };
  }
  return files;
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return readFile(path, 'utf8').then(JSON.parse);
}

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

  console.log(`✓ manifest: ${manifest.file_count} файлов`);
  console.log(`  → ${relative(PLATFORM_ROOT, outPath)}`);
}

async function loadOrBuildBaseline() {
  const cached = await readJsonIfExists(join(PLATFORM_ROOT, '.distill', 'manifest.json'));
  if (cached) return cached.files;
  process.stderr.write('manifest.json не найден, строю на лету...\n');
  return buildManifest(PLATFORM_ROOT);
}

async function cmdDiff(deploymentPath, opts = {}) {
  const deploymentAbs = resolve(deploymentPath);
  if (!existsSync(deploymentAbs)) {
    console.error(`deployment не найден: ${deploymentAbs}`);
    process.exit(1);
  }

  process.stderr.write(`baseline:   ${PLATFORM_ROOT}\n`);
  process.stderr.write(`deployment: ${deploymentAbs}\n`);

  const baseline = await loadOrBuildBaseline();
  const deployment = await buildManifest(deploymentAbs);

  const identical = [];
  const drifted = [];
  const uniqueToDeployment = [];
  const missingInDeployment = [];

  for (const [path, base] of Object.entries(baseline)) {
    const dep = deployment[path];
    if (!dep) {
      missingInDeployment.push(path);
    } else if (base.sha256 === dep.sha256) {
      identical.push(path);
    } else {
      drifted.push(path);
    }
  }
  for (const path of Object.keys(deployment)) {
    if (!baseline[path]) uniqueToDeployment.push(path);
  }

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

  if (drifted.length) {
    console.log(`--- DRIFTED (содержимое расходится) ---`);
    drifted.sort();
    drifted.slice(0, limit).forEach(p => console.log(`  ${STATUS_ICONS.drift} ${p}`));
    if (drifted.length > limit) console.log(`  ... и ещё ${drifted.length - limit}`);
    console.log();
  }
  if (missingInDeployment.length) {
    console.log(`--- MISSING IN DEPLOYMENT (есть в baseline, нет в deployment) ---`);
    missingInDeployment.sort();
    missingInDeployment.slice(0, limit).forEach(p => console.log(`  ${STATUS_ICONS.missing_in_deployment} ${p}`));
    if (missingInDeployment.length > limit) console.log(`  ... и ещё ${missingInDeployment.length - limit}`);
    console.log();
  }
  if (uniqueToDeployment.length && opts.showUnique !== false) {
    console.log(`--- UNIQUE TO DEPLOYMENT (есть в deployment, нет в baseline) ---`);
    uniqueToDeployment.sort();
    const showCount = Math.min(uniqueToDeployment.length, opts.uniqueLimit ?? 30);
    uniqueToDeployment.slice(0, showCount).forEach(p => console.log(`  ${STATUS_ICONS.unique_to_deployment} ${p}`));
    if (uniqueToDeployment.length > showCount) {
      console.log(`  ... и ещё ${uniqueToDeployment.length - showCount} (используйте --unique-all для полного списка)`);
    }
    console.log();
  }
}

async function cmdStatus() {
  // По умолчанию ищем deployments рядом с baseline'ом — siblings в parent-каталоге.
  const parent = dirname(PLATFORM_ROOT);
  const candidates = ['kumho-tires.ru', 'italycommunity.ru', 'beepitron.ru'];

  const baseline = await loadOrBuildBaseline();
  const baselineCount = Object.keys(baseline).length;

  console.log();
  console.log(`baseline: ${PLATFORM_ROOT}  (${baselineCount} файлов)`);
  console.log();
  console.log('deployment           | identical | drifted | unique | missing');
  console.log('---------------------|-----------|---------|--------|--------');

  for (const name of candidates) {
    const path = join(parent, name);
    if (!existsSync(path)) {
      console.log(`${name.padEnd(20)} | (not found at ${path})`);
      continue;
    }
    const dep = await buildManifest(path);
    let identical = 0, drifted = 0, missing = 0;
    for (const [p, base] of Object.entries(baseline)) {
      const d = dep[p];
      if (!d) missing++;
      else if (d.sha256 === base.sha256) identical++;
      else drifted++;
    }
    const unique = Object.keys(dep).filter(p => !baseline[p]).length;
    console.log(
      `${name.padEnd(20)} | ${String(identical).padStart(9)} | ${String(drifted).padStart(7)} | ${String(unique).padStart(6)} | ${String(missing).padStart(7)}`,
    );
  }
  console.log();
}

function printHelp() {
  console.log(`distill — file-level tracking между ismart-platform и deployments

Команды:
  scan                       Построить manifest baseline'а → .distill/manifest.json
  diff <deployment-path>     Сравнить baseline с deployment'ом
  status                     Обзор drift'а по всем siblings (kumho/italy/bp)
  help                       Это сообщение

Флаги для diff:
  --limit=N                  Ограничить вывод drift/missing N строками (default 50)
  --unique-all               Не обрезать список unique-to-deployment

Примеры:
  node tools/distill/distill.mjs scan
  node tools/distill/distill.mjs diff ../kumho-tires.ru
  node tools/distill/distill.mjs diff ../italycommunity.ru --limit=10
  node tools/distill/distill.mjs status

Документация: DISTILLATION.md, §6.
`);
}

function parseOpts(args) {
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
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }
  const { opts, positional } = parseOpts(rest);

  if (cmd === 'scan') {
    await cmdScan();
  } else if (cmd === 'diff') {
    if (!positional[0]) {
      console.error('Использование: distill diff <deployment-path>');
      process.exit(1);
    }
    await cmdDiff(positional[0], opts);
  } else if (cmd === 'status') {
    await cmdStatus();
  } else {
    console.error(`неизвестная команда: ${cmd}`);
    printHelp();
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
