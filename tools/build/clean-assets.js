const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Пути к директориям сборки
const jsBuildDir = path.resolve(__dirname, '../../assets/js/build');
const cssBuildDir = path.resolve(__dirname, '../../assets/css/build');

// Пути к манифестам
const jsManifestPath = path.resolve(jsBuildDir, 'asset-manifest.json');
const cssManifestPath = path.resolve(cssBuildDir, 'css-manifest.json');

// Функция для очистки старых файлов
function cleanOldAssets() {
  console.log('Очистка устаревших файлов сборки...');

  // Очистка JS файлов
  cleanJsAssets();

  // Очистка CSS файлов
  cleanCssAssets();
}

// Функция для очистки устаревших JS файлов
function cleanJsAssets() {
  console.log('Очистка устаревших JS файлов...');

  // Проверяем наличие манифеста
  if (!fs.existsSync(jsManifestPath)) {
    console.warn('JS манифест не найден, нет информации о текущих файлах');
    return;
  }

  // Читаем манифест для получения актуальных файлов
  const manifestContent = fs.readFileSync(jsManifestPath, 'utf8');
  const manifest = JSON.parse(manifestContent);

  // Создаем набор актуальных файлов
  const currentFiles = new Set();
  Object.values(manifest).forEach((file) => {
    const filePath = path.resolve(jsBuildDir, path.basename(file));
    currentFiles.add(filePath);
  });

  // Находим все файлы в директории сборки
  const allFiles = glob.sync(path.join(jsBuildDir, '*.js'));
  const allJsMapFiles = glob.sync(path.join(jsBuildDir, '*.js.map'));

  // Объединяем все найденные файлы
  const allFoundFiles = [...allFiles, ...allJsMapFiles];

  // Удаляем файлы, которые не в манифесте
  let deletedCount = 0;
  allFoundFiles.forEach((file) => {
    if (!currentFiles.has(file) && path.basename(file) !== 'asset-manifest.json') {
      fs.unlinkSync(file);
      console.log(`Удален устаревший JS файл: ${path.basename(file)}`);
      deletedCount++;
    }
  });

  console.log(`Очистка JS файлов завершена. Удалено ${deletedCount} устаревших файлов.`);
}

// Функция для очистки устаревших CSS файлов
function cleanCssAssets() {
  console.log('Очистка устаревших CSS файлов...');

  // Проверяем наличие манифеста
  if (!fs.existsSync(cssManifestPath)) {
    console.warn('CSS манифест не найден, нет информации о текущих файлах');
    return;
  }

  // Читаем манифест для получения актуальных файлов
  const manifestContent = fs.readFileSync(cssManifestPath, 'utf8');
  const manifest = JSON.parse(manifestContent);

  // Создаем набор актуальных файлов
  const currentFiles = new Set();
  Object.values(manifest).forEach((file) => {
    const filePath = path.resolve(cssBuildDir, path.basename(file));
    currentFiles.add(filePath);
  });

  // Находим все CSS файлы в директории сборки
  const allCssFiles = glob.sync(path.join(cssBuildDir, '*.css'));
  const allCssMapFiles = glob.sync(path.join(cssBuildDir, '*.css.map'));

  // Объединяем все найденные файлы
  const allFoundFiles = [...allCssFiles, ...allCssMapFiles];

  // Удаляем файлы, которые не в манифесте
  let deletedCount = 0;
  allFoundFiles.forEach((file) => {
    const baseName = path.basename(file);
    if (!currentFiles.has(file) && baseName !== 'css-manifest.json' && baseName !== 'critical.min.css') {
      fs.unlinkSync(file);
      console.log(`Удален устаревший CSS файл: ${path.basename(file)}`);
      deletedCount++;
    }
  });

  console.log(`Очистка CSS файлов завершена. Удалено ${deletedCount} устаревших файлов.`);
}

// Запускаем очистку
cleanOldAssets();
