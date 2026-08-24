import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [],
    testTimeout: 60000,
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@leetcode-app/database': resolve(__dirname, '../../packages/database/src'),
      '@leetcode-app/domain': resolve(__dirname, '../../packages/domain/src'),
    },
  },
});
