// TTF → WOFF2 conversion with Cyrillic + Latin subset.
// Uses subset-font (harfbuzz WASM) — no system dependencies.
// Manual script — NOT part of build pipeline.
// Run: node tools/utils/convert-fonts.js

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const subsetFont = require('subset-font');

const projectRoot = path.resolve(__dirname, '../..');
const fontsDir = path.join(projectRoot, 'assets/fonts');

// Cyrillic + Latin + common punctuation/symbols
const SUBSET_CHARS = (() => {
  let chars = '';
  // Basic Latin (U+0000–00FF)
  for (let i = 0x0020; i <= 0x00ff; i++) chars += String.fromCodePoint(i);
  // Latin Extended-A (U+0100–017F)
  for (let i = 0x0100; i <= 0x017f; i++) chars += String.fromCodePoint(i);
  // Latin Extended-B subset (U+0180–024F)
  for (let i = 0x0180; i <= 0x024f; i++) chars += String.fromCodePoint(i);
  // Cyrillic (U+0400–04FF)
  for (let i = 0x0400; i <= 0x04ff; i++) chars += String.fromCodePoint(i);
  // Cyrillic Supplement (U+0500–052F)
  for (let i = 0x0500; i <= 0x052f; i++) chars += String.fromCodePoint(i);
  // General Punctuation (U+2000–206F)
  for (let i = 0x2000; i <= 0x206f; i++) chars += String.fromCodePoint(i);
  // Currency Symbols (U+20A0–20CF)
  for (let i = 0x20a0; i <= 0x20cf; i++) chars += String.fromCodePoint(i);
  // Mathematical Operators subset (U+2200–22FF)
  for (let i = 0x2200; i <= 0x22ff; i++) chars += String.fromCodePoint(i);
  return chars;
})();

async function main() {
  const ttfFiles = glob.sync(path.join(fontsDir, '**/*.ttf').replace(/\\/g, '/'), { nodir: true });

  if (ttfFiles.length === 0) {
    console.log('TTF файлы не найдены в assets/fonts/');
    return;
  }

  console.log(`Найдено TTF файлов: ${ttfFiles.length}\n`);

  let converted = 0;
  let skipped = 0;

  for (const ttfPath of ttfFiles) {
    const woff2Path = ttfPath.replace(/\.ttf$/, '.woff2');
    const relPath = path.relative(projectRoot, ttfPath);
    const relWoff2 = path.relative(projectRoot, woff2Path);

    // Пропуск если woff2 уже существует и новее TTF
    if (fs.existsSync(woff2Path)) {
      const ttfStat = fs.statSync(ttfPath);
      const woff2Stat = fs.statSync(woff2Path);
      if (woff2Stat.mtimeMs >= ttfStat.mtimeMs) {
        console.log(`  Пропуск (уже есть): ${relWoff2}`);
        skipped++;
        continue;
      }
    }

    try {
      const ttfBuffer = fs.readFileSync(ttfPath);
      const ttfSize = ttfBuffer.length;

      const woff2Buffer = await subsetFont(ttfBuffer, SUBSET_CHARS, {
        targetFormat: 'woff2',
      });

      fs.writeFileSync(woff2Path, woff2Buffer);
      const woff2Size = woff2Buffer.length;
      const ratio = ((1 - woff2Size / ttfSize) * 100).toFixed(1);

      console.log(
        `  ${relPath} → ${relWoff2}` +
          `  (${(ttfSize / 1024).toFixed(0)} KB → ${(woff2Size / 1024).toFixed(0)} KB, -${ratio}%)`
      );
      converted++;
    } catch (err) {
      console.error(`  Ошибка: ${relPath} — ${err.message}`);
    }
  }

  console.log(`\nГотово: конвертировано ${converted}, пропущено ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
