import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { TEST_SECRET } from './helpers/config.js';

const base = { JWT_ACCESS_SECRET: TEST_SECRET };

describe('loadConfig', () => {
  it('uses defaults for optional values', () => {
    const config = loadConfig(base);
    expect(config.port).toBe(4000);
    expect(config.corsOrigins).toEqual(['http://localhost:3000']);
    expect(config.auth.accessTtlSeconds).toBe(900);
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ ...base, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('requires a long enough JWT secret', () => {
    expect(() => loadConfig({})).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => loadConfig({ JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });
});
