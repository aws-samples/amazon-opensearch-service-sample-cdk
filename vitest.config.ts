import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['test/**/*.test.ts'],
    alias: {
      '.*default-values.json$': './test/default-values-test.json',
    },
  },
});
