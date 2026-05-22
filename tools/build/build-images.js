// Image optimization & generation (config/image-sizes.json).
// Sources: data/img/**/raw/ (JPG, PNG, WebP). Also JPG/PNG outside raw/ (legacy).
// Output: WebP in 400/, 800/, 1280/, 1600/, 1920/, 2560/ subdirs.
// Manifest: assets/img/build/image-dimensions.json (рядом с asset/css-manifest).
// Run: npm run build:images

const path = require('path');
const fs = require('fs');
const { glob } = require('glob');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '../..');
const configPath = path.join(projectRoot, 'config/image-sizes.json');
const imgDir = path.join(projectRoot, 'data/img');
const manifestDir = path.join(projectRoot, 'assets/img/build');
const manifestPath = path.join(manifestDir, 'image-dimensions.json');

function loadConfig() {
  const raw = fs.readFileSync(configPath, 'utf8');
  const data = JSON.parse(raw);
  const keys = Array.isArray(data.keys) ? data.keys : ['400', '800', '1280', '1600', '1920', '2560'];
  const widths =
    data.widths && typeof data.widths === 'object'
      ? data.widths
      : { 400: 400, 800: 800, 1280: 1280, 1600: 1600, 1920: 1920, 2560: 2560 };
  return { keys, widths };
}

/**
 * Находит исходные файлы для обработки:
 * 1. JPG/PNG/WebP в папках raw/ - основной формат исходников
 * 2. JPG/PNG вне raw/ - обратная совместимость
 *
 * Файлы в папках с именами-ключами (400/, 800/, ...) пропускаются -
 * это уже сгенерированные версии.
 */
function findSourceFiles(keys) {
  // WebP только из raw/ (иначе подхватим сгенерированные файлы)
  const webpPattern = path.join(imgDir, '**/raw/*.webp').replace(/\\/g, '/');
  const rasterPattern = path.join(imgDir, '**/*.{jpg,jpeg,png}').replace(/\\/g, '/');

  const webpFiles = glob.sync(webpPattern, { nodir: true });
  const rasterFiles = glob.sync(rasterPattern, { nodir: true });

  // Исключаем JPG/PNG из папок-ключей (уже сгенерированные)
  const keyDirs = new Set(keys);
  const filtered = rasterFiles.filter((f) => {
    const rel = path.relative(imgDir, f).replace(/\\/g, '/');
    const parts = path.dirname(rel).split('/');
    return !parts.some((p) => keyDirs.has(p));
  });

  return [...new Set([...webpFiles, ...filtered])];
}

/**
 * Определяет базовую директорию для вывода.
 *
 * Если исходник лежит в raw/:
 *   data/img/tires/at52/raw/photo.jpg → baseDir: tires/at52, baseName: photo
 *
 * Если исходник не в raw/ (обратная совместимость):
 *   data/img/news/photo.jpg → baseDir: news, baseName: photo
 */
function parseImagePath(fullPath) {
  const rel = path.relative(imgDir, fullPath).replace(/\\/g, '/');
  const dir = path.dirname(rel);
  const baseName = path.basename(fullPath, path.extname(fullPath));

  // raw/ -> baseDir = all before raw/ (raw replaced by size key)
  // non-raw -> baseDir = full dir (size key added as subdir)
  const parts = dir.split('/');
  const rawIndex = parts.lastIndexOf('raw');
  let baseDir;
  if (rawIndex !== -1) {
    baseDir = parts.slice(0, rawIndex).join('/');
  } else {
    baseDir = dir;
  }

  return { relPath: rel, baseDir, baseName };
}

async function processImage(inputPath, keys, widths, manifest) {
  const { baseDir, baseName } = parseImagePath(inputPath);
  const meta = await sharp(inputPath).metadata();
  const origW = meta.width || 0;

  for (const key of keys) {
    const targetW = widths[key] != null ? Number(widths[key]) : null;

    // Пропускаем размер если исходник меньше целевой ширины
    // (генерируем только уменьшения, не увеличения)
    if (targetW != null && targetW > 0 && origW > 0 && origW < targetW) {
      continue;
    }

    const outDir = path.join(imgDir, baseDir, key);
    const relDir = path.join(baseDir, key).replace(/\\/g, '/');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // Resize pipeline (shared between WebP and AVIF)
    function createResized() {
      let p = sharp(inputPath);
      if (targetW != null && targetW > 0 && origW > targetW) {
        p = p.resize(targetW, null, { withoutEnlargement: true });
      }
      return p;
    }

    // WebP
    const webpPath = path.join(outDir, baseName + '.webp');
    const webpRelKey = (relDir + '/' + baseName + '.webp').replace(/\\/g, '/');
    await createResized().webp({ quality: 85, effort: 4 }).toFile(webpPath);

    const outMeta = await sharp(webpPath).metadata();
    const w = outMeta.width || 0;
    const h = outMeta.height || 0;
    if (w && h) {
      manifest[webpRelKey] = { width: w, height: h };
    }

    // AVIF
    const avifPath = path.join(outDir, baseName + '.avif');
    const avifRelKey = (relDir + '/' + baseName + '.avif').replace(/\\/g, '/');
    await createResized().avif({ quality: 63, effort: 4 }).toFile(avifPath);

    const avifMeta = await sharp(avifPath).metadata();
    const aw = avifMeta.width || 0;
    const ah = avifMeta.height || 0;
    if (aw && ah) {
      manifest[avifRelKey] = { width: aw, height: ah };
    }
  }
}

async function main() {
  if (!fs.existsSync(imgDir)) {
    console.log('data/img не найден, пропуск build:images');
    return;
  }

  let keys = ['400', '800', '1280', '1600', '1920', '2560'];
  let widths = { 400: 400, 800: 800, 1280: 1280, 1600: 1600, 1920: 1920, 2560: 2560 };
  if (fs.existsSync(configPath)) {
    const config = loadConfig();
    keys = config.keys;
    widths = config.widths;
  }

  const files = findSourceFiles(keys);
  const manifest = {};

  for (const file of files) {
    try {
      await processImage(file, keys, widths, manifest);
    } catch (err) {
      console.error('Ошибка:', file, err.message);
    }
  }

  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('build:images: обработано файлов:', files.length, ', записей в манифесте:', Object.keys(manifest).length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
