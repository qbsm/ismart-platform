const fs = require('fs');
const path = require('path');

// Получаем аргументы командной строки
const args = process.argv.slice(2);
const component = args[0];
const baseTemplate = args[1] || '';

if (!component) {
  console.error('Укажите имя компонента в качестве аргумента');
  process.exit(1);
}

const twigPath = path.join('templates', 'components', `${component}.twig`);
const content = baseTemplate
  ? `{% extends '${baseTemplate}' %}

{% block component_content %}
  <div class="${component}">
    <!-- Содержимое компонента ${component} -->
  </div>
{% endblock %}`
  : `<div class="${component}"></div>`;

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
  const jsDir = path.join('assets', 'js', 'components');
  const jsPath = path.join(jsDir, `${component}.js`);

  if (!fs.existsSync(jsDir)) {
    fs.mkdirSync(jsDir, { recursive: true });
  }

  const jsContent = `// JavaScript для ${component}
document.addEventListener('DOMContentLoaded', function() {
  console.log('${component} загружен');
  // Код для ${component}
});
`;

  try {
    fs.writeFileSync(jsPath, jsContent);
    console.log(`Создан файл ${jsPath}`);

    // Добавляем импорт в main.js
    const mainJsPath = path.join('assets', 'js', 'main.js');
    if (fs.existsSync(mainJsPath)) {
      let mainJsContent = fs.readFileSync(mainJsPath, 'utf8');
      if (!mainJsContent.includes(`./components/${component}.js`)) {
        // Находим место, куда вставить импорт
        const importSection = '// --- Components ---';
        if (mainJsContent.includes(importSection)) {
          mainJsContent = mainJsContent.replace(
            importSection,
            `${importSection}\nimport './components/${component}.js';`
          );
          fs.writeFileSync(mainJsPath, mainJsContent);
          console.log(`Добавлен импорт в main.js для ${component}.js`);
        }
      }
    }
  } catch (err) {
    console.error(`Ошибка при создании JS файла: ${err.message}`);
  }

  // Создаем CSS файл
  const cssDir = path.join('assets', 'css', 'components');
  const cssPath = path.join(cssDir, `${component}.css`);

  if (!fs.existsSync(cssDir)) {
    fs.mkdirSync(cssDir, { recursive: true });
  }

  const cssContent = `.${component} {
  /* Стили для ${component} */
}

.${component} .container {
  /* Стили для контейнера в ${component} */
}
`;

  try {
    fs.writeFileSync(cssPath, cssContent);
    console.log(`Создан файл ${cssPath}`);

    // Добавляем импорт в main.css
    const mainCssPath = path.join('assets', 'css', 'main.css');
    if (fs.existsSync(mainCssPath)) {
      const mainCssContent = fs.readFileSync(mainCssPath, 'utf8');
      if (!mainCssContent.includes(`components/${component}.css`)) {
        fs.appendFileSync(mainCssPath, `@import "components/${component}.css";\n`);
        console.log(`Добавлен импорт в main.css для ${component}.css`);
      }
    }
  } catch (err) {
    console.error(`Ошибка при создании CSS файла: ${err.message}`);
  }

  console.log('Файлы JS и CSS успешно созданы и подключены');
}
