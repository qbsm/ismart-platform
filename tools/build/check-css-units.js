#!/usr/bin/env node

/*
  Проверяет единицы измерения в CSS согласно conventions/css-naming.md на docs.ismart.pro §4:
    - Layout-свойства блоков (отступы, размеры, gap, радиусы и т.п.) → rem
    - Размеры текста (font-size)                                    → em

  Нарушения:
    - font-size в rem или px (должен быть em);
    - layout-свойство в em или px (должно быть rem).

  Исключения:
    - нулевые значения (0, 0px и т.п.);
    - проценты, безразмерные значения, var()/calc()/clamp() без литеральных px/em/rem;
    - корневой размер html/:root { font-size: 10px } — якорь шкалы 1rem = 10px;
    - якоря шкалы (TEXT_REM_ANCHORS) — font-size в rem разрешён.

  Запуск:
    node tools/build/check-css-units.js [путь] [--warn]

  Аргументы:
    путь     каталог с CSS (по умолчанию assets/css проекта). Можно указать
             каталог другого deployment'а, напр. ../tank-avilon/assets/css.

  Флаги:
    --warn   не падать (exit 0), только вывести отчёт.

  Сканирует <путь>/**, кроме сгенерированного подкаталога build/.
*/

const fs = require('fs');
const path = require('path');
const postcss = require('postcss');

const pathArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const CSS_ROOT = pathArg ? path.resolve(pathArg) : path.resolve(__dirname, '../../assets/css');

// Layout-свойства блоков → должны быть в rem (не em, не px).
// border-width и border-радиусы намеренно учитываем (конвенция §4),
// при этом shorthand `border: 1px solid` не проверяется (это свойство `border`).
const LAYOUT_PROPS = new Set([
  'width',
  'height',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'padding-block',
  'padding-inline',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'margin-block',
  'margin-inline',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'gap',
  'row-gap',
  'column-gap',
  'border-radius',
  'border-width',
  'flex-basis',
]);

// Текстовые свойства → должны быть в em (не rem, не px).
const TEXT_PROPS = new Set(['font-size']);

// Якоря шкалы (css-naming.md §4): font-size в rem разрешён, потому что элемент
// либо задаёт саму базу, либо связан с коробкой в rem. Список дублирован в конвенции.
const TEXT_REM_ANCHORS = [
  /^(html|:root)$/,
  /^(body|input|select|textarea)$/,
  /^\.button(?![a-z0-9])/i,
  /^\.form-callback(?![a-z0-9])/i,
];

// Ближайший селектор вверх по дереву: у декларации внутри вложенного @media
// родитель — сам at-rule, селектор лежит уровнем выше.
function nearestSelector(decl) {
  for (let node = decl.parent; node; node = node.parent) {
    if (node.type === 'rule' && node.selector) return node.selector;
  }
  return null;
}

function isRemAnchor(selector) {
  if (!selector) return false;
  return selector
    .split(',')
    .map((s) => s.trim())
    .every((s) => TEXT_REM_ANCHORS.some((re) => re.test(s)));
}

// Находит литеральные длины с единицами px/em/rem в значении.
// Игнорирует нулевые значения. Возвращает [{ value, unit }].
function findLengthTokens(value) {
  const tokens = [];
  const re = /(-?\d*\.?\d+)(px|rem|em)\b/gi;
  let m;
  while ((m = re.exec(value)) !== null) {
    const num = parseFloat(m[1]);
    if (num === 0) continue; // ноль безразмерен по сути
    tokens.push({ value: m[0], unit: m[2].toLowerCase() });
  }
  return tokens;
}

function isRootSelector(selector) {
  if (!selector) return false;
  return selector
    .split(',')
    .map((s) => s.trim())
    .some((s) => s === 'html' || s === ':root');
}

function listCssFiles(rootDir) {
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'build') continue; // сгенерированные бандлы
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.css')) {
        results.push(full);
      }
    }
  }
  walk(rootDir);
  return results;
}

function checkFile(filePath) {
  const css = fs.readFileSync(filePath, 'utf8');
  const root = postcss.parse(css, { from: filePath });
  const violations = [];

  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    if (prop.startsWith('--')) return; // custom properties — намерение неизвестно

    const isText = TEXT_PROPS.has(prop);
    const isLayout = LAYOUT_PROPS.has(prop);
    if (!isText && !isLayout) return;

    const tokens = findLengthTokens(decl.value);
    if (tokens.length === 0) return;

    const selector = nearestSelector(decl);
    const line = decl.source && decl.source.start ? decl.source.start.line : 0;

    for (const tok of tokens) {
      if (isText) {
        if (tok.unit === 'em') continue; // ок
        // Исключение: корневой якорь html/:root { font-size: 10px }
        if (tok.unit === 'px' && isRootSelector(selector)) continue;
        // Исключение: якоря шкалы (css-naming.md §4)
        if (tok.unit === 'rem' && isRemAnchor(selector)) continue;
        violations.push({
          line,
          selector,
          prop,
          value: decl.value,
          found: tok.unit,
          expected: 'em',
          kind: 'text',
        });
      } else {
        // layout
        if (tok.unit === 'rem') continue; // ок
        violations.push({
          line,
          selector,
          prop,
          value: decl.value,
          found: tok.unit,
          expected: 'rem',
          kind: 'layout',
        });
      }
    }
  });

  return violations;
}

function main() {
  const warnOnly = process.argv.includes('--warn');

  if (!fs.existsSync(CSS_ROOT)) {
    console.error(`Не найден каталог CSS: ${CSS_ROOT}`);
    process.exit(2);
  }

  const files = listCssFiles(CSS_ROOT);
  let totalViolations = 0;
  let filesWithViolations = 0;

  for (const file of files) {
    let violations;
    try {
      violations = checkFile(file);
    } catch (err) {
      console.error(`Ошибка разбора ${path.relative(process.cwd(), file)}: ${err.message}`);
      process.exit(2);
    }
    if (violations.length === 0) continue;

    filesWithViolations += 1;
    totalViolations += violations.length;
    console.log(`\n${path.relative(process.cwd(), file)}`);
    for (const v of violations) {
      const where = v.kind === 'text' ? 'текст' : 'блок';
      console.log(`  ${v.line}: [${where}] ${v.prop}: ${v.value} — найдено ${v.found}, ожидается ${v.expected}`);
    }
  }

  console.log(`\nПроверено файлов: ${files.length}. Нарушений: ${totalViolations} в ${filesWithViolations} файл(ах).`);

  if (totalViolations > 0 && !warnOnly) {
    console.log('\nПравило (css-naming.md §4): layout блоков → rem, font-size → em.');
    process.exit(1);
  }
}

main();
