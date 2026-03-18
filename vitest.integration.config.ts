import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
        minThreads: 1,
        maxThreads: 1,
      },
    },
    isolate: true,
    watch: false,
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
    slowTestThreshold: 500,
    include: ['src/tests/**/*.integration.ts'],
    exclude: ['node_modules', 'dist'],
    cache: {
      dir: 'node_modules/.vitest',
    },
  },
});
