import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { bearer, PASSWORD, registerAndLogin } from './helpers/auth.js';
import { TEST_SECRET, testConfig } from './helpers/config.js';
import { useTestDatabase } from './helpers/db.js';

useTestDatabase();
const app = createApp(testConfig());
const me = (token) => request(app).get('/api/auth/me').set(bearer(token));

describe('login and protected routes', () => {
  it('returns an access token that works on /me', async () => {
    const res = await registerAndLogin(app);
    expect(res.status).toBe(200);
    const profile = await me(res.body.accessToken);
    expect(profile.body.user.email).toBe('owner@example.com');
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    await registerAndLogin(app);
    const login = (body) => request(app).post('/api/auth/login').send(body);
    const wrong = await login({ email: 'owner@example.com', password: 'wrong-password' });
    const unknown = await login({ email: 'ghost@example.com', password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('rejects missing, forged and expired tokens', async () => {
    const { body } = await registerAndLogin(app);
    const forged = jwt.sign({}, 'another-secret-another-secret-123456', { subject: body.user.id });
    const expired = jwt.sign({ exp: 1 }, TEST_SECRET, { subject: body.user.id });
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await me(forged)).status).toBe(401);
    expect((await me(expired)).status).toBe(401);
  });

  it('blocks a disabled user at login and with an existing token', async () => {
    const { body } = await registerAndLogin(app);
    await User.updateOne({ _id: body.user.id }, { disabled: true });
    expect((await me(body.accessToken)).status).toBe(403);
    const again = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@example.com', password: PASSWORD });
    expect(again.status).toBe(403);
  });
});
