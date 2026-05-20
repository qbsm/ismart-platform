#!/usr/bin/env node

/**
 * distill — CLI для file-level tracking между ismart-platform (baseline)
 * и production deployments (kumho-tires.ru, italycommunity.ru, beepitron.ru, ...).
 *
 * Команды:
 *   scan                                 Построить manifest baseline'а → .distill/manifest.json
 *   diff <deployment-path>               Сравнить baseline с deployment'ом
 *   status                               Обзор drift'а по всем siblings
 *   init <slug>                          Создать новый deployment из baseline
 *   mark-override <deployment> <file>    Пометить файл как deployment-specific override
 *     "<reason>"
 *
 * Запуск:
 *   node tools/distill/distill.mjs <command> [args]
 *   npm run distill -- <command> [args]
 *
 * Документация: docs/architecture/distillation.md, §6.
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import {
  PLATFORM_ROOT,
  buildManifest,
  loadOrBuildBaseline,
  compareManifests,
  walkFiles,
  copyFile,
  writeJson,
  writeText,
  getBaselineCommit,
  getBaselineBranch,
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

async function cmdInit(slug, opts) {
  if (!slug || !slug.match(/^[a-z0-9.-]+$/)) {
    console.error('slug должен быть в kebab-case ([a-z0-9.-]+), например: retail-logistik');
    process.exit(1);
  }

  const parent = dirname(PLATFORM_ROOT);
  const newPath = join(parent, slug);

  if (existsSync(newPath)) {
    console.error(`Каталог уже существует: ${newPath}`);
    process.exit(1);
  }

  process.stderr.write(`init: создаю deployment '${slug}' в ${newPath}\n`);
  await mkdir(newPath, { recursive: true });

  // 1) Копируем CORE из baseline. .dist-файлы — конвертируем в активные.
  // Если в baseline есть и foo.dist, и foo — берём foo (deployment активный).
  const distFiles = new Set();
  const allRels = [];
  for await (const rel of walkFiles(PLATFORM_ROOT)) {
    allRels.push(rel);
    if (rel.endsWith('.dist')) distFiles.add(rel.slice(0, -5));
  }

  let copied = 0;
  for (const rel of allRels) {
    let dstRel = rel;
    if (rel.endsWith('.dist')) {
      // .dist → активное имя, но только если активного нет в baseline
      const active = rel.slice(0, -5);
      if (allRels.includes(active)) continue; // активный уже скопируется отдельно
      dstRel = active;
    } else if (distFiles.has(rel)) {
      // активный файл уже есть в baseline — он win'ит над .dist
    }
    await copyFile(join(PLATFORM_ROOT, rel), join(newPath, dstRel));
    copied++;
  }
  process.stderr.write(`  ✓ скопировано ${copied} файлов (CORE + конвертированные .dist)\n`);

  // 2) .env из .env.example с подстановкой
  const envExamplePath = join(newPath, '.env.example');
  if (existsSync(envExamplePath)) {
    let env = await readFile(envExamplePath, 'utf8');
    if (opts.domain) {
      const url = opts.domain.startsWith('http') ? opts.domain : `https://${opts.domain}/`;
      env = env.replace(/^APP_BASE_URL=.*/m, `APP_BASE_URL=${url}`);
    }
    if (opts.name) {
      env = env.replace(/^MAIL_FROM_NAME=.*/m, `MAIL_FROM_NAME="${opts.name}"`);
      env = env.replace(/^MAIL_SUBJECT_PREFIX=.*/m, `MAIL_SUBJECT_PREFIX=[${opts.name}]`);
    }
    if (opts.lang) {
      env = env.replace(/^APP_DEFAULT_LANG=.*/m, `APP_DEFAULT_LANG=${opts.lang}`);
    }
    await writeText(join(newPath, '.env'), env);
    process.stderr.write(`  ✓ .env создан${opts.domain ? ` (APP_BASE_URL=${opts.domain})` : ''}\n`);
  }

  // 3) .distill/state.json — стартовый snapshot, отсылающий на текущий baseline-commit
  const state = {
    $schema: 'https://ismart.pro/schemas/distill-state-v1.json',
    platform_repo: 'github:qbsm/ismart-platform',
    platform_version: '1.0.0',
    platform_commit: getBaselineCommit(),
    platform_branch: getBaselineBranch(),
    last_sync: new Date().toISOString(),
    overrides: {},
    drift: {},
    notes: [
      `Deployment '${slug}' создан через 'distill init' (${new Date().toISOString().split('T')[0]}).`,
      "Override'ы добавляются через 'distill mark-override' по мере появления deployment-specific правок.",
    ],
  };
  await writeJson(join(newPath, '.distill', 'state.json'), state);
  process.stderr.write('  ✓ .distill/state.json создан\n');

  console.log(`\n✓ deployment '${slug}' готов: ${newPath}`);
  console.log('');
  console.log('Дальше:');
  console.log(`  cd ${newPath}`);
  console.log('  git init && git add -A && git commit -m "init: создан из ismart-platform baseline"');
  console.log('  composer install');
  console.log('  npm install');
  console.log('  # отредактировать config/project.php (route_map, collections, sitemap_pages)');
  console.log('  # отредактировать data/json/global.json (логотип, контакты, навигация)');
  console.log('  npm run build:dev');
  console.log('  php -S localhost:8080 -t public');
}

