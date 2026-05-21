#!/usr/bin/env node

/**
 * Генератор docs/inventory/core.md: per-file карта ядра baseline'а +
 * статус (✓/M/✗) в kumho/italy/beepitron.
 *
 * Запуск: npm run distill:inventory
 *   (или: node tools/distill/build-inventory.mjs > docs/inventory/core.md)
 */

import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, sep, basename } from 'node:path';
import {
  PLATFORM_ROOT,
  fileSha256,
  extractDescription,
} from './lib.mjs';

const PARENT = dirname(PLATFORM_ROOT);

/** Имя колонки → путь к deployment'у. Порядок задаёт колонки таблицы. */
const DEPLOYMENTS = {
  kumho: join(PARENT, 'kumho-tires.ru'),
  italy: join(PARENT, 'italycommunity.ru'),
  beepitron: join(PARENT, 'beepitron.com'),
};
const DEP_KEYS = Object.keys(DEPLOYMENTS);

/** Группы файлов для таблицы. paths — явный список, glob — рекурсивный обход директории. */
const GROUPS = [
  { title: 'Точка входа и роутинг', paths: ['public/index.php', 'config/routes.php', 'config/middleware.php', 'config/container.php', 'config/settings.php', 'config/errors.php', 'config/project.php.dist', 'config/llms-full.php.dist', 'config/image-sizes.json', 'config/redirects.json'] },
  { title: 'src/Action — контроллеры', glob: 'src/Action/' },
  { title: 'src/Service — сервисный слой', glob: 'src/Service/' },
  { title: 'src/Middleware — middleware stack', glob: 'src/Middleware/' },
  { title: 'src/Handler — error handlers', glob: 'src/Handler/' },
  { title: 'src/Event — domain events', glob: 'src/Event/' },
  { title: 'src/Twig — Twig extensions', glob: 'src/Twig/' },
  { title: 'src/Support — поддерживающие классы', glob: 'src/Support/' },
  { title: 'src/Api — внешние интеграции (необязательно)', glob: 'src/Api/' },
  { title: 'tools/scaffold — генераторы (create-*)', glob: 'tools/scaffold/' },
  { title: 'tools/build — сборка', glob: 'tools/build/' },
  { title: 'tools/ops — операционные скрипты', glob: 'tools/ops/' },
  { title: 'tools/utils — утилиты', glob: 'tools/utils/' },
  { title: 'tools/distill — CLI трекинга', glob: 'tools/distill/' },
  { title: 'Корневые конфиги', paths: ['composer.json', 'package.json', 'webpack.config.js', 'postcss.config.js', 'eslint.config.js', 'stylelint.config.mjs', 'vitest.config.js', 'phpunit.xml', 'phpstan.neon', '.gitignore', '.htaccess', '.env.example'] },
  { title: 'Документация и базовые шаблоны', paths: ['README.md', 'CLAUDE.md', 'docs/README.md', 'docs/architecture/distillation.md', 'docs/inventory/core.md', 'docs/conventions/best-practices.md', 'docs/conventions/naming.md', 'docs/notes/improvements.md', 'templates/base.twig', 'templates/pages/page.twig'] },
];

async function* listFiles(absDir, rel = '') {
  let entries;
  try { entries = await readdir(absDir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.DS_Store')) continue;
    const r = rel ? join(rel, e.name) : e.name;
    if (e.isDirectory()) yield* listFiles(join(absDir, e.name), r);
    else yield r.split(sep).join('/');
  }
}

async function expandGroup(group) {
  if (group.paths) return group.paths;
  const abs = join(PLATFORM_ROOT, group.glob);
  if (!existsSync(abs)) return [];
  const out = [];
  for await (const rel of listFiles(abs)) out.push((group.glob + rel).replace(/\/+/g, '/'));
  return out.sort();
}

async function fileRow(relPath) {
  const abs = join(PLATFORM_ROOT, relPath);
  if (!existsSync(abs)) return null;
  const st = await stat(abs);
  if (!st.isFile()) return null;
  const sha = await fileSha256(abs);
  const row = {
    path: relPath,
    desc: (await extractDescription(abs)) || '—',
  };
  for (const [name, root] of Object.entries(DEPLOYMENTS)) {
    const depPath = join(root, relPath);
    if (!existsSync(depPath)) { row[name] = '✗'; continue; }
    row[name] = (await fileSha256(depPath)) === sha ? '✓' : 'M';
  }
  return row;
}

function classify(row) {
  const flags = DEP_KEYS.map(k => row[k]);
  const present = flags.filter(f => f !== '✗').length;
  const same = flags.filter(f => f === '✓').length;
  if (present === DEP_KEYS.length && same === DEP_KEYS.length) return 'CORE ✓';
  if (present === DEP_KEYS.length) return 'CORE drift';
  if (present === 0) return 'BASELINE-only';
  return `partial (${present}/${DEP_KEYS.length})`;
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 3) + '...' : s;
}

