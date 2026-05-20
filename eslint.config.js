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
];
