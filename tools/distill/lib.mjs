/**
 * Общая библиотека для CLI distill: обход файлов, sha256, manifest, описания.
 * Все команды distill (scan/diff/status/init/mark-override) импортируют отсюда.
 */

import { readFile, readdir, stat, copyFile as fsCopyFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { join, sep, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

/** Корень baseline'а — на 2 уровня выше lib.mjs (tools/distill/ → ..). */
export const PLATFORM_ROOT = resolve(dirname(__filename), '..', '..');

/** Префиксы, которые игнорируются и в baseline, и в deployment'ах. */
export const EXCLUDE_PREFIXES = [
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

/** Имена файлов, которые игнорируются независимо от пути. */
export const EXCLUDE_NAMES = new Set([
  '.DS_Store',
  'Thumbs.db',
  '.env',
  '.env.local',
  '.gitconfig',
  'composer.lock',
  'package-lock.json',
]);

/** Бинарные расширения — не включаем в manifest (раздувают, не имеют смысла для diff). */
export const EXCLUDE_EXTENSIONS = new Set([
  '.webp', '.avif', '.jpg', '.jpeg', '.png', '.gif',
  '.mp4', '.webm', '.mov', '.pdf', '.zip', '.tar', '.gz',
  '.ttf', '.woff', '.woff2', '.eot', '.otf',
]);

export function isExcluded(relPosix, name) {
  if (EXCLUDE_NAMES.has(name)) return true;
  const dot = name.lastIndexOf('.');
  if (dot > 0 && EXCLUDE_EXTENSIONS.has(name.slice(dot).toLowerCase())) return true;
  for (const prefix of EXCLUDE_PREFIXES) {
    if (relPosix === prefix || relPosix.startsWith(prefix + '/')) return true;
  }
  return false;
}

/** Рекурсивный обход файлов с фильтром. Yields POSIX-относительные пути. */
export async function* walkFiles(root, rel = '') {
  let entries;
  try {
    entries = await readdir(rel ? join(root, rel) : root, { withFileTypes: true });
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

export async function fileSha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

/** Строит {path → {sha256, size}} для всех файлов под root. */
export async function buildManifest(root) {
  const files = {};
  for await (const rel of walkFiles(root)) {
    const abs = join(root, rel);
    const st = await stat(abs);
    files[rel] = {
      sha256: await fileSha256(abs),
      size: st.size,
    };
  }
  return files;
}

export async function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Грузит закэшированный manifest baseline или строит на лету. */
export async function loadOrBuildBaseline() {
  const cached = await readJsonIfExists(join(PLATFORM_ROOT, '.distill', 'manifest.json'));
  if (cached) return cached.files;
  process.stderr.write('manifest.json не найден, строю на лету...\n');
  return buildManifest(PLATFORM_ROOT);
}

/** Сравнивает два manifest'а и возвращает группы. */
export function compareManifests(baseline, deployment) {
  const identical = [];
  const drifted = [];
  const uniqueToDeployment = [];
  const missingInDeployment = [];

  for (const [path, base] of Object.entries(baseline)) {
    const dep = deployment[path];
    if (!dep) missingInDeployment.push(path);
    else if (base.sha256 === dep.sha256) identical.push(path);
    else drifted.push(path);
  }
  for (const path of Object.keys(deployment)) {
    if (!baseline[path]) uniqueToDeployment.push(path);
  }
  return { identical, drifted, uniqueToDeployment, missingInDeployment };
}

/** Извлекает короткое описание из первого комментария файла (PHPDoc/JSDoc/Twig/Markdown h1). */
export async function extractDescription(absPath) {
  let text;
  try {
    text = await readFile(absPath, 'utf8');
  } catch {
    return '';
  }
  const ext = absPath.split('.').pop().toLowerCase();
  const fname = basename(absPath);

  if (ext === 'php' || ext === 'js' || ext === 'mjs') {
    const doc = text.match(/\/\*\*([\s\S]*?)\*\//);
    if (doc) {
      const lines = doc[1].split('\n').map(l => l.replace(/^\s*\*\s?/, '').trim()).filter(Boolean);
      const first = lines.find(l => !l.startsWith('@'));
      if (first) return first.replace(/\.\s*$/, '');
    }
    if (ext !== 'php') {
      const block = text.match(/\/\*([\s\S]*?)\*\//);
      if (block) {
        const lines = block[1].split('\n').map(l => l.replace(/^\s*\*?\s?/, '').trim()).filter(Boolean);
        if (lines[0]) return lines[0].replace(/\.\s*$/, '');
      }
    }
    const single = text.match(/^\s*\/\/\s*(.+)$/m);
    if (single) return single[1].trim();
  } else if (ext === 'twig') {
    const m = text.match(/\{#\s*([\s\S]*?)\s*#\}/);
    if (m) return m[1].split('\n')[0].trim().replace(/\.\s*$/, '');
  } else if (ext === 'md') {
    const h1 = text.match(/^#\s+(.+)$/m);
    if (h1) return h1[1].trim();
  } else if (ext === 'json' || ext === 'xml' || ext === 'neon') {
    return '';
  } else if (fname === '.gitignore' || fname === '.htaccess' || fname === '.env.example') {
    return '';
  }
  return '';
}

/** sha-хеш текущего коммита baseline. 'unknown' если git недоступен. */
export function getBaselineCommit() {
  try {
    return execSync('git rev-parse HEAD', { cwd: PLATFORM_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** Текущая ветка baseline. */
export function getBaselineBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: PLATFORM_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** Копирует файл, создавая parent-директорию при необходимости. */
export async function copyFile(src, dst) {
  await mkdir(dirname(dst), { recursive: true });
  await fsCopyFile(src, dst);
}

/** Пишет JSON в файл с pretty-print + trailing newline. */
export async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
}

/** Пишет произвольный текст в файл, создавая parent-директорию. */
export async function writeText(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}
