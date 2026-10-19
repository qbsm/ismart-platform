const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['assets/js/build/**', 'assets/js/vendor/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['tools/**/*.js', 'webpack.config.js', 'postcss.config.js', 'tests/smoke/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    files: ['tools/ops/check-permissions.js', 'tools/ops/check-favicons.js'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 'latest',
      globals: { ...globals.node },
    },
  },
  {
    files: ['tests/js/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 'latest',
      globals: { ...globals.node },
    },
  },
  {
    files: ['assets/js/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        jQuery: 'readonly',
        $: 'readonly',
        Swiper: 'readonly',
        GLightbox: 'readonly',
        Inputmask: 'readonly',
        ym: 'readonly',
      },
    },
  },
  // Подключаются <script> напрямую, мимо webpack и Babel (templates/components/scripts.twig) —
  // синтаксис не новее ES2018, иначе в Chrome 61–79 / Safari 12 файл не разбирается целиком.
  {
    files: ['assets/js/utils/utm.js', 'assets/js/utils/web-vitals.js'],
    languageOptions: { sourceType: 'script', ecmaVersion: 2018 },
    rules: { 'no-unused-vars': ['error', { caughtErrors: 'none' }] },
  },
];
