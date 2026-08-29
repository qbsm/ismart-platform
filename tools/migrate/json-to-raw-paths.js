#!/usr/bin/env node
// Migration: переписывает JSON-контент с multi-key image объектов на raw-source формат.
// Часть ADR-0007.
//
// Универсально обрабатывает любой объект с числовыми ключами (400/800/...) и/или raw,
// у которого значения — строки вида "data/img/...":
//
//   { "400": "data/img/X/400/Y.webp", "800": "...", "raw": "..." }
//     → "data/img/X/raw/Y.webp"  (когда нет дополнительных полей)
//
//   { "400": "...", "800": "...", "alt": "Описание" }
//     → { "src": "data/img/X/raw/Y.webp", "alt": "Описание" }
//
//   { "horizontal": { "400": "...", "800": "..." }, "vertical": { "400": "..." } }
//     → { "horizontal": "data/img/X/raw/desk.webp", "vertical": "data/img/X/raw/mob.webp" }
//
// Покрывает: italy intro {horizontal,vertical}, kumho tires.images.30deg/front/side/back,
// kumho news.cover, любые секции с image: {400,800,...}.
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

/**
 * Из пути под числовым ключом вычисляет raw-эквивалент,
 * проверяет существование файла. "X/800/Y.webp" → "X/raw/Y.<ext>".
 */
function resolveRawForKey(pathFromKey) {
  const m = pathFromKey.match(/^(.*?\/)(\d+)(\/[^/]+?)\.([a-z]+)$/i);
  if (!m) return null;
  const baseDir = m[1];
  const basename = path.basename(m[3]);
  for (const ext of RAW_EXTENSIONS) {
    const candidate = `${baseDir}raw/${basename}.${ext}`;
    if (fs.existsSync(path.join(projectRoot, candidate))) {
      return candidate;
    }
  }
  return null;
}

/**
 * Проверяет, что объект выглядит как multi-key image:
 *   - есть хотя бы один числовой ключ (400/800/...) ИЛИ ключ "raw"
 *   - значения этих ключей — строки начинающиеся с "data/img/"
 *
 * Иначе false (например объект {400: "tag-label"} где 400 не размер картинки).
 */
function isMultiKeyImageObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  let hasImageKey = false;
  for (const k of keys) {
    if (SIZE_KEYS.includes(k) || k === 'raw') {
      const v = obj[k];
      if (typeof v !== 'string' || !v.startsWith('data/img/')) return false;
      hasImageKey = true;
    }
  }
  return hasImageKey;
}

/**
 * Извлекает raw-path из multi-key объекта.
 * Если есть "raw" — возвращает её.
 * Иначе вычисляет из любого числового ключа через resolveRawForKey.
 */
function extractRawPath(obj, filePath) {
  if (typeof obj === 'string') return obj.includes('/raw/') ? obj : null;
  if (!isMultiKeyImageObject(obj)) return null;

  if (typeof obj.raw === 'string' && obj.raw !== '') {
    return obj.raw;
  }
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

/**
 * Переписывает multi-key объект на новый формат.
 * Если в объекте нет других полей (alt и т.п.) — возвращает string raw-path.
 * Иначе — { src: rawPath, ...otherFields }.
 */
function rewriteMultiKey(obj, filePath) {
  const rawPath = extractRawPath(obj, filePath);
  if (!rawPath) return undefined;

  const otherFields = {};
  for (const k of Object.keys(obj)) {
    if (SIZE_KEYS.includes(k) || k === 'raw') continue;
    otherFields[k] = obj[k];
  }
  if (Object.keys(otherFields).length === 0) {
    return rawPath;
  }
  return { src: rawPath, ...otherFields };
}

/**
 * Рекурсивно проходит дерево. Заменяет multi-key объекты на новый формат.
 * Поле node.horizontal / node.vertical обрабатывается отдельно
 * (часто это вложенные multi-key объекты внутри image-объекта).
 */
function transform(node, filePath) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      node[i] = transform(node[i], filePath);
    }
    return node;
  }
  if (!node || typeof node !== 'object') return node;

  for (const key of Object.keys(node)) {
    const child = node[key];
    if (isMultiKeyImageObject(child)) {
      const rewritten = rewriteMultiKey(child, filePath);
      if (rewritten !== undefined) {
        node[key] = rewritten;
        summary.rewritten_objects++;
      }
    } else {
      node[key] = transform(child, filePath);
    }
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
    } catch {
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
  console.log(`\n${tag} json-to-raw-paths migration v2`);
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
