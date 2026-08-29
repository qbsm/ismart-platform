// Image optimization & generation (config/image-sizes.json).
// Sources: data/img/**/raw/ (JPG, PNG, WebP). Also JPG/PNG outside raw/ (legacy).
// Output: WebP in 400/, 800/, 1280/, 1600/, 1920/, 2560/ subdirs.
// Manifest: assets/img/build/image-dimensions.json (рядом с asset/css-manifest).
// Run: npm run build:images
//
// Инкрементально: вариант перекодируется только если его нет, он старше исходника
// или битый. Иначе размеры для манифеста читаются из готового файла.
//   npm run build:images  — все исходники, пересчёт только устаревших
// Фильтр — путь конкретной картинки, папка или glob (с data/img/ или без него):
//   node tools/build/build-images.js data/img/actions/raw/m3-road.webp
//   node tools/build/build-images.js actions
//   node tools/build/build-images.js 'range/**/raw/*.webp'
//   node tools/build/build-images.js --force actions/raw/m3-road.webp
//   node tools/build/build-images.js --size=1280,1920 actions   — только эти ширины
//   node tools/build/build-images.js --format=webp actions      — только webp (или avif)
// В deployment'ах, где build:images чейнится с deg360-covers, фильтр передаётся
// через npm run build:images:only -- <фильтр>.
// С фильтром манифест дополняется, без фильтра — пересобирается целиком.

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

/**
 * Разбирает аргументы CLI: --force, --size=, --format= и список фильтров.
 * Фильтр со звёздочкой — glob по пути относительно data/img, без неё — подстрока.
 */
function parseArgs(argv) {
  const patterns = [];
  let force = false;
  let sizes = null;
  let formats = null;

  for (const arg of argv) {
    if (arg === '--force' || arg === '-f') {
      force = true;
    } else if (arg.startsWith('--only=')) {
      patterns.push(arg.slice('--only='.length));
    } else if (arg.startsWith('--size=') || arg.startsWith('--sizes=')) {
      sizes = arg
        .split('=')[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith('--format=') || arg.startsWith('--formats=')) {
      formats = arg
        .split('=')[1]
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    } else if (!arg.startsWith('-')) {
      patterns.push(arg);
    }
  }

  return { patterns, force, sizes, formats };
}

/**
 * Приводит фильтр к пути относительно data/img: принимает и «actions/raw/m3-road.webp»,
 * и «data/img/actions/raw/m3-road.webp», и «./data/img/…».
 */
function normalizePattern(pattern) {
  return pattern
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/?data\/img\//, '');
}

function matchesPatterns(fullPath, patterns) {
  if (patterns.length === 0) {
    return true;
  }
  const rel = path.relative(imgDir, fullPath).replace(/\\/g, '/');
  return patterns
    .map(normalizePattern)
    .some((p) => (p.includes('*') ? glob.sync(p, { cwd: imgDir, nodir: true }).includes(rel) : rel.includes(p)));
}

/**
 * Размеры готового варианта: если файл свежее исходника и читается — берём как есть.
 * null означает «надо перекодировать» (нет файла, устарел или битый).
 */
async function reuseDimensions(outPath, srcMtimeMs, force) {
  if (force) {
    return null;
  }
  let stat;
  try {
    stat = fs.statSync(outPath);
  } catch {
    return null;
  }
  if (stat.mtimeMs < srcMtimeMs) {
    return null;
  }
  try {
    const meta = await sharp(outPath).metadata();
    return meta.width && meta.height ? { width: meta.width, height: meta.height } : null;
  } catch {
    return null;
  }
}

async function processImage(inputPath, keys, widths, manifest, options, stats) {
  const { baseDir, baseName } = parseImagePath(inputPath);
  const meta = await sharp(inputPath).metadata();
  const origW = meta.width || 0;
  const srcMtimeMs = fs.statSync(inputPath).mtimeMs;

  for (const key of keys) {
    if (options.sizes && !options.sizes.includes(key)) {
      continue;
    }

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

    for (const format of ['webp', 'avif']) {
      if (options.formats && !options.formats.includes(format)) {
        continue;
      }

      const outPath = path.join(outDir, baseName + '.' + format);
      const relKey = (relDir + '/' + baseName + '.' + format).replace(/\\/g, '/');
      const reused = await reuseDimensions(outPath, srcMtimeMs, options.force);
      if (reused) {
        manifest[relKey] = reused;
        stats.reused += 1;
        continue;
      }

      const pipeline = createResized();
      await (
        format === 'webp' ? pipeline.webp({ quality: 85, effort: 4 }) : pipeline.avif({ quality: 63, effort: 4 })
      ).toFile(outPath);

      const outMeta = await sharp(outPath).metadata();
      if (outMeta.width && outMeta.height) {
        manifest[relKey] = { width: outMeta.width, height: outMeta.height };
      }
      stats.written += 1;
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

  const options = parseArgs(process.argv.slice(2));

  const unknownSizes = (options.sizes || []).filter((s) => !keys.includes(s));
  if (unknownSizes.length > 0) {
    console.error('build:images: неизвестные размеры:', unknownSizes.join(', '), '— доступны:', keys.join(', '));
    process.exit(1);
  }
  const unknownFormats = (options.formats || []).filter((f) => !['webp', 'avif'].includes(f));
  if (unknownFormats.length > 0) {
    console.error('build:images: неизвестные форматы:', unknownFormats.join(', '), '— доступны: webp, avif');
    process.exit(1);
  }

  const allFiles = findSourceFiles(keys);
  const files = allFiles.filter((f) => matchesPatterns(f, options.patterns));

  if (options.patterns.length > 0 && files.length === 0) {
    console.error('build:images: под фильтр', options.patterns.join(', '), 'не попал ни один исходник');
    process.exit(1);
  }

  // Частичный прогон дополняет манифест, полный — пересобирает (чистит устаревшие ключи)
  const partial = options.patterns.length > 0 || options.sizes !== null || options.formats !== null;
  let manifest = {};
  if (partial && fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }
  const stats = { written: 0, reused: 0 };

  for (const file of files) {
    try {
      await processImage(file, keys, widths, manifest, options, stats);
    } catch (err) {
      console.error('Ошибка:', file, err.message);
    }
  }

  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(
    'build:images: исходников:',
    files.length,
    files.length !== allFiles.length ? 'из ' + allFiles.length : '',
    ', сгенерировано:',
    stats.written,
    ', без изменений:',
    stats.reused,
    ', записей в манифесте:',
    Object.keys(manifest).length
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
