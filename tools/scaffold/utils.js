const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Читает global.json и возвращает массив кодов языков.
 * @returns {string[]}
 */
function getAvailableLangs() {
  const globalPath = path.join(PROJECT_ROOT, 'data', 'json', 'global.json');
  if (!fs.existsSync(globalPath)) {
    return ['ru'];
  }
  try {
    const global = JSON.parse(fs.readFileSync(globalPath, 'utf8'));
    if (Array.isArray(global.lang)) {
      const codes = global.lang.map((l) => l.code).filter(Boolean);
      return codes.length > 0 ? codes : ['ru'];
    }
  } catch {
    // fallback
  }
  return ['ru'];
}

/**
 * Собирает все занятые slug'и: страницы, директории коллекций, зарезервированные.
 * @returns {Set<string>}
 */
function getExistingSlugs() {
  const slugs = new Set();
  const reserved = ['api', 'admin', 'health', 'sitemap', '404', 'index'];
  reserved.forEach((s) => slugs.add(s));

  // Страницы из data/json/ru/pages/
  const pagesDir = path.join(PROJECT_ROOT, 'data', 'json', 'ru', 'pages');
  if (fs.existsSync(pagesDir)) {
    fs.readdirSync(pagesDir)
      .filter((f) => f.endsWith('.json'))
      .forEach((f) => slugs.add(f.replace('.json', '')));
  }

  // Директории коллекций из data/json/ru/
  const jsonBase = path.join(PROJECT_ROOT, 'data', 'json', 'ru');
  if (fs.existsSync(jsonBase)) {
    fs.readdirSync(jsonBase, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== 'pages' && d.name !== 'seo')
      .forEach((d) => slugs.add(d.name));
  }

  return slugs;
}

/**
 * Валидирует формат slug'а.
 * @param {string} slug
 * @returns {string|null} сообщение об ошибке или null
 */
function validateSlug(slug) {
  if (!slug || typeof slug !== 'string') {
    return 'Slug не может быть пустым';
  }
  if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
    return 'Slug должен начинаться с буквы и содержать только a-z, 0-9, дефис';
  }
  if (slug.length < 2 || slug.length > 50) {
    return 'Slug должен быть от 2 до 50 символов';
  }
  return null;
}

/**
 * Простая сингуляризация английских слов.
 * @param {string} word
 * @returns {string}
 */
function singularize(word) {
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (
    word.endsWith('ches') ||
    word.endsWith('shes') ||
    word.endsWith('ses') ||
    word.endsWith('xes') ||
    word.endsWith('zes')
  ) {
    return word.slice(0, -2);
  }
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 2) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Создаёт директорию рекурсивно, если не существует.
 * @param {string} dir
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Записывает файл, если не существует. Возвращает true если создан.
 * @param {string} filePath
 * @param {string} content
 * @returns {boolean}
 */
function writeIfNotExists(filePath, content) {
  ensureDir(path.dirname(filePath));
  if (fs.existsSync(filePath)) {
    console.log(`  уже существует: ${filePath}`);
    return false;
  }
  fs.writeFileSync(filePath, content);
  console.log(`  создан: ${filePath}`);
  return true;
}

module.exports = {
  PROJECT_ROOT,
  getAvailableLangs,
  getExistingSlugs,
  validateSlug,
  singularize,
  ensureDir,
  writeIfNotExists,
};
