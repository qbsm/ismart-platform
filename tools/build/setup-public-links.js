/**
 * Создаёт в public/ симлинки на статику, которую отдаёт веб-сервер.
 * Запуск: npm run setup:public-links или при сборке (build/build:dev).
 */
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '../..');
const publicDir = path.join(projectRoot, 'public');

const LINKS = [
  // Статика
  { link: 'assets', target: '../assets', type: 'dir' },
  { link: 'data', target: '../data', type: 'dir' },
  // Корневые файлы
  { link: 'robots.txt', target: '../robots.txt', type: 'file' },
  // Яндекс, Telegram и часть браузеров идут за иконкой в корень домена, минуя <link rel="icon">
  { link: 'favicon.ico', target: '../data/img/favicons/favicon.ico', type: 'file' },
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

// Убрать из LINKS мало: на деплойментах, собранных до этого, симлинки уже лежат в докруте
// и сами не исчезнут. Сборка обязана их вычищать, иначе секрет остаётся открытым до тех пор,
// пока кто-нибудь не заметит его руками.
const LEGACY_LINKS = [
  '.env',
  'composer.json',
  'composer.lock',
  // PHP-рантайму докрут не нужен: index.php ищет корень проекта по файловой системе.
  // Симлинки же отдавали его наружу — по /logs/app-<дата>.log журнал приложения читался
  // из интернета, а /vendor/composer/installed.json показывал состав зависимостей.
  'src',
  'config',
  'templates',
  'vendor',
  'cache',
  'logs',
];

function removeLegacyLinks() {
  for (const link of LEGACY_LINKS) {
    const linkPath = path.join(publicDir, link);
    if (!fs.existsSync(linkPath) && !isSymlink(linkPath)) {
      continue;
    }
    // Трогаем только симлинки: на плоских хостах докрут совпадает с корнем проекта,
    // и там это реальные файлы самого проекта.
    if (!isSymlink(linkPath)) {
      continue;
    }
    try {
      fs.unlinkSync(linkPath);
      console.log(`  удалён устаревший симлинк: public/${link}`);
    } catch (err) {
      console.error(`Не удалось удалить public/${link}:`, err.message);
      process.exitCode = 1;
    }
  }
}

function isSymlink(targetPath) {
  try {
    return fs.lstatSync(targetPath).isSymbolicLink();
  } catch {
    return false;
  }
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
  removeLegacyLinks();
}

main();