async function cmdMarkOverride(deploymentPath, file, reason) {
  if (!file || !reason) {
    console.error('Использование: distill mark-override <deployment-path> <file> "<reason>"');
    process.exit(1);
  }

  const depAbs = resolve(deploymentPath);
  const statePath = join(depAbs, '.distill', 'state.json');

  if (!existsSync(statePath)) {
    console.error(`state.json не найден: ${statePath}`);
    console.error("Создайте через 'distill init' или скопируйте схему из docs/architecture/distillation.md §5.");
    process.exit(1);
  }

  const filePath = join(depAbs, file);
  if (!existsSync(filePath)) {
    console.error(`файл не найден: ${filePath}`);
    console.error('Override помечает существующий в deployment файл как намеренное расхождение с baseline.');
    process.exit(1);
  }

  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.overrides = state.overrides ?? {};
  const today = new Date().toISOString().split('T')[0];
  const existing = state.overrides[file];
  state.overrides[file] = {
    reason,
    accepted_drift: true,
    first_seen: existing?.first_seen ?? today,
    last_review: today,
  };

  // Если был в drift — убираем (override "побеждает")
  if (state.drift && state.drift[file]) {
    delete state.drift[file];
  }

  await writeJson(statePath, state);
  console.log(`✓ ${file} → overrides в ${relative(process.cwd(), statePath)}`);
  console.log(`  reason: ${reason}`);
}

function printHelp() {
  console.log(`distill — file-level tracking между ismart-platform и deployments

Команды:
  scan                                Построить manifest baseline'а → .distill/manifest.json
  diff <deployment-path>              Сравнить baseline с deployment'ом
  status                              Обзор drift'а по всем siblings (kumho/italy/beepitron)
  init <slug>                         Создать новый deployment из baseline
  mark-override <dep> <file> <reason> Пометить файл как deployment-specific override
  help                                Это сообщение

Флаги для diff:
  --limit=N                  Ограничить drift/missing N строками (default 50)
  --unique-all               Не обрезать список unique-to-deployment
  --no-unique                Скрыть unique-to-deployment

Флаги для init:
  --name "<name>"            Заполнит MAIL_FROM_NAME и MAIL_SUBJECT_PREFIX в .env
  --domain <domain>          Заполнит APP_BASE_URL (https://<domain>/) в .env
  --lang <code>              APP_DEFAULT_LANG (default ru)

Примеры:
  npm run distill:scan
  npm run distill -- diff ../kumho-tires.ru
  npm run distill -- status
  npm run distill -- init retail-logistik --name "Ритейл Логистик" --domain retail-logistik.ru
  npm run distill -- mark-override ../kumho-tires.ru src/Action/PhotoroomRemoveBackgroundAction.php "kumho-only Photoroom"

Документация: docs/architecture/distillation.md §6, tools/distill/README.md.
`);
}

function parseArgs(args) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--limit=')) opts.limit = parseInt(a.slice(8), 10);
    else if (a === '--unique-all') opts.uniqueLimit = Infinity;
    else if (a === '--no-unique') opts.showUnique = false;
    else if (a === '--name') opts.name = args[++i];
    else if (a.startsWith('--name=')) opts.name = a.slice(7);
    else if (a === '--domain') opts.domain = args[++i];
    else if (a.startsWith('--domain=')) opts.domain = a.slice(9);
    else if (a === '--lang') opts.lang = args[++i];
    else if (a.startsWith('--lang=')) opts.lang = a.slice(7);
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
    case 'init':
      if (!positional[0]) {
        console.error('Использование: distill init <slug> [--name "..."] [--domain ...] [--lang ru]');
        process.exit(1);
      }
      return cmdInit(positional[0], opts);
    case 'mark-override':
      if (positional.length < 3) {
        console.error('Использование: distill mark-override <deployment-path> <file> "<reason>"');
        process.exit(1);
      }
      return cmdMarkOverride(positional[0], positional[1], positional.slice(2).join(' '));
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
