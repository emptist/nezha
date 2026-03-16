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
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
    slowTestThreshold: 300,
    include: ['src/tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    cache: {
      dir: 'node_modules/.vitest',
    },
    sequence: {
      shuffle: false,
      concurrent: false,
    },
    maxConcurrency: 1,
    retry: 0,
    bail: 0,
  },
});
