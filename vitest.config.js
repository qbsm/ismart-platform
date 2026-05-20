/** @type {import('vitest').UserConfig} */
export default {
  test: {
    environment: 'node',
    include: ['tests/js/**/*.test.js'],
    globals: false,
  },
};
