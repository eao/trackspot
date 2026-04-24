/** @type {import('vitest/config').UserConfig} */
module.exports = {
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    pool: 'threads',
  },
};
