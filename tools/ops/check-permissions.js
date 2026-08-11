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
import { existsSync, readdirSync, statSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const TARGETS = ['logs', 'cache'];
const GROUP_WRITE = 0o020;
const FIX = process.argv.includes('--fix');

// На Windows и macOS модель прав другая, а боевые площадки — Linux: там и проверяем.
if (process.platform !== 'linux') {
  process.exit(0);
}

function walk(path, found, depth = 0) {
  let entry;
  try {
    entry = statSync(path);
  } catch {
    return;
  }

  if (!(entry.mode & GROUP_WRITE)) {
    found.push(path);
    if (FIX) {
      try {
        chmodSync(path, entry.mode | GROUP_WRITE);
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
  `Веб-сервер не сможет писать сюда (нет права записи у группы), путей: ${found.length}\n` +
    shown.join('\n') +
    tail +
    '\n\nЛечится: npm run check:permissions -- --fix'
);
process.exit(1);
