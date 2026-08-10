#!/usr/bin/env node
// verify-deployment.mjs — обязательный гейт «Definition of Done» для любой правки
// деплоя/дистилляции. Запускает РЕАЛЬНУЮ сборку, а не только PHP-рендер.
//
// Зачем: PHP-роут может отдавать 200, пока JS/CSS-сборка падает (частый кейс —
// divergence: assets/js/main.js или assets/css/main.css импортируют модули других
// деплоев/baseline, которых в этом репо нет). Такой провал ловит ТОЛЬКО сборка.
// «Verified» без зелёной сборки — недопустимо. См. roles/orchestrator.md на docs.ismart.pro §Verify.
//
// Использование:
//   node tools/distill/verify-deployment.mjs [path-to-deployment]   (по умолчанию cwd)
//   node tools/distill/verify-deployment.mjs ../beepitron.com --smoke
//
// Exit 0 — все шаги зелёные. Exit 1 — хотя бы один провал (с деталями).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const smoke = args.includes('--smoke');
const target = resolve(args.find((a) => !a.startsWith('--')) ?? process.cwd());

if (!existsSync(resolve(target, 'package.json'))) {
  console.error(`✗ Не найден package.json в ${target}`);
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(resolve(target, 'package.json'), 'utf8'));
const scripts = pkg.scripts ?? {};

// Шаги гейта: только реально объявленные в деплое скрипты.
// build:js (webpack) и build:css — ключевые ловцы divergence в assets.
const steps = [
  ['validate-json', 'JSON-валидность'],
  ['build:js', 'JS-сборка (webpack) — ловит битые/чужие импорты в main.js'],
  ['build:css', 'CSS-сборка — ловит битые @import в main.css'],
].filter(([s]) => scripts[s]);

console.log(`\n▶ verify-deployment: ${target}\n`);
const results = [];
for (const [script, desc] of steps) {
  process.stdout.write(`  • npm run ${script} … `);
  const r = spawnSync('npm', ['run', script], { cwd: target, encoding: 'utf8' });
  const ok = r.status === 0;
  results.push({ script, ok, out: (r.stdout ?? '') + (r.stderr ?? '') });
  console.log(ok ? 'OK' : 'FAIL');
  if (!ok) console.log(`    ↳ ${desc}\n${(r.stdout ?? '') + (r.stderr ?? '')}`.slice(0, 4000));
}

const failed = results.filter((r) => !r.ok);
console.log('\n──────────');
if (failed.length === 0) {
  console.log(`✓ verify PASS (${results.length} шагов): ${target}`);
  if (smoke) {
    console.log('  (рантайм-smoke запускать отдельно: php -S 127.0.0.1:PORT -t public + curl ключевых роутов)');
  }
  process.exit(0);
} else {
  console.error(`✗ verify FAIL: провалено ${failed.length}/${results.length} — ${failed.map((f) => f.script).join(', ')}`);
  console.error('  «Verified» объявлять НЕЛЬЗЯ, пока гейт не зелёный.');
  process.exit(1);
}
