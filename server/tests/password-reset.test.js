import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { PasswordReset } from '../src/models/password-reset.model.js';
import { PASSWORD, registerAndLogin } from './helpers/auth.js';
import { testConfig } from './helpers/config.js';
import { useTestDatabase } from './helpers/db.js';

useTestDatabase();

const sent = [];
const emailProvider = { sendPasswordReset: async (message) => sent.push(message) };
const app = createApp(testConfig(), { emailProvider });

const email = 'owner@example.com';
const post = (path, body) => request(app).post(`/api/auth/${path}`).send(body);
const lastToken = () => new URL(sent.at(-1).resetUrl).searchParams.get('token');
const reset = (token, password = 'a-brand-new-password') =>
  post('reset-password', { token, password });

describe('password reset', () => {
  let session;

  beforeEach(async () => {
    sent.length = 0;
    session = await registerAndLogin(app, email);
  });

  it('answers the same way for known and unknown emails', async () => {
    const known = await post('forgot-password', { email });
    const unknown = await post('forgot-password', { email: 'ghost@example.com' });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect(sent).toHaveLength(1);
  });

  it('changes the password and ends existing sessions', async () => {
    await post('forgot-password', { email });
    expect((await reset(lastToken())).status).toBe(204);

    expect((await post('login', { email, password: PASSWORD })).status).toBe(401);
    expect((await post('login', { email, password: 'a-brand-new-password' })).status).toBe(200);

    const cookie = session.headers['set-cookie'][0].split(';')[0];
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  it('allows a token only once, even when used concurrently', async () => {
    await post('forgot-password', { email });
    const token = lastToken();
    const statuses = (await Promise.all([reset(token), reset(token)])).map((res) => res.status);
    expect(statuses.sort()).toEqual([204, 400]);
    expect((await reset(token)).status).toBe(400);
  });

  it('rejects an expired token', async () => {
    await post('forgot-password', { email });
    await PasswordReset.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await reset(lastToken())).status).toBe(400);
  });

  it('invalidates an older link when a new one is requested', async () => {
    await post('forgot-password', { email });
    const older = lastToken();
    await post('forgot-password', { email });
    expect((await reset(older)).status).toBe(400);
    expect((await reset(lastToken())).status).toBe(204);
  });

  it('stores only a hash of the token', async () => {
    await post('forgot-password', { email });
    const stored = await PasswordReset.findOne();
    expect(stored.tokenHash).not.toBe(lastToken());
  });
});
