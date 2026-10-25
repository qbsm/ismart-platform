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
    // API, которых нет в Chrome 61 / Safari 12 (browserslist): Babel их не заменяет, а core-js не
    // подключаем. Падение такого вызова в форме — потерянная заявка.
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'AbortController', message: 'Нет до Chrome 66 / Safari 12.1 — createAbortController() из form-callback/abort.js' },
      ],
      'no-restricted-properties': [
        'error',
        { property: 'replaceAll', message: 'Нет до Chrome 85 / Safari 13.1 — replace(/…/g, …)' },
        { object: 'Object', property: 'fromEntries', message: 'Нет до Chrome 73 / Safari 12.1' },
        { property: 'flat', message: 'Нет до Chrome 69' },
        { property: 'flatMap', message: 'Нет до Chrome 69' },
        { object: 'Promise', property: 'allSettled', message: 'Нет до Chrome 76 / Safari 13' },
        { object: 'window', property: 'structuredClone', message: 'Нет до Chrome 98' },
      ],
    },
  },
  {
    files: ['assets/js/components/form-callback/abort.js'],
    rules: { 'no-restricted-globals': 'off' },
  },
  // Подключаются <script> напрямую, мимо webpack и Babel (templates/components/scripts.twig) —
  // синтаксис не новее ES2018, иначе в Chrome 61–79 / Safari 12 файл не разбирается целиком.
  {
    files: ['assets/js/utils/utm.js', 'assets/js/utils/web-vitals.js'],
    languageOptions: { sourceType: 'script', ecmaVersion: 2018 },
    rules: { 'no-unused-vars': ['error', { caughtErrors: 'none' }] },
  },
];
