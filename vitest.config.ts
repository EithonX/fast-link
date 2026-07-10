/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['app/**/*.test.ts', 'app/**/*.test.tsx'],
  },
});