async function main() {
  const totals = { 'CORE ✓': 0, 'CORE drift': 0, 'BASELINE-only': 0, partial: 0 };
  const sections = [];

  for (const group of GROUPS) {
    const paths = await expandGroup(group);
    const rows = (await Promise.all(paths.map(fileRow))).filter(Boolean);
    if (!rows.length) {
      sections.push(`## ${group.title}\n\n_файлов нет_\n`);
      continue;
    }
    const header = `| Файл | Назначение | ${DEP_KEYS.join(' | ')} | Категория |`;
    const sep_  = `|---|---|${DEP_KEYS.map(() => ':-:').join('|')}|---|`;
    const body = rows.map(r => {
      const cat = classify(r);
      totals[cat.startsWith('partial') ? 'partial' : cat]++;
      const flagsCells = DEP_KEYS.map(k => r[k]).join(' | ');
      return `| \`${r.path}\` | ${truncate(r.desc, 80)} | ${flagsCells} | ${cat} |`;
    }).join('\n');
    sections.push(`## ${group.title}\n\n${header}\n${sep_}\n${body}\n`);
  }

  const today = new Date().toISOString().split('T')[0];
  console.log([
    '# CORE INVENTORY — ядро iSmart Platform',
    '',
    `Карта файлов **ядра** baseline\'а \`ismart-platform/\` с описанием назначения каждого и статусом в трёх production deployment\'ах (${DEP_KEYS.join(', ')}).`,
    '',
    '| Метка | Значение |',
    '|---|---|',
    '| `✓`   | файл присутствует и идентичен baseline\'у |',
    '| `M`   | файл присутствует, но содержимое расходится (drift) |',
    '| `✗`   | файла нет в deployment\'е |',
    '',
    'Категории:',
    '',
    `- \`CORE ✓\` — есть во всех ${DEP_KEYS.length}, идентичен. Безусловное ядро.`,
    `- \`CORE drift\` — есть во всех ${DEP_KEYS.length}, но содержимое разошлось. Кандидат на унификацию.`,
    `- \`partial (N/${DEP_KEYS.length})\` — есть только в части deployments.`,
    '- `BASELINE-only` — впервые в baseline\'е, ещё не распространён.',
    '',
    `Сгенерировано: \`npm run distill:inventory\` (${today})`,
    '',
    '---',
    '',
    ...sections,
    '---',
    '',
    '## Итоги по ядру',
    '',
    '| Категория | Кол-во |',
    '|---|---|',
    `| **CORE ✓** (идентичны во всех ${DEP_KEYS.length}) | ${totals['CORE ✓']} |`,
    `| **CORE drift** (есть везде, но разошлось) | ${totals['CORE drift']} |`,
    `| **partial** (отсутствует в части deployments) | ${totals.partial} |`,
    `| **BASELINE-only** (новые в baseline) | ${totals['BASELINE-only']} |`,
    '',
    '## Ключевые моменты для имплементации',
    '',
    '1. **`CORE ✓`** — маркировать в manifest как `sync_policy: strict`. Любой drift = баг.',
    '2. **`CORE drift`** — review per file: какая версия каноническая. Это первоочередная работа `distill sync`.',
    '3. **`partial`** — либо deployment-specific (override), либо CORE-кандидат, не докатился. Решается явной маркировкой.',
    '4. **`BASELINE-only`** — распространяется в deployments после согласования.',
    '',
  ].join('\n'));
}

main().catch(err => { console.error(err); process.exit(1); });
