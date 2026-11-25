import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Password hashing is deliberately slow, and slower when files run in parallel.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
