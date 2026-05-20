/**
 * Копирует в public/ каталоги assets, data, vendor и файл robots.txt.
 * Для хостингов без поддержки симлинков (FTP). После запуска можно загружать
 * содержимое public/ или весь проект на сервер.
 *
 * Запуск: npm run setup:public-copy
 */
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '../..');
const publicDir = path.join(projectRoot, 'public');

const ENTRIES = [
  { dest: 'assets', source: 'assets', type: 'dir' },
  { dest: 'data', source: 'data', type: 'dir' },
  { dest: 'vendor', source: 'vendor', type: 'dir' },
  { dest: 'robots.txt', source: 'robots.txt', type: 'file' },
];

function ensurePublicDir() {
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
}

function rmIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.lstatSync(targetPath);
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(targetPath);
  } else if (stat.isDirectory()) {
    fs.rmSync(targetPath, { recursive: true });
  } else {
    fs.unlinkSync(targetPath);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const srcPath = path.join(src, name);
    const destPath = path.join(dest, name);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function main() {
  ensurePublicDir();
  console.log('Копирование в public/ (для FTP/без симлинков):');
  for (const { dest, source, type } of ENTRIES) {
    const srcPath = path.join(projectRoot, source);
    const destPath = path.join(publicDir, dest);
    if (!fs.existsSync(srcPath)) {
      console.warn(`  Пропуск ${dest}: не найден ${source}`);
      continue;
    }
    rmIfExists(destPath);
    if (type === 'dir') {
      copyDir(srcPath, destPath);
      console.log(`  ${dest}/ ← ${source}/`);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  ${dest} ← ${source}`);
    }
  }
}

main();
