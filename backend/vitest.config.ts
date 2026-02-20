import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Vitest 4: pool options are top-level
    sequence: {
      concurrent: false,
    },
  },
});
