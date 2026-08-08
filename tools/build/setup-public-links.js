/**
 * Создаёт в public/ симлинки на все директории и файлы из корня проекта,
 * необходимые для работы приложения (PHP runtime + статика).
 * Запуск: npm run setup:public-links или при сборке (build/build:dev).
 */
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '../..');
const publicDir = path.join(projectRoot, 'public');

const LINKS = [
  // PHP runtime
  { link: 'src', target: '../src', type: 'dir' },
  { link: 'config', target: '../config', type: 'dir' },
  { link: 'templates', target: '../templates', type: 'dir' },
  { link: 'vendor', target: '../vendor', type: 'dir' },
  { link: 'cache', target: '../cache', type: 'dir' },
  { link: 'logs', target: '../logs', type: 'dir' },
  // Статика
  { link: 'assets', target: '../assets', type: 'dir' },
  { link: 'data', target: '../data', type: 'dir' },
  // Корневые файлы
  { link: 'robots.txt', target: '../robots.txt', type: 'file' },
];

/*
 * `.env`, `composer.json` и `composer.lock` здесь были и создавали симлинки внутрь докрута.
 * Приложению они не нужны: `public/index.php` находит корень проекта по файловой системе
 * (`dirname(__DIR__)`), а не через докрут. Зато веб-сервер отдавал их наружу — 09.08.2026 так
 * утекли `.env` девяти промо-сайтов вместе с токеном CallTouch. Секретам в докруте не место,
 * даже прикрытым правилом nginx: правило можно забыть на новом сайте, а сборка молча
 * пересоздаёт симлинк.
 */

function ensurePublicDir() {
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
}

function createSymlink(linkPath, targetRel, type) {
  const targetAbs = path.resolve(path.dirname(linkPath), targetRel);
  if (!fs.existsSync(targetAbs)) {
    console.warn(`setup-public-links: цель не найдена, пропуск: ${targetRel} → ${linkPath}`);
    return;
  }
  if (fs.existsSync(linkPath)) {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      const current = fs.readlinkSync(linkPath);
      if (path.resolve(path.dirname(linkPath), current) === targetAbs) {
        return;
      }
    }
    fs.unlinkSync(linkPath);
  }
  fs.symlinkSync(targetRel, linkPath, type === 'dir' ? 'dir' : 'file');
  console.log(`  ${path.relative(projectRoot, linkPath)} → ${targetRel}`);
}

function main() {
  ensurePublicDir();
  console.log('Симлинки в public/:');
  for (const { link, target, type } of LINKS) {
    const linkPath = path.join(publicDir, link);
    try {
      createSymlink(linkPath, target, type);
    } catch (err) {
      console.error(`Ошибка при создании ${link}:`, err.message);
      process.exitCode = 1;
    }
  }
}

main();
