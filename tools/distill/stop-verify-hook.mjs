#!/usr/bin/env node
// stop-verify-hook.mjs — Stop-hook принуждения verify-гейта.
//
// Назначение: не дать агенту «завершить», если в платформенном деплое изменены
// высокорисковые build-файлы (config/project.php, assets/js/main.*, assets/css/main.*),
// но сборка падает. Это институционализация урока инцидента 2026-05-29 (см.
// roles/orchestrator.md на docs.ismart.pro §Verify): «PHP-200 ≠ деплой работает; assets-divergence
// ловит только сборка».
//
// Логика (быстрая — билдит ТОЛЬКО когда рискованные файлы реально изменены):
//   1. Сканирует $HOME/Sites/* — платформенные репо (маркер src/Action/PageAction.php).
//   2. git status: изменён ли config/project.php | assets/js/main.* | assets/css/main.* ?
//   3. Если да и есть node_modules — гоняет build:js + build:css + validate-json.
//   4. Любой провал → stderr + exit 2 (харнесс блокирует Stop и возвращает текст агенту).
//   5. Иначе exit 0 (no-op в несвязанных сессиях — рискованные файлы не трогались).

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SITES = join(homedir(), 'Sites');
const RISK = ['config/project.php', 'assets/js/main.js', 'assets/css/main.css'];

function isPlatform(dir) {
  return existsSync(join(dir, 'src/Action/PageAction.php'));
}
function changedRiskFiles(dir) {
  const r = spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) return [];
  const changed = r.stdout.split('\n').map((l) => l.slice(3).trim());
  return RISK.filter((f) => changed.some((c) => c === f || c.startsWith(f)));
}

let blocked = [];
let dirs = [];
try {
  dirs = readdirSync(SITES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(SITES, d.name));
} catch {
  process.exit(0);
}

for (const dir of dirs) {
  if (!isPlatform(dir)) continue;
  const risky = changedRiskFiles(dir);
  if (risky.length === 0) continue;
  if (!existsSync(join(dir, 'node_modules'))) continue; // не можем собрать — пропускаем
  for (const script of ['build:js', 'build:css', 'validate-json']) {
    const r = spawnSync('npm', ['run', script], { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) {
      blocked.push(`${dir}: npm run ${script} FAIL (изменены: ${risky.join(', ')})`);
      break;
    }
  }
}

if (blocked.length > 0) {
  console.error(
    'verify-гейт НЕ зелёный — нельзя завершать как «verified»:\n' +
      blocked.map((b) => '  ✗ ' + b).join('\n') +
      '\nПочини сборку (часто divergence: main.js/main.css импортят чужие модули) и перепроверь: npm run verify -- <path>.'
  );
  process.exit(2);
}
process.exit(0);
