import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { RefreshToken } from '../src/models/refresh-token.model.js';
import { User } from '../src/models/user.model.js';
import { registerAndLogin } from './helpers/auth.js';
import { testConfig } from './helpers/config.js';
import { useTestDatabase } from './helpers/db.js';

useTestDatabase();
const app = createApp(testConfig());

const cookieOf = (res) => res.headers['set-cookie'][0].split(';')[0];
const refresh = (cookie) => request(app).post('/api/auth/refresh').set('Cookie', cookie ?? '');

describe('refresh token rotation', () => {
  it('sets a locked-down cookie and stores only a hash', async () => {
    const res = await registerAndLogin(app);
    const header = res.headers['set-cookie'][0];
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/SameSite=Strict/);
    expect(header).toMatch(/Path=\/api\/auth/);

    const [stored] = await RefreshToken.find();
    expect(cookieOf(res)).not.toContain(stored.tokenHash);
  });

  it('marks the cookie Secure in production', async () => {
    const production = createApp(testConfig({ NODE_ENV: 'production' }));
    const res = await registerAndLogin(production);
    expect(res.headers['set-cookie'][0]).toMatch(/Secure/);
  });

  it('issues a new token on every refresh', async () => {
    const first = cookieOf(await registerAndLogin(app));
    const res = await refresh(first);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(cookieOf(res)).not.toBe(first);
    expect((await refresh(cookieOf(res))).status).toBe(200);
  });

  it('revokes the whole family when an old token is reused', async () => {
    const first = cookieOf(await registerAndLogin(app));
    const second = cookieOf(await refresh(first));

    expect((await refresh(first)).status).toBe(401);
    expect((await refresh(second)).status).toBe(401);
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);
  });

  it('leaves no usable token when two requests race', async () => {
    const first = cookieOf(await registerAndLogin(app));
    const results = await Promise.all([refresh(first), refresh(first)]);
    expect(results.filter((res) => res.status === 200).length).toBeLessThanOrEqual(1);
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);
  });

  it('keeps other logins alive when one family is revoked', async () => {
    const laptop = cookieOf(await registerAndLogin(app));
    const phone = cookieOf(await registerAndLogin(app));
    await refresh(laptop);
    await refresh(laptop);
    expect((await refresh(phone)).status).toBe(200);
  });

  it('rejects missing, unknown and expired tokens', async () => {
    const cookie = cookieOf(await registerAndLogin(app));
    expect((await refresh()).status).toBe(401);
    expect((await refresh('fp_refresh=made-up')).status).toBe(401);
    await RefreshToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await refresh(cookie)).status).toBe(401);
  });

  it('stops a disabled user from refreshing', async () => {
    const res = await registerAndLogin(app);
    await User.updateOne({ _id: res.body.user.id }, { disabled: true });
    expect((await refresh(cookieOf(res))).status).toBe(401);
  });

  it('revokes the session on logout', async () => {
    const cookie = cookieOf(await registerAndLogin(app));
    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie'][0]).toMatch(/fp_refresh=;/);
    expect((await refresh(cookie)).status).toBe(401);
  });
});
