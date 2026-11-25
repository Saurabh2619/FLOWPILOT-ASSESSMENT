import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { testConfig } from './helpers/config.js';
import { useTestDatabase } from './helpers/db.js';

useTestDatabase();
const app = createApp(testConfig());
const credentials = { email: 'owner@example.com', password: 'correct-horse-1' };
const signup = (body) => request(app).post('/api/auth/signup').send(body);

describe('POST /api/auth/signup', () => {
  it('creates a user with a hashed password', async () => {
    const res = await signup(credentials);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: credentials.email, role: 'user', plan: 'free' });
    expect(res.body.user.passwordHash).toBeUndefined();

    const stored = await User.findOne({ email: credentials.email });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored.passwordHash).not.toContain(credentials.password);
  });

  it('ignores role and plan sent by the client', async () => {
    const res = await signup({ ...credentials, role: 'admin', plan: 'business' });
    expect(res.body.user).toMatchObject({ role: 'user', plan: 'free' });
  });

  it('rejects a duplicate email regardless of case', async () => {
    await signup(credentials);
    const res = await signup({ ...credentials, email: 'OWNER@example.com' });
    expect(res.status).toBe(409);
  });

  it('rejects weak or malformed input', async () => {
    const res = await signup({ email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toEqual(['email', 'password']);
  });

  it('rejects a query object instead of an email', async () => {
    const res = await signup({ email: { $ne: null }, password: 'correct-horse-1' });
    expect(res.status).toBe(400);
  });

  it('rate limits repeated attempts', async () => {
    const limited = createApp(testConfig({ AUTH_RATE_LIMIT: '2' }));
    const attempt = () => request(limited).post('/api/auth/signup').send({});
    await attempt();
    await attempt();
    expect((await attempt()).status).toBe(429);
  });
});
