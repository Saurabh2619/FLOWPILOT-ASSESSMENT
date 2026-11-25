import { loadConfig } from '../../src/config/env.js';

export const TEST_SECRET = 'test-only-secret-that-is-long-enough-123456';

export function testConfig(overrides = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: TEST_SECRET,
    AUTH_RATE_LIMIT: '1000',
    ...overrides,
  });
}
