#!/usr/bin/env node
/**
 * Проверка прав на каталоги, в которые пишет веб-сервер.
 *
 * Приложение работает от www-data, а файлы на сервере создаёт деплой от своего пользователя.
 * Стоит появиться логу с правами `rw-r--r--` — и запись падает: 11.08.2026 из-за этого
 * `/api/send` отвечал 500 вместо 419 на одиннадцати площадках, то есть человек с заполненной
 * формой получал ошибку.
 *
 *   node tools/ops/check-permissions.js          # проверить, вернуть код 1 при находках
 *   node tools/ops/check-permissions.js --fix    # заодно выдать группе право записи
 */
import { existsSync, readdirSync, statSync, chmodSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const TARGETS = ['logs', 'cache'];
const WEB_USER = process.env.WEB_USER || 'www-data';
const FIX = process.argv.includes('--fix');

// На Windows и macOS модель прав другая, а боевые площадки — Linux: там и проверяем.
if (process.platform !== 'linux') {
  process.exit(0);
}

function idOf(file, name) {
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const parts = line.split(':');
      if (parts[0] === name) return Number(parts[2]);
    }
  } catch {
    /* нет файла — значит и пользователя нет */
  }
  return null;
}

const webUid = idOf('/etc/passwd', WEB_USER);
const webGid = idOf('/etc/group', WEB_USER);
if (webUid === null) {
  process.exit(0);
}

// Писать сможет владелец-веб-сервер, либо его группа при бите записи, либо кто угодно.
function writableByWeb(stat) {
  if (stat.uid === webUid) return Boolean(stat.mode & 0o200);
  if (stat.gid === webGid) return Boolean(stat.mode & 0o020);
  return Boolean(stat.mode & 0o002);
}

function walk(path, found, depth = 0) {
  let entry;
  try {
    entry = statSync(path);
  } catch {
    return;
  }

  if (!writableByWeb(entry)) {
    found.push(path);
    if (FIX) {
      try {
        chmodSync(path, entry.mode | 0o020);
      } catch {
        /* право менять чужое есть не всегда — покажем в отчёте */
      }
    }
  }

  if (!entry.isDirectory() || depth > 3) return;
  for (const name of readdirSync(path)) {
    walk(join(path, name), found, depth + 1);
  }
}

const found = [];
for (const target of TARGETS) {
  const path = join(ROOT, target);
  if (existsSync(path)) walk(path, found, 0);
}

if (found.length === 0) {
  process.exit(0);
}

const shown = found.slice(0, 5).map((p) => `  ${p.replace(`${ROOT}/`, '')}`);
const tail = found.length > shown.length ? `\n  … и ещё ${found.length - shown.length}` : '';

if (FIX) {
  console.log(`Права выданы группе: ${found.length} путей.`);
  process.exit(0);
}

console.error(
  `Веб-сервер (${WEB_USER}) не сможет писать сюда, путей: ${found.length}\n` +
    shown.join('\n') +
    tail +
    '\n\nЛечится: npm run check:permissions -- --fix'
);
process.exit(1);
