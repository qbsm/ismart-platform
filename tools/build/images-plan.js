#!/usr/bin/env node
// Отчёт «что будет сгенерировано» перед `npm run build:images`.
// Sharp читает metadata raw-источников, печатает таблицу:
//   raw-path  width×height  →  ключи которые будут сгенерированы (или SKIP).
//
// Не вызывает resize, не пишет manifest. Помогает заметить «raw слишком мелкий»
// до того как baseline catch sb 404 в production.
//
// Usage:
//   node tools/build/images-plan.js
//   node tools/build/images-plan.js --only=intro     # фильтр по prefix-папке

const path = require('path');
const fs = require('fs');
const { glob } = require('glob');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '../..');
const configPath = path.join(projectRoot, 'config/image-sizes.json');
const imgDir = path.join(projectRoot, 'data/img');

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const onlyPrefix = onlyArg ? onlyArg.slice('--only='.length) : null;

function loadConfig() {
  const raw = fs.readFileSync(configPath, 'utf8');
  const data = JSON.parse(raw);
  return {
    keys: Array.isArray(data.keys) ? data.keys.map(String) : ['400', '800', '1280', '1600', '1920', '2560'],
    widths: data.widths ?? { 400: 400, 800: 800, 1280: 1280, 1600: 1600, 1920: 1920, 2560: 2560 },
  };
}

async function main() {
  if (!fs.existsSync(imgDir)) {
    console.error(`data/img не найден: ${imgDir}`);
    process.exit(1);
  }

  const { keys, widths } = loadConfig();
  const sources = await glob('**/raw/*.{jpg,jpeg,png,webp,avif}', {
    cwd: imgDir,
    nocase: true,
  });

  const filtered = onlyPrefix ? sources.filter((p) => p.startsWith(onlyPrefix)) : sources;

  if (filtered.length === 0) {
    console.log(
      onlyPrefix ? `Нет raw-источников под префиксом '${onlyPrefix}'.` : 'Нет raw-источников в data/img/**/raw/.'
    );
    return;
  }

  const rows = [];
  let totalGenerate = 0;
  let totalSkip = 0;

  for (const rel of filtered) {
    const abs = path.join(imgDir, rel);
    let w;
    let h;
    try {
      const meta = await sharp(abs).metadata();
      w = meta.width || 0;
      h = meta.height || 0;
    } catch (e) {
      rows.push({ src: rel, width: 0, height: 0, generate: [], skip: keys.slice(), error: e.message });
      continue;
    }

    const generate = [];
    const skip = [];
    for (const key of keys) {
      const target = Number(widths[key] ?? key);
      if (target > 0 && w >= target) {
        generate.push(key);
        totalGenerate += 2; // webp + avif
      } else {
        skip.push(key);
        totalSkip += 2;
      }
    }
    rows.push({ src: rel, width: w, height: h, generate, skip, error: null });
  }

  rows.sort((a, b) => a.src.localeCompare(b.src));

  console.log(`\nimages-plan: ${filtered.length} raw-источников${onlyPrefix ? ` (--only=${onlyPrefix})` : ''}\n`);
  for (const r of rows) {
    if (r.error) {
      console.log(`  ${r.src.padEnd(50)}  ERROR: ${r.error}`);
      continue;
    }
    const dim = `${r.width}×${r.height}`;
    const generate = r.generate.length > 0 ? r.generate.join(', ') : '—';
    const skip = r.skip.length > 0 ? ` (skip: ${r.skip.join(', ')})` : '';
    console.log(`  ${r.src.padEnd(50)}  ${dim.padEnd(12)}  → ${generate}${skip}`);
  }

  console.log(`\nИТОГО:`);
  console.log(`  Будет сгенерировано: ${totalGenerate} файлов (webp + avif на каждый ключ)`);
  console.log(`  Skip-upscale:        ${totalSkip} файлов`);
  console.log(`  Raw-источников:      ${filtered.length}`);

  const lowResSources = rows.filter((r) => !r.error && r.generate.length === 0);
  if (lowResSources.length > 0) {
    console.log(`\nВНИМАНИЕ: ${lowResSources.length} raw-источников не сгенерируют ни одного ключа`);
    console.log(`(width < минимального ключа ${widths[keys[0]] ?? keys[0]}):`);
    for (const r of lowResSources) {
      console.log(`  ${r.src} (${r.width}px)`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
