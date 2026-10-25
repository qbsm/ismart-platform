const fs = require('fs');
const path = require('path');

// Получаем аргументы командной строки
const args = process.argv.slice(2);
const section = args[0];

if (!section) {
  console.error('Укажите имя секции в качестве аргумента');
  process.exit(1);
}

const twigPath = path.join('templates', 'sections', `${section}.twig`);
const content = `<section class="${section}"></section>`;

let isNewFile = false;

if (!fs.existsSync(twigPath)) {
  try {
    fs.writeFileSync(twigPath, content);
    console.log(`Создан файл ${twigPath}`);
    isNewFile = true;
  } catch (err) {
    console.error(`Ошибка при создании файла: ${err.message}`);
    process.exit(1);
  }
} else {
  console.log(`Файл ${twigPath} уже существует`);
}

// Если был создан новый файл, создаем JS и CSS файлы и добавляем импорты
if (isNewFile) {
  // Создаем JS файл
  const jsDir = path.join('assets', 'js', 'sections');
  const jsPath = path.join(jsDir, `${section}.js`);

  if (!fs.existsSync(jsDir)) {
    fs.mkdirSync(jsDir, { recursive: true });
  }

  const jsContent = `// JavaScript для ${section}
document.addEventListener('DOMContentLoaded', function() {
  console.log('${section} загружен');
  // Код для ${section}
});
`;

  try {
    fs.writeFileSync(jsPath, jsContent);
    console.log(`Создан файл ${jsPath}`);

    // Добавляем импорт в main.js
    const mainJsPath = path.join('assets', 'js', 'main.js');
    if (fs.existsSync(mainJsPath)) {
      let mainJsContent = fs.readFileSync(mainJsPath, 'utf8');
      if (!mainJsContent.includes(`./sections/${section}.js`)) {
        // Находим место, куда вставить импорт
        const importSection = '// --- Sections ---';
        if (mainJsContent.includes(importSection)) {
          mainJsContent = mainJsContent.replace(importSection, `${importSection}\nimport './sections/${section}.js';`);
          fs.writeFileSync(mainJsPath, mainJsContent);
          console.log(`Добавлен импорт в main.js для ${section}.js`);
        }
      }
    }
  } catch (err) {
    console.error(`Ошибка при создании JS файла: ${err.message}`);
  }

  // Создаем CSS файл
  const cssDir = path.join('assets', 'css', 'sections');
  const cssPath = path.join(cssDir, `${section}.css`);

  if (!fs.existsSync(cssDir)) {
    fs.mkdirSync(cssDir, { recursive: true });
  }

  const cssContent = `.${section} {
  /* Стили для ${section} */
}

.${section} .container {
  /* Стили для контейнера в ${section} */
}
`;

  try {
    fs.writeFileSync(cssPath, cssContent);
    console.log(`Создан файл ${cssPath}`);

    // Добавляем импорт в main.css
    const mainCssPath = path.join('assets', 'css', 'main.css');
    if (fs.existsSync(mainCssPath)) {
      const mainCssContent = fs.readFileSync(mainCssPath, 'utf8');
      if (!mainCssContent.includes(`sections/${section}.css`)) {
        fs.appendFileSync(mainCssPath, `@import "sections/${section}.css";\n`);
        console.log(`Добавлен импорт в main.css для ${section}.css`);
      }
    }
  } catch (err) {
    console.error(`Ошибка при создании CSS файла: ${err.message}`);
  }

  console.log('Файлы JS и CSS успешно созданы и подключены');
}
