#!/usr/bin/env node
/**
 * Проверка фавиконки: комплект файлов и различимость в 16 px.
 *
 * Жалобы «фавиконка не показывается» почти всегда означают не отсутствие файла, а иконку
 * без непрозрачной плашки: белый логотип пропадает на светлой панели вкладок, тёмный — на
 * тёмной, а широкий дилерский шильд после сжатия до 16 px превращается в серую кляксу.
 * 13.08.2026 обход 91 боевого домена платформы дал 23 такие иконки и 24 сайта с 404 на
 * корневом /favicon.ico, куда за иконкой ходят Яндекс и Telegram.
 *
 *   node tools/ops/check-favicons.js
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const ROOT = process.cwd();
const DIR = join(ROOT, 'data/img/favicons');
const REQUIRED = [
  'favicon.ico',
  'favicon.svg',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'site.webmanifest',
];
const BACKGROUNDS = [
  { name: 'светлая панель', rgb: [241, 243, 244] },
  { name: 'тёмная панель', rgb: [32, 33, 36] },
];
const MIN_VISIBLE_SHARE = 0.08;

if (!existsSync(DIR)) {
  process.exit(0);
}

const problems = [];
const warnings = [];

function luminance([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function pixels16(file) {
  const { data } = await sharp(file)
    .resize(16, 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = [];
  for (let i = 0; i < data.length; i += 4) {
    out.push([data[i], data[i + 1], data[i + 2], data[i + 3]]);
  }
  return out;
}

function visibleShare(pixels, bg) {
  const bgLum = luminance(bg);
  let visible = 0;
  for (const [r, g, b, a] of pixels) {
    const alpha = a / 255;
    const composited = [
      r * alpha + bg[0] * (1 - alpha),
      g * alpha + bg[1] * (1 - alpha),
      b * alpha + bg[2] * (1 - alpha),
    ];
    if (Math.abs(luminance(composited) - bgLum) > 40) visible += 1;
  }
  return visible / pixels.length;
}

for (const file of REQUIRED) {
  if (!existsSync(join(DIR, file))) problems.push(`нет файла data/img/favicons/${file}`);
}

const icoPath = join(DIR, 'favicon.ico');
if (existsSync(icoPath)) {
  const ico = readFileSync(icoPath);
  if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) {
    problems.push('favicon.ico не ICO: под этим именем лежит PNG, Яндекс и часть ботов его не возьмут');
  } else {
    const layers = ico.readUInt16LE(4);
    if (layers < 2) warnings.push(`favicon.ico содержит ${layers} размер вместо 16/32/48`);
  }
}

const rootIcon = join(ROOT, 'public/favicon.ico');
if (!existsSync(rootIcon)) {
  problems.push('в докруте нет favicon.ico — запустите npm run setup:public-links');
}

const source = existsSync(join(DIR, 'favicon-32x32.png')) ? join(DIR, 'favicon-32x32.png') : null;
if (source) {
  const pixels = await pixels16(source);
  const opaque = pixels.filter(([, , , a]) => a > 32);
  const fill = opaque.length / pixels.length;

  for (const bg of BACKGROUNDS) {
    const share = visibleShare(pixels, bg.rgb);
    const line = `${bg.name}: различимо ${Math.round(share * 100)}% плитки`;
    if (share < MIN_VISIBLE_SHARE) problems.push(`${line} — иконка на этом фоне пропадает`);
    else console.log(`  ✓ ${line}`);
  }

  if (fill < 0.6) {
    warnings.push(
      `плашки нет: непрозрачны ${Math.round(fill * 100)}% пикселей. Логотип «в воздухе» держится только на одном фоне`
    );
  }

  const lum = opaque.map(([r, g, b]) => luminance([r, g, b]));
  const mean = lum.reduce((a, b) => a + b, 0) / (lum.length || 1);
  const std = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / (lum.length || 1));
  if (std < 25 && fill < 0.9) {
    warnings.push('одноцветный силуэт без внутренней структуры — в 16 px читается как пятно');
  }
}

for (const w of warnings) console.log(`  ⚠ ${w}`);
for (const p of problems) console.log(`  ✗ ${p}`);

if (problems.length) {
  console.log('\nФавиконка не пройдёт: см. пункты выше.');
  process.exit(1);
}
console.log('\nФавиконка в порядке.');
