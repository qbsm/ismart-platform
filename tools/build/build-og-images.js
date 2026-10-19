// og:image для соцсетей и мессенджеров — JPEG 1200x630 рядом с исходной обложкой.
//
// Зачем отдельный файл, а не готовые варианты из build-images: Telegram не разворачивает
// WebP в превью, а пропорция обложки (3:2, 4:3) не совпадает с 1.91:1 — соцсеть обрезает
// картинку сама и часто по живому. Здесь кадрируем осознанно: cover по центру.
//
// Вход:  data/img/events/<slug>/hero.webp, data/img/restaurants/<slug>/covers/raw/1.jpg
// Выход: рядом с исходником <имя>-og.jpg
//
// Запуск:
//   node tools/build/build-og-images.js                 — события и рестораны
//   node tools/build/build-og-images.js events          — только события
//   node tools/build/build-og-images.js --force         — пересобрать даже свежие

const path = require('path');
const fs = require('fs');
const { glob } = require('glob');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '../..');
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const OG_QUALITY = 82;

const SOURCES = {
  events: 'data/img/events/*/hero.{webp,jpg,jpeg,png}',
};

// Обложка карточки — не всегда файл с именем 1: её задают данные. Читаем первый кадр из
// covers и делаем превью именно для него, иначе в мессенджер уедет чужая картинка.
function coversFromData(lang = 'ru') {
  const dir = path.join(projectRoot, 'data/json', lang, 'restaurants');
  if (!fs.existsSync(dir)) return [];

  const out = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const first = Array.isArray(data.covers) ? data.covers[0] : null;
      const src = first && typeof first.src === 'string' ? first.src : '';
      if (src) out.push(path.join(projectRoot, src));
    } catch {
      // битый JSON — не повод валить сборку картинок
    }
  }
  return out;
}

// Исходника может не быть: часть съёмки отдали уже подготовленной. Берём самый крупный
// собранный вариант того же кадра.
function resolveSource(file) {
  if (fs.existsSync(file)) return file;

  const base = path.basename(file, path.extname(file));
  const coversDir = path.dirname(path.dirname(file));
  let best = null;
  let bestSize = 0;
  for (const size of ['2560', '1920', '1600', '1280', '800', '400']) {
    for (const ext of ['webp', 'avif', 'jpg']) {
      const candidate = path.join(coversDir, size, `${base}.${ext}`);
      if (fs.existsSync(candidate) && Number(size) > bestSize) {
        best = candidate;
        bestSize = Number(size);
      }
    }
  }
  return best;
}

function ogPathFor(src) {
  const dir = path.dirname(src);
  const base = path.basename(src, path.extname(src));
  return path.join(dir, `${base}-og.jpg`);
}

function isFresh(src, out) {
  if (!fs.existsSync(out)) return false;
  return fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs;
}

async function build(src, force) {
  const out = ogPathFor(src);
  const real = resolveSource(src);
  if (!real) return { out, skipped: true };
  if (!force && isFresh(real, out)) return { out, skipped: true };

  await sharp(real)
    .resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: OG_QUALITY, progressive: true, mozjpeg: true })
    .toFile(path.join(projectRoot, 'tmp-og.jpg'));

  fs.renameSync(path.join(projectRoot, 'tmp-og.jpg'), out);
  return { out, skipped: false };
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const filters = args.filter((a) => !a.startsWith('--'));

  const wantRestaurants = !filters.length || filters.includes('restaurants');
  const groups = filters.length ? filters.filter((f) => SOURCES[f]) : Object.keys(SOURCES);

  if (!groups.length && !wantRestaurants) {
    console.error(`Неизвестный фильтр. Доступные: ${Object.keys(SOURCES).join(', ')}`);
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;
  const failed = [];

  for (const group of groups) {
    const pattern = path.join(projectRoot, SOURCES[group]);
    const files = await glob(pattern, { nodir: true });

    for (const src of files) {
      if (src.endsWith('-og.jpg')) continue;
      try {
        const res = await build(src, force);
        if (res.skipped) skipped += 1;
        else {
          created += 1;
          console.log(`og: ${path.relative(projectRoot, res.out)}`);
        }
      } catch (err) {
        failed.push(`${path.relative(projectRoot, src)}: ${err.message}`);
      }
    }
  }

  if (wantRestaurants) {
    for (const src of coversFromData()) {
      if (src.endsWith('-og.jpg')) continue;
      try {
        const res = await build(src, force);
        if (res.skipped) skipped += 1;
        else {
          created += 1;
          console.log(`og: ${path.relative(projectRoot, res.out)}`);
        }
      } catch (err) {
        failed.push(`${path.relative(projectRoot, src)}: ${err.message}`);
      }
    }
  }

  console.log(`build:og-images: создано ${created}, без изменений ${skipped}, ошибок ${failed.length}`);
  failed.forEach((f) => console.error(`  ! ${f}`));
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
