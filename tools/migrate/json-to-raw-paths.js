#!/usr/bin/env node
// Migration: переписывает JSON-контент с multi-key image объектов на raw-path формат.
// Часть proposal 0003.
//
// Было:
//   "image": {
//     "horizontal": {
//       "400":  "data/img/intro/400/desk-lemons.webp",
//       "800":  "data/img/intro/800/desk-lemons.webp",
//       "raw":  "data/img/intro/raw/desk-lemons.webp"
//     },
//     "vertical": { ... }
//   }
//
// Становится:
//   "image": {
//     "horizontal": "data/img/intro/raw/desk-lemons.webp",
//     "vertical":   "data/img/intro/raw/mob-lemons.webp"
//   }
//
// Если в объекте есть только числовые ключи без "raw" — пытаемся вычислить raw из любого
// ключа: data/img/intro/800/X.webp → data/img/intro/raw/X.<ext>. Проверяем что файл существует.
//
// Usage:
//   node tools/migrate/json-to-raw-paths.js [--dry-run]

const path = require('path');
const fs = require('fs');
const { glob } = require('glob');

const SIZE_KEYS = ['400', '800', '1280', '1600', '1920', '2560'];
const RAW_EXTENSIONS = ['webp', 'avif', 'jpg', 'jpeg', 'png'];

const projectRoot = path.resolve(__dirname, '../..');
const jsonRoot = path.join(projectRoot, 'data/json');
const dryRun = process.argv.includes('--dry-run');

const summary = { rewritten_files: [], rewritten_objects: 0, orphans: [], skipped: [] };

function resolveRawForKey(pathFromKey) {
  // pathFromKey: "data/img/intro/800/desk-lemons.webp" → "data/img/intro/raw/desk-lemons.<ext>"
  // возвращает первый существующий вариант с подходящим расширением
  const m = pathFromKey.match(/^(.*?\/)(\d+)(\/[^/]+?)\.([a-z]+)$/i);
  if (!m) return null;
  const baseDir = m[1]; // data/img/intro/
  const basename = path.basename(m[3]); // desk-lemons
  for (const ext of RAW_EXTENSIONS) {
    const candidate = `${baseDir}raw/${basename}.${ext}`;
    if (fs.existsSync(path.join(projectRoot, candidate))) {
      return candidate;
    }
  }
  return null;
}

function isMultiKeyImageObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  return keys.some((k) => SIZE_KEYS.includes(k) || k === 'raw');
}

function extractRawPath(obj, filePath) {
  if (typeof obj === 'string') return obj.includes('/raw/') ? obj : null;
  if (!isMultiKeyImageObject(obj)) return null;

  if (typeof obj.raw === 'string' && obj.raw !== '') {
    return obj.raw;
  }
  // Нет "raw" — вычисляем из любого числового ключа
  for (const k of SIZE_KEYS) {
    if (typeof obj[k] === 'string' && obj[k] !== '') {
      const raw = resolveRawForKey(obj[k]);
      if (raw) return raw;
      summary.orphans.push({ file: filePath, key: k, value: obj[k], reason: 'raw not found on disk' });
      return null;
    }
  }
  return null;
}

function transform(node, filePath) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      node[i] = transform(node[i], filePath);
    }
    return node;
  }
  if (node && typeof node === 'object') {
    // image: { horizontal: {...}, vertical: {...} } — массивная адаптивная картинка
    if ('horizontal' in node || 'vertical' in node) {
      const horizontalRaw = extractRawPath(node.horizontal, filePath);
      const verticalRaw = extractRawPath(node.vertical, filePath);
      let rewritten = false;
      if (horizontalRaw && typeof node.horizontal !== 'string') {
        node.horizontal = horizontalRaw;
        rewritten = true;
      }
      if (verticalRaw && typeof node.vertical !== 'string') {
        node.vertical = verticalRaw;
        rewritten = true;
      }
      if (rewritten) summary.rewritten_objects++;
    }
    // image: { 400: ..., 800: ..., raw: ... } — multi-key на верхнем уровне (single orientation)
    if (isMultiKeyImageObject(node) && !('horizontal' in node) && !('vertical' in node)) {
      // не трогаем — это объект ключей напрямую; родитель должен решить как обрабатывать
    }
    for (const key of Object.keys(node)) {
      node[key] = transform(node[key], filePath);
    }
    return node;
  }
  return node;
}

async function main() {
  if (!fs.existsSync(jsonRoot)) {
    console.error(`data/json не найден: ${jsonRoot}`);
    process.exit(1);
  }

  const files = await glob('**/*.json', { cwd: jsonRoot, absolute: true });

  for (const file of files) {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      summary.skipped.push({ file: path.relative(projectRoot, file), reason: 'parse error' });
      continue;
    }

    const beforeRewritten = summary.rewritten_objects;
    transform(data, path.relative(projectRoot, file));
    const localCount = summary.rewritten_objects - beforeRewritten;

    if (localCount > 0) {
      const newRaw = JSON.stringify(data, null, 2) + '\n';
      if (!dryRun) {
        fs.writeFileSync(file, newRaw, 'utf8');
      }
      summary.rewritten_files.push({ file: path.relative(projectRoot, file), objects: localCount });
    }
  }

  const tag = dryRun ? '[DRY-RUN]' : '[APPLY]';
  console.log(`\n${tag} json-to-raw-paths migration`);
  console.log(`  Сканировано JSON-файлов:   ${files.length}`);
  console.log(`  Переписано файлов:         ${summary.rewritten_files.length}`);
  console.log(`  Переписано image-объектов: ${summary.rewritten_objects}`);
  console.log(`  Orphans (raw не найден):   ${summary.orphans.length}`);
  console.log(`  Skipped (parse error):     ${summary.skipped.length}`);

  if (summary.rewritten_files.length > 0) {
    console.log('\nПереписано:');
    for (const f of summary.rewritten_files) {
      console.log(`  ${f.file} (objects: ${f.objects})`);
    }
  }
  if (summary.orphans.length > 0) {
    console.log('\nORPHANS (raw-источник не найден на диске):');
    for (const o of summary.orphans) {
      console.log(`  ${o.file} :: ${o.key} = ${o.value}`);
    }
  }
  if (summary.skipped.length > 0) {
    console.log('\nSKIPPED:');
    for (const s of summary.skipped) {
      console.log(`  ${s.file} — ${s.reason}`);
    }
  }
  if (dryRun) {
    console.log('\n--dry-run: файлы не изменены.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
