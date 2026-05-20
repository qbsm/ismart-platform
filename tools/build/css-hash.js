const fs = require('fs');
const path = require('path');
const nodeCrypto = require('node:crypto');
const postcss = require('postcss');
const postcssConfig = require('../../postcss.config');

// Пути к файлам
const inputFile = path.resolve(__dirname, '../../assets/css/main.css');
const outputDir = path.resolve(__dirname, '../../assets/css/build');
const manifestPath = path.resolve(outputDir, 'css-manifest.json');

// Создаем директорию, если не существует
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Получаем текущий активный файл из манифеста
function getCurrentActiveFile() {
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest && manifest['main.css']) {
        const filePath = manifest['main.css'];
        return path.basename(filePath);
      }
    } catch (error) {
      console.log('Ошибка при чтении текущего манифеста:', error.message);
    }
  }
  return null;
}

// Удаляем старые файлы CSS, кроме текущего активного
function cleanOldFiles(currentFile, newFile) {
  // Не удаляем текущий активный файл, пока не убедимся, что новый файл доступен
  const cssFiles = fs
    .readdirSync(outputDir)
    .filter((file) => /^main\.[a-f0-9]+\.css$/.test(file))
    .filter((file) => file !== currentFile && file !== newFile)
    .map((file) => path.join(outputDir, file));

  cssFiles.forEach((file) => {
    fs.unlinkSync(file);
    console.log(`Удален старый CSS файл: ${path.basename(file)}`);
  });
}

// Функция для создания хеша содержимого
function generateHash(content) {
  return nodeCrypto.createHash('md5').update(content).digest('hex').slice(0, 8);
}

// Функция для обработки CSS с PostCSS
async function processCss() {
  try {
    // Получаем текущий активный файл прежде чем удалить что-либо
    const currentActiveFile = getCurrentActiveFile();

    // Читаем исходный CSS файл
    const css = fs.readFileSync(inputFile, 'utf8');

    // Создаем экземпляр PostCSS с плагинами из конфига
    const processor = postcss(postcssConfig.plugins);

    // Обрабатываем CSS (source maps только в development)
    const isProduction = process.env.NODE_ENV === 'production';
    const result = await processor.process(css, {
      from: inputFile,
      to: path.join(outputDir, 'main.css'),
      map: isProduction ? false : { inline: true },
    });

    // Генерируем хеш обработанного CSS
    const hash = generateHash(result.css);

    // Формируем имя файла с хешем
    const outputFileName = `main.${hash}.css`;
    const outputFilePath = path.join(outputDir, outputFileName);

    // Проверяем, не существует ли уже файл с таким хешем (кэширование)
    if (fs.existsSync(outputFilePath)) {
      console.log(`Файл ${outputFileName} уже существует, используем его`);
    } else {
      // Записываем обработанный CSS в файл
      fs.writeFileSync(outputFilePath, result.css);
      console.log(`CSS обработан и сохранен: ${outputFilePath}`);
    }

    // Проверяем, что файл доступен для чтения
    if (!fs.existsSync(outputFilePath)) {
      throw new Error(`Не удалось найти созданный файл: ${outputFileName}`);
    }

    // Создаем манифест
    const manifest = {
      'main.css': `assets/css/build/${outputFileName}`,
    };

    // Записываем манифест в файл
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Создан манифест: ${manifestPath}`);
    console.log('Содержимое манифеста:', manifest);

    // Теперь безопасно удаляем старые файлы, но только после успешного обновления манифеста
    cleanOldFiles(currentActiveFile, outputFileName);

    // Синхронизируем билд в public/
    syncToPublic(outputDir, outputFileName);
  } catch (error) {
    console.error('Ошибка при обработке CSS:', error);
    process.exit(1);
  }
}

// Синхронизируем CSS-билд в public/assets/css/build/
function syncToPublic(sourceDir, newFileName) {
  const publicAssetsDir = path.resolve(__dirname, '../../public/assets');
  // Если public/assets — симлинк, файлы уже на месте
  if (fs.existsSync(publicAssetsDir) && fs.lstatSync(publicAssetsDir).isSymbolicLink()) {
    console.log('public/assets — симлинк, синхронизация не требуется');
    return;
  }
  const publicBuildDir = path.join(publicAssetsDir, 'css/build');
  if (!fs.existsSync(publicBuildDir)) {
    fs.mkdirSync(publicBuildDir, { recursive: true });
  }

  // Удаляем старые main.*.css из public
  fs.readdirSync(publicBuildDir)
    .filter((f) => /^main\.[a-f0-9]+\.css$/.test(f))
    .forEach((f) => fs.unlinkSync(path.join(publicBuildDir, f)));

  // Копируем новый CSS и манифест
  fs.copyFileSync(path.join(sourceDir, newFileName), path.join(publicBuildDir, newFileName));
  fs.copyFileSync(path.join(sourceDir, 'css-manifest.json'), path.join(publicBuildDir, 'css-manifest.json'));
  console.log(`Синхронизировано в public: ${newFileName}`);
}

// Запускаем обработку CSS
processCss();
