#!/usr/bin/env node

/**
 * Генератор CORE-INVENTORY.md.
 * Собирает per-file данные о ядре baseline'а:
 *   - путь
 *   - краткое описание из docblock'а
 *   - sha256
 *   - наличие/совпадение в kumho/italy/beepitron
 *
 * Запуск: node tools/distill/build-inventory.mjs > CORE-INVENTORY.md
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const PLATFORM_ROOT = resolve(dirname(__filename), '..', '..');
const PARENT = dirname(PLATFORM_ROOT);

const DEPLOYMENTS = {
  kumho: join(PARENT, 'kumho-tires.ru'),
  italy: join(PARENT, 'italycommunity.ru'),
  beepitron: join(PARENT, 'beepitron.ru'),
};

// Группы для таблицы — порядок важен (отражается в отчёте).
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
  { title: 'Документация и базовые шаблоны', paths: ['README.md', 'CLAUDE.md', 'DISTILLATION.md', 'templates/base.twig', 'templates/pages/page.twig'] },
];

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

/** Извлекает короткое описание из первого комментария файла. */
async function extractDescription(absPath) {
  let text;
  try {
    text = await readFile(absPath, 'utf8');
  } catch {
    return '';
  }
  const ext = absPath.split('.').pop().toLowerCase();

  if (ext === 'php') {
    // PHPDoc или однострочный комментарий
    const phpdoc = text.match(/\/\*\*([\s\S]*?)\*\//);
    if (phpdoc) {
      const lines = phpdoc[1].split('\n').map(l => l.replace(/^\s*\*\s?/, '').trim()).filter(Boolean);
      const firstReal = lines.find(l => !l.startsWith('@'));
      if (firstReal) return firstReal.replace(/\.\s*$/, '');
    }
    const single = text.match(/^\s*\/\/\s*(.+)$/m);
    if (single) return single[1].trim();
  } else if (ext === 'js' || ext === 'mjs') {
    const jsdoc = text.match(/\/\*\*([\s\S]*?)\*\//);
    if (jsdoc) {
      const lines = jsdoc[1].split('\n').map(l => l.replace(/^\s*\*\s?/, '').trim()).filter(Boolean);
      const firstReal = lines.find(l => !l.startsWith('@'));
      if (firstReal) return firstReal.replace(/\.\s*$/, '');
    }
    const block = text.match(/\/\*([\s\S]*?)\*\//);
    if (block) {
      const lines = block[1].split('\n').map(l => l.replace(/^\s*\*?\s?/, '').trim()).filter(Boolean);
      if (lines[0]) return lines[0].replace(/\.\s*$/, '');
    }
    const single = text.match(/^\s*\/\/\s*(.+)$/m);
    if (single) return single[1].trim();
  } else if (ext === 'twig') {
    const m = text.match(/\{#\s*([\s\S]*?)\s*#\}/);
    if (m) return m[1].split('\n')[0].trim().replace(/\.\s*$/, '');
  } else if (ext === 'json') {
    // JSON-конфиги — без комментариев. Дадим описание по имени.
    return '';
  } else if (ext === 'xml' || ext === 'neon') {
    return '';
  } else if (basename(absPath) === '.gitignore' || basename(absPath) === '.htaccess' || basename(absPath) === '.env.example') {
    return '';
  } else if (ext === 'md') {
    const h1 = text.match(/^#\s+(.+)$/m);
    if (h1) return h1[1].trim();
  }
  return '';
}

async function* walkPhp(root, rel = '') {
  let entries;
  try {
    entries = await readdir(join(root, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const r = rel ? join(rel, e.name) : e.name;
    if (e.isDirectory()) yield* walkPhp(root, r);
    else yield r.split(sep).join('/');
  }
}

async function collectFilesInGlob(glob) {
  const abs = join(PLATFORM_ROOT, glob);
  if (!existsSync(abs)) return [];
  const out = [];
  for await (const rel of walkPhp(abs)) {
    out.push(join(glob, rel).split(sep).join('/'));
  }
  return out.sort();
}

async function statusInDeployment(relPath, baselineSha) {
  const result = {};
  for (const [name, root] of Object.entries(DEPLOYMENTS)) {
    const abs = join(root, relPath);
    if (!existsSync(abs)) {
      result[name] = '✗';
      continue;
    }
    const sha = await sha256(abs);
    result[name] = sha === baselineSha ? '✓' : 'M';
  }
  return result;
}

function shortPath(p) {
  return p.replace(/^src\//, '').replace(/^tools\//, '');
}

async function processFile(relPath) {
  const abs = join(PLATFORM_ROOT, relPath);
  if (!existsSync(abs)) return null;
  const st = await stat(abs);
  if (!st.isFile()) return null;
  const sha = await sha256(abs);
  const desc = await extractDescription(abs);
  const inDep = await statusInDeployment(relPath, sha);
  return {
    path: relPath,
    short: shortPath(relPath),
    desc: desc || '—',
    size: st.size,
    sha,
    kumho: inDep.kumho,
    italy: inDep.italy,
    beepitron: inDep.beepitron,
  };
}

function classify(row) {
  // CORE — везде ✓ или M (присутствует во всех 3)
  // CORE с drift — везде есть но не все ✓
  // PARTIAL — есть только в 1-2 deployments
  // BASELINE-ONLY — нет ни в одном (новый файл baseline'а, например DISTILLATION.md)
  const flags = [row.kumho, row.italy, row.beepitron];
  const present = flags.filter(f => f !== '✗').length;
  const sames = flags.filter(f => f === '✓').length;
  if (present === 3 && sames === 3) return 'CORE ✓';
  if (present === 3) return 'CORE drift';
  if (present === 0) return 'BASELINE-only';
  return `partial (${present}/3)`;
}

async function main() {
  const out = [];
  out.push('# CORE INVENTORY — ядро iSmart Platform');
  out.push('');
  out.push('Этот документ — детальная карта файлов **ядра** baseline\'а `ismart-platform/`, с описанием назначения каждого и статусом в трёх production deployment\'ах:');
  out.push('');
  out.push('| Метка | Значение |');
  out.push('|---|---|');
  out.push('| `✓`   | файл присутствует и идентичен baseline\'у |');
  out.push('| `M`   | файл присутствует, но **содержимое расходится** (drift) |');
  out.push('| `✗`   | файла нет в deployment\'е |');
  out.push('');
  out.push('Классификация в колонке **Категория**:');
  out.push('');
  out.push('- `CORE ✓` — есть во всех трёх, идентичен. Безусловно ядро.');
  out.push('- `CORE drift` — есть во всех трёх, но содержимое разъехалось. Кандидат на унификацию через `distill sync`.');
  out.push('- `partial (N/3)` — присутствует только в части deployment\'ов. Требует разбора: либо ядро (с пропусками) либо deployment-specific.');
  out.push('- `BASELINE-only` — впервые появился в baseline\'е. Требует распространения в deployment\'ы.');
  out.push('');
  out.push(`Сгенерировано автоматически: \`node tools/distill/build-inventory.mjs > CORE-INVENTORY.md\``);
  out.push(`Дата: ${new Date().toISOString().split('T')[0]}`);
  out.push('');
  out.push('---');
  out.push('');

  let totalCoreOk = 0, totalCoreDrift = 0, totalPartial = 0, totalBaselineOnly = 0;

  for (const group of GROUPS) {
    out.push(`## ${group.title}`);
    out.push('');
    const paths = group.paths || await collectFilesInGlob(group.glob);
    const rows = [];
    for (const p of paths) {
      const row = await processFile(p);
      if (row) rows.push(row);
    }
    if (!rows.length) {
      out.push('_файлов нет_');
      out.push('');
      continue;
    }
    out.push('| Файл | Назначение | kumho | italy | beepitron | Категория |');
    out.push('|---|---|:-:|:-:|:-:|---|');
    for (const row of rows) {
      const cat = classify(row);
      if (cat === 'CORE ✓') totalCoreOk++;
      else if (cat === 'CORE drift') totalCoreDrift++;
      else if (cat === 'BASELINE-only') totalBaselineOnly++;
      else totalPartial++;
      const desc = row.desc.length > 80 ? row.desc.slice(0, 77) + '...' : row.desc;
      out.push(`| \`${row.path}\` | ${desc} | ${row.kumho} | ${row.italy} | ${row.beepitron} | ${cat} |`);
    }
    out.push('');
  }

  out.push('---');
  out.push('');
  out.push('## Итоги по ядру');
  out.push('');
  out.push('| Категория | Кол-во |');
  out.push('|---|---|');
  out.push(`| **CORE ✓** (идентичны во всех трёх) | ${totalCoreOk} |`);
  out.push(`| **CORE drift** (есть везде, но разъехалось) | ${totalCoreDrift} |`);
  out.push(`| **partial** (отсутствует в части deployments) | ${totalPartial} |`);
  out.push(`| **BASELINE-only** (новые в baseline) | ${totalBaselineOnly} |`);
  out.push('');
  out.push('## Ключевые моменты для имплементации');
  out.push('');
  out.push('1. **`CORE ✓`** — копировать в baseline без правок, маркировать как `strict` в manifest.');
  out.push('2. **`CORE drift`** — требует **review per file**: какая из версий каноническая, что вынести в `.dist`, что в `Support`. Это первоочередная работа.');
  out.push('3. **`partial`** — два варианта: либо это deployment-specific (помечать как override), либо это **намеренный CORE-кандидат**, который ещё не докатился до части deployment\'ов (надо `distill sync`).');
  out.push('4. **`BASELINE-only`** (например, DISTILLATION.md, tools/distill/*) — распространяется в deployments только после согласования.');
  out.push('');

  console.log(out.join('\n'));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
