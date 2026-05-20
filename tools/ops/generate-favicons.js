const path = require('path');
const fs = require('fs');
const { favicons } = require('favicons');
const { execSync } = require('child_process');

const SOURCE_SVG = path.resolve(__dirname, '../../data/img/ui/favicon.svg');
const OUTPUT_DIR = path.resolve(__dirname, '../../data/img/favicons');
const HTML_TEMPLATE_FILE = path.resolve(__dirname, '../../templates/components/favicons.twig');

// Убедимся, что директория существует
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ==============================
// Настройки проекта — измените под свой сайт
// ==============================
const APP_NAME = process.env.APP_NAME || 'My App';
const APP_SHORT_NAME = process.env.APP_SHORT_NAME || APP_NAME;
const APP_DESCRIPTION = process.env.APP_DESCRIPTION || '';
const APP_BG_COLOR = process.env.APP_BG_COLOR || '#ffffff';
const APP_THEME_COLOR = process.env.APP_THEME_COLOR || '#ffffff';

// Настройки для генерации фавиконок
const CONFIG = {
  path: '/data/img/favicons', // Путь к папке с фавиконками на сайте
  appName: APP_NAME,
  appShortName: APP_SHORT_NAME,
  appDescription: APP_DESCRIPTION,
  background: APP_BG_COLOR,
  theme_color: APP_THEME_COLOR,
  appleStatusBarStyle: 'black-translucent',
  display: 'standalone',
  orientation: 'portrait',
  scope: '/',
  start_url: '/?homescreen=1',
  version: '1.0',
  // Оптимизированные настройки иконок для 2025 года
  icons: {
    // Основные векторные и растровые форматы
    android: true, // Генерируем Android иконки
    appleIcon: true, // Генерируем Apple Touch Icon
    appleStartup: false, // Отключаем множество splash-экранов, которые уже не требуются
    favicons: true, // Генерируем ICO файл
    windows: false, // Отключаем избыточные Windows Tiles
    yandex: false, // Отключаем Яндекс-специфичные иконки
  },
  // Дополнительные настройки для оптимизации вывода
  shortcuts: [],
  firefox: false,
  include: ['favicon.svg'], // Обязательно включаем SVG-версию иконки
};

