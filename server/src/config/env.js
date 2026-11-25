import { randomBytes } from 'node:crypto';

const DEFAULT_PORT = 4000;
const MIN_SECRET_LENGTH = 32;

function readInteger(source, name, fallback, { min, max }) {
  const value = Number(source[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}, got "${source[name]}"`);
  }
  return value;
}

function readSecret(source, name) {
  const value = source[name];
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must be set to at least ${MIN_SECRET_LENGTH} characters`);
  }
  return value;
}

export function loadConfig(source = process.env) {
  const corsOrigins = (source.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    nodeEnv: source.NODE_ENV ?? 'development',
    port: readInteger(source, 'PORT', DEFAULT_PORT, { min: 1, max: 65535 }),
    corsOrigins,
    appUrl: source.APP_URL ?? 'http://localhost:3000',
    mongoUri: source.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/flowpilot',
    trustProxy: readInteger(source, 'TRUST_PROXY', 0, { min: 0, max: 10 }),
    billing: {
      // The mock signs and verifies in this process, so a random secret works.
      webhookSecret: source.BILLING_WEBHOOK_SECRET || randomBytes(32).toString('hex'),
    },
    auth: {
      accessSecret: readSecret(source, 'JWT_ACCESS_SECRET'),
      accessTtlSeconds: readInteger(source, 'ACCESS_TOKEN_TTL_SECONDS', 900, { min: 60, max: 3600 }),
      refreshTtlDays: readInteger(source, 'REFRESH_TOKEN_TTL_DAYS', 7, { min: 1, max: 90 }),
      resetTtlMinutes: readInteger(source, 'RESET_TOKEN_TTL_MINUTES', 30, { min: 5, max: 1440 }),
      rateLimitMax: readInteger(source, 'AUTH_RATE_LIMIT', 20, { min: 1, max: 100000 }),
    },
  };
}
