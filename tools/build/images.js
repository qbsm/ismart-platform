/**
 * Оптимизация изображений и генерация WebP/AVIF при сборке.
 * Обрабатывает data/img: jpg, jpeg, png — сжатие, вывод .webp и .avif, манифест размеров (CLS).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '../..');
const dataImgDir = path.join(projectRoot, 'data', 'img');
const manifestPath = path.join(projectRoot, 'data', 'img', 'image-dimensions.json');

const EXTENSIONS = ['.jpg', '.jpeg', '.png'];

/** Ключ манифеста: путь относительно data/img (без префикса data/img/) */
function manifestKey(relPath) {
  return relPath.split(path.sep).join('/');
}

function findImages(dir, baseDir = dir) {
  const list = [];
  if (!fs.existsSync(dir)) return list;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(baseDir, full);
    if (e.isDirectory()) {
      list.push(...findImages(full, baseDir));
    } else if (EXTENSIONS.includes(path.extname(e.name).toLowerCase())) {
      list.push({ full, rel });
    }
  }
  return list;
}

async function processImage(filePath, relPath) {
  const relSlash = manifestKey(relPath);
  const ext = path.extname(filePath).toLowerCase();
  const basePath = filePath.slice(0, -ext.length);
  const webpPath = basePath + '.webp';
  const avifPath = basePath + '.avif';

  let pipeline = sharp(filePath).rotate();
  const meta = await pipeline.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;

  const webpOpts = { quality: 85 };
  const avifOpts = { quality: 70 };

  pipeline = sharp(filePath).rotate();
  await pipeline.webp(webpOpts).toFile(webpPath);

  pipeline = sharp(filePath).rotate();
  await pipeline.avif(avifOpts).toFile(avifPath);

  return { key: relSlash, width, height };
}

async function main() {
  const images = findImages(dataImgDir);
  if (images.length === 0) {
    console.log('images: в data/img нет jpg/png для обработки');
    if (fs.existsSync(manifestPath)) {
      fs.writeFileSync(manifestPath, JSON.stringify({}, null, 2));
    }
    return;
  }

  const manifest = {};
  for (const { full, rel } of images) {
    try {
      const { key, width, height } = await processImage(full, rel);
      manifest[key] = { width, height };
      const baseKey = key.replace(/\.[^.]+$/i, '');
      manifest[baseKey + '.webp'] = { width, height };
      manifest[baseKey + '.avif'] = { width, height };
      console.log('images:', rel);
    } catch (err) {
      console.error('images:', rel, err.message);
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('images: манифест размеров записан в data/img/image-dimensions.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
