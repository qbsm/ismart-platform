const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT, getAvailableLangs, getExistingSlugs, validateSlug, writeIfNotExists } = require('./utils');

// --- Аргументы ---
const args = process.argv.slice(2);
const page = args[0];

if (!page) {
  console.error('Использование: npm run create-page -- <slug>');
  console.error('Пример:        npm run create-page -- about');
  process.exit(1);
}

// --- Валидация ---
const slugError = validateSlug(page);
if (slugError) {
  console.error(`Ошибка: ${slugError}`);
  process.exit(1);
}

const existingSlugs = getExistingSlugs();
if (existingSlugs.has(page)) {
  console.error(`Ошибка: slug "${page}" уже используется (страница, коллекция или зарезервировано)`);
  process.exit(1);
}

console.log(`\nСоздание страницы "${page}"\n`);

// --- Языки ---
const langs = getAvailableLangs();
console.log(`Языки: ${langs.join(', ')}\n`);

const jsonBase = path.join(PROJECT_ROOT, 'data', 'json');
let isNewPage = false;

// --- JSON + SEO для каждого языка ---
for (const lang of langs) {
  console.log(`--- Язык: ${lang} ---`);

  // Страница
  const pageJsonData = {
    name: page,
    sections: [
      { name: 'header', data: {} },
      { name: 'intro', data: {} },
      { name: 'footer', data: {} },
    ],
  };
  const created = writeIfNotExists(
    path.join(jsonBase, lang, 'pages', `${page}.json`),
    JSON.stringify(pageJsonData, null, 2)
  );
  if (created) {
    isNewPage = true;
  }

  // SEO
  const seoData = {
    name: page,
    title: '',
    meta: [
      { name: 'description', content: '' },
      { property: 'og:url', content: `/${page}/` },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: '' },
      { property: 'og:description', content: '' },
      { property: 'og:site_name', content: '' },
      { property: 'og:image', content: '' },
    ],
  };
  writeIfNotExists(path.join(jsonBase, lang, 'seo', `${page}.json`), JSON.stringify(seoData, null, 2));
}

// --- JS/CSS (только для новых страниц) ---
if (isNewPage) {
  console.log('\n--- JS/CSS ---');

  // JS
  const jsDir = path.join(PROJECT_ROOT, 'assets', 'js', 'pages');
  const jsPath = path.join(jsDir, `${page}.js`);
  const jsContent = `// JavaScript для страницы ${page}
document.addEventListener('DOMContentLoaded', function () {
  // Код для страницы ${page}
});
`;

  if (writeIfNotExists(jsPath, jsContent)) {
    // Добавляем импорт в main.js
    const mainJsPath = path.join(PROJECT_ROOT, 'assets', 'js', 'main.js');
    if (fs.existsSync(mainJsPath)) {
      let mainJsContent = fs.readFileSync(mainJsPath, 'utf8');
      if (!mainJsContent.includes(`./pages/${page}.js`)) {
        const importSection = '// --- Pages ---';
        if (mainJsContent.includes(importSection)) {
          mainJsContent = mainJsContent.replace(importSection, `${importSection}\nimport './pages/${page}.js';`);
          fs.writeFileSync(mainJsPath, mainJsContent);
          console.log(`  импорт добавлен в main.js`);
        }
      }
    }
  }

  // CSS
  const cssDir = path.join(PROJECT_ROOT, 'assets', 'css', 'pages');
  const cssPath = path.join(cssDir, `${page}.css`);
  const cssContent = `.${page} {
  /* Стили для ${page} */
}
`;

  if (writeIfNotExists(cssPath, cssContent)) {
    const mainCssPath = path.join(PROJECT_ROOT, 'assets', 'css', 'main.css');
    if (fs.existsSync(mainCssPath)) {
      const mainCssContent = fs.readFileSync(mainCssPath, 'utf8');
      if (!mainCssContent.includes(`pages/${page}.css`)) {
        fs.appendFileSync(mainCssPath, `@import "pages/${page}.css";\n`);
        console.log(`  импорт добавлен в main.css`);
      }
    }
  }
}

// --- Инструкция ---
console.log('\n========================================');
console.log('Добавьте в config/project.php:');
console.log('========================================\n');
console.log('// sitemap_pages — добавить:');
console.log(`'${page}',\n`);
console.log('========================================');
console.log('Готово!\n');
