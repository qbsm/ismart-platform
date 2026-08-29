// Build critical CSS: PostCSS processing + minification → assets/css/build/critical.min.css
// Run: node tools/build/build-critical.js
// Called by: npm run build:critical (part of build pipeline)

const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const cssnano = require('cssnano');

const inputFile = path.resolve(__dirname, '../../assets/css/critical.css');
const outputDir = path.resolve(__dirname, '../../assets/css/build');
const outputFile = path.join(outputDir, 'critical.min.css');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function build() {
  const css = fs.readFileSync(inputFile, 'utf8');

  const result = await postcss([
    require('postcss-preset-env')({
      stage: 2,
      features: {
        'nesting-rules': true,
        'custom-properties': { preserve: true },
      },
    }),
    require('autoprefixer'),
    cssnano({
      preset: [
        'default',
        {
          discardComments: { removeAll: true },
          normalizeWhitespace: true,
        },
      ],
    }),
  ]).process(css, {
    from: inputFile,
    to: outputFile,
    map: false,
  });

  fs.writeFileSync(outputFile, result.css);

  const inputSize = Buffer.byteLength(css);
  const outputSize = Buffer.byteLength(result.css);
  console.log(
    `build:critical: ${(inputSize / 1024).toFixed(1)} KB → ${(outputSize / 1024).toFixed(1)} KB` +
      ` (-${((1 - outputSize / inputSize) * 100).toFixed(0)}%)`
  );
}

build().catch((err) => {
  console.error('build:critical error:', err);
  process.exit(1);
});