async function generateFavicons() {
  console.log('Начинаем генерацию современных фавиконок...');

  try {
    const source = fs.readFileSync(SOURCE_SVG);

    const response = await favicons(source, CONFIG);

    // Убедимся, что SVG фавиконка доступна
    if (!response.images.find((img) => img.name === 'favicon.svg')) {
      // Если библиотека не создала SVG-версию, копируем исходную
      fs.copyFileSync(SOURCE_SVG, path.join(OUTPUT_DIR, 'favicon.svg'));
      console.log('✓ SVG фавиконка скопирована вручную');

      // Добавляем SVG иконку в результаты для включения в HTML
      response.html.unshift('<link rel="icon" href="data/img/favicons/favicon.svg" type="image/svg+xml">');
    }

    // Сохраняем только необходимые изображения
    const essentialImages = [
      'favicon.ico',
      'favicon-16x16.png',
      'favicon-32x32.png',
      'favicon-48x48.png',
      'android-chrome-96x96.png',
      'android-chrome-192x192.png',
      'android-chrome-512x512.png',
      'apple-touch-icon.png',
    ];

    // Удаляем старые ненужные файлы (кроме SVG и site.webmanifest)
    const existingFiles = fs.readdirSync(OUTPUT_DIR);
    for (const file of existingFiles) {
      const keepFile = file === 'favicon.svg' || file === 'site.webmanifest' || essentialImages.includes(file);

      if (!keepFile) {
        fs.unlinkSync(path.join(OUTPUT_DIR, file));
        console.log(`✓ Удален устаревший файл: ${file}`);
      }
    }

    // Сохраняем только нужные изображения
    console.log('\nСгенерированные изображения библиотекой favicons:');
    response.images.forEach((img) => console.log(`  - ${img.name}`));
    console.log('');

    for (const image of response.images) {
      if (essentialImages.includes(image.name)) {
        await fs.promises.writeFile(path.join(OUTPUT_DIR, image.name), image.contents);
        console.log(`✓ Сохранено: ${image.name}`);
      }
    }

    // Создаем и сохраняем site.webmanifest для PWA
    const manifestContent = JSON.stringify(
      {
        name: CONFIG.appName,
        short_name: CONFIG.appShortName,
        icons: [
          {
            src: `${CONFIG.path}/android-chrome-192x192.png`,
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: `${CONFIG.path}/android-chrome-512x512.png`,
            sizes: '512x512',
            type: 'image/png',
          },
        ],
        theme_color: CONFIG.theme_color,
        background_color: CONFIG.background,
        display: CONFIG.display,
      },
      null,
      2
    );

    fs.writeFileSync(path.join(OUTPUT_DIR, 'site.webmanifest'), manifestContent);
    console.log('✓ Создан site.webmanifest для PWA');

    // Создаём минимальный, оптимизированный Twig шаблон для современных фавиконок 2025
    const optimizedHtml = [
      '<!-- Современные форматы favicon для 2025 года -->',
      '<link rel="icon" href="/data/img/favicons/favicon.svg" type="image/svg+xml">',
      '<link rel="icon" type="image/x-icon" href="/data/img/favicons/favicon.ico">',
      '<link rel="icon" type="image/png" sizes="32x32" href="/data/img/favicons/favicon-32x32.png">',
      '<link rel="icon" type="image/png" sizes="96x96" href="/data/img/favicons/android-chrome-96x96.png">',
      '<link rel="icon" type="image/png" sizes="16x16" href="/data/img/favicons/favicon-16x16.png">',
      '<link rel="apple-touch-icon" sizes="180x180" href="/data/img/favicons/apple-touch-icon.png">',
      `<meta name="apple-mobile-web-app-title" content="${CONFIG.appName}">`,
      '<link rel="manifest" href="/data/img/favicons/site.webmanifest">',
      `<meta name="theme-color" content="${CONFIG.theme_color}">`,
    ];

    const twigTemplate = `{# Этот файл автоматически сгенерирован скриптом generate-favicons.js #}
{# Оптимизированный набор фавиконок для 2025 года #}
{% block favicons %}
${optimizedHtml.join('\n')}
{% endblock %}`;

    fs.writeFileSync(HTML_TEMPLATE_FILE, twigTemplate);

    // Создаём чистый ICO файл с помощью ImageMagick, содержащий только нужные размеры
    try {
      const favicon16Path = path.join(OUTPUT_DIR, 'favicon-16x16.png');
      const favicon32Path = path.join(OUTPUT_DIR, 'favicon-32x32.png');
      const favicon48Path = path.join(OUTPUT_DIR, 'favicon-48x48.png');
      const icoPath = path.join(OUTPUT_DIR, 'favicon.ico');

      // Используем convert для создания ICO из PNG файлов (порядок важен: от меньшего к большему)
      execSync(`convert "${favicon16Path}" "${favicon32Path}" "${favicon48Path}" "${icoPath}"`, { stdio: 'pipe' });
      console.log('✓ Создан чистый favicon.ico (16x16, 32x32, 48x48)');
    } catch (error) {
      console.warn('⚠ Не удалось пересоздать favicon.ico с помощью ImageMagick:', error.message);
    }

    console.log('✓ Современные фавиконки успешно сгенерированы!');
    console.log(`✓ HTML код для фавиконок сохранен в ${HTML_TEMPLATE_FILE}`);
    console.log('✓ Все устаревшие форматы были удалены');
  } catch (error) {
    console.error('Ошибка при генерации фавиконок:', error);
    process.exit(1);
  }
}

generateFavicons();
