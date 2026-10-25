#!/usr/bin/env node

/*
  Рекурсивно валидирует все .json файлы в указанных директориях.

  Запуск:
    node tools/ops/validate-json.js [dir1] [dir2] ...

  Пример:
    node tools/ops/validate-json.js data/json
*/

const fs = require('fs');
const path = require('path');

function listJsonFiles(rootDir) {
  const results = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        results.push(full);
      }
    }
  }
  walk(rootDir);
  return results;
}

function validateFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    JSON.parse(content);
    return null;
  } catch (err) {
    return err && err.message ? err.message : String(err);
  }
}

function main() {
  const roots = process.argv.slice(2);
  if (roots.length === 0) {
    console.error('Укажите директорию(и) для проверки. Например: node tools/ops/validate-json.js data/json');
    process.exit(2);
  }

  let total = 0;
  const errors = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) {
      console.error(`Пропуск: директория не найдена: ${root}`);
      continue;
    }
    const files = listJsonFiles(root);
    for (const file of files) {
      total += 1;
      const err = validateFile(file);
      if (err) {
        errors.push({ file, err });
      }
    }
  }

  if (errors.length > 0) {
    console.error(`\nНайдены невалидные JSON (${errors.length} из ${total}):`);
    for (const e of errors) {
      console.error(`- ${e.file}: ${e.err}`);
    }
    process.exit(1);
  } else {
    console.log(`Все JSON валидны. Проверено файлов: ${total}.`);
  }
}

main();

// Pre-commit hook пример:
// Добавьте в .git/hooks/pre-commit (сделать исполняемым):
// #!/bin/sh
// node tools/ops/validate-json.js data/json || exit 1
