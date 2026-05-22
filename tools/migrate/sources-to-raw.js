#!/usr/bin/env node
// Migration: переносит растровые источники из data/img/<section>/*.{jpg,png,webp,avif}
// в data/img/<section>/raw/. Часть proposal 0003 (raw-only convention).
//
// Критерии:
//   - расширение: jpg|jpeg|png|webp|avif (не svg, не gif, не другие)
//   - ширина >= 400px (минимальный ключ из config/image-sizes.json)
//   - папка <section>/ содержит подпапки {400,800,1280,1600,1920,2560} (adaptive target)
//
// Файлы вне этих критериев — пропускаем (single-use icons/logos, svg, мелкие).
//
// Usage:
//   node tools/migrate/sources-to-raw.js [--dry-run]
//
// После apply — запустить `npm run build:images` для регенерации {key}/* из новой raw/.

const path = require('path');
const fs = require('fs');
const { glob } = require('glob');
const sharp = require('sharp');

const RAW_EXTENSIONS = /\.(jpg|jpeg|png|webp|avif)$/i;
const SIZE_KEYS = ['400', '800', '1280', '1600', '1920', '2560'];
const MIN_WIDTH = 400;

const projectRoot = path.resolve(__dirname, '../..');
const imgDir = path.join(projectRoot, 'data/img');
const jsonRoot = path.join(projectRoot, 'data/json');
const dryRun = process.argv.includes('--dry-run');

if (!fs.existsSync(imgDir)) {
  console.error(`data/img не найден: ${imgDir}`);
  process.exit(1);
}

/**
 * Pre-scan JSON: собирает все direct-cited paths (cover.src, src и т.п.),
 * чтобы не переносить в raw/ файлы, на которые есть прямые <img src> ссылки.
 */
async function scanDirectCited() {
  const cited = new Set();
  if (!fs.existsSync(jsonRoot)) return cited;

  const jsonFiles = await glob('**/*.json', { cwd: jsonRoot, absolute: true });
  for (const file of jsonFiles) {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    // Regex по строкам формата "...": "data/img/..."
    const re = /"data\/img\/[^"]+\.(?:jpg|jpeg|png|webp|avif)"/gi;
    const matches = raw.match(re) ?? [];
    for (const m of matches) {
      const p = m.slice(1, -1); // strip quotes
      // Skip пути, которые уже в /raw/ или в adaptive-папке /400/ etc.
      if (p.includes('/raw/')) continue;
      if (/\/(400|800|1280|1600|1920|2560)\//.test(p)) continue;
      cited.add(p);
    }
  }
  return cited;
}

function hasAdaptiveSubdirs(dir) {
  return SIZE_KEYS.some((key) => fs.existsSync(path.join(dir, key)));
}

function listDirectFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && RAW_EXTENSIONS.test(e.name))
    .map((e) => path.join(dir, e.name));
}

async function widthOf(filePath) {
  try {
    const meta = await sharp(filePath).metadata();
    return meta.width || 0;
  } catch (e) {
    return 0;
  }
}

function rel(p) {
  return path.relative(projectRoot, p);
}

async function main() {
  const adaptiveDirs = (
    await glob('**/', { cwd: imgDir, absolute: true, dot: false })
  ).filter(hasAdaptiveSubdirs);

  if (adaptiveDirs.length === 0) {
    console.log('Не найдено папок с adaptive {400,800,...} подпапками.');
    return;
  }

  const summary = { moved: [], skipped_small: [], skipped_cited: [], skipped_other: [], errors: [] };

  const directCited = await scanDirectCited();

  for (const dir of adaptiveDirs) {
    const rawDir = path.join(dir, 'raw');
    const candidates = listDirectFiles(dir);
    if (candidates.length === 0) continue;

    for (const src of candidates) {
      const name = path.basename(src);
      const relSrc = rel(src);

      // Если на файл есть direct <img src> ссылка из JSON — не переносим,
      // иначе ссылка ломается (шаблон не использует picture.twig для этого).
      if (directCited.has(relSrc)) {
        summary.skipped_cited.push({ src: relSrc });
        continue;
      }

      const w = await widthOf(src);

      if (w === 0) {
        summary.errors.push({ src: relSrc, reason: 'metadata read failed' });
        continue;
      }

      if (w < MIN_WIDTH) {
        summary.skipped_small.push({ src: relSrc, width: w });
        continue;
      }

      const dst = path.join(rawDir, name);
      if (fs.existsSync(dst)) {
        summary.skipped_other.push({ src: relSrc, reason: `raw/${name} уже существует` });
        continue;
      }

      if (dryRun) {
        summary.moved.push({ src: relSrc, dst: rel(dst), width: w, dryRun: true });
      } else {
        fs.mkdirSync(rawDir, { recursive: true });
        fs.renameSync(src, dst);
        summary.moved.push({ src: relSrc, dst: rel(dst), width: w });
      }
    }
  }

  const tag = dryRun ? '[DRY-RUN]' : '[APPLY]';
  console.log(`\n${tag} sources-to-raw migration`);
  console.log(`  Сканировано adaptive-папок: ${adaptiveDirs.length}`);
  console.log(`  Перенесено в raw/:          ${summary.moved.length}`);
  console.log(`  Пропущено (width<400):      ${summary.skipped_small.length}`);
  console.log(`  Пропущено (direct в JSON):  ${summary.skipped_cited.length}`);
  console.log(`  Пропущено (raw/X уже есть): ${summary.skipped_other.length}`);
  console.log(`  Ошибки:                     ${summary.errors.length}`);

  if (summary.moved.length > 0) {
    console.log('\nПеренесено:');
    for (const m of summary.moved) {
      console.log(`  ${m.src} (${m.width}px) → ${m.dst}`);
    }
  }
  if (summary.skipped_small.length > 0) {
    console.log('\nSKIP (width < 400):');
    for (const s of summary.skipped_small) {
      console.log(`  ${s.src} (${s.width}px)`);
    }
  }
  if (summary.skipped_cited.length > 0) {
    console.log('\nSKIP (direct <img src> в JSON):');
    for (const s of summary.skipped_cited) {
      console.log(`  ${s.src}`);
    }
  }
  if (summary.skipped_other.length > 0) {
    console.log('\nSKIP (other):');
    for (const s of summary.skipped_other) {
      console.log(`  ${s.src} — ${s.reason}`);
    }
  }
  if (summary.errors.length > 0) {
    console.log('\nERRORS:');
    for (const e of summary.errors) {
      console.log(`  ${e.src} — ${e.reason}`);
    }
  }

  if (dryRun) {
    console.log('\n--dry-run: ничего не перемещено. Запустите без --dry-run для применения.');
  } else if (summary.moved.length > 0) {
    console.log('\nДальше: `npm run build:images` для регенерации {key}/* из новой raw/.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
