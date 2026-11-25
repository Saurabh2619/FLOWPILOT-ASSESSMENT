import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ensureAdmin } from '../src/services/admin-seed.service.js';
import { bearer, PASSWORD, registerAndLogin } from './helpers/auth.js';
import { testConfig } from './helpers/config.js';
import { useTestDatabase } from './helpers/db.js';

useTestDatabase();
const app = createApp(testConfig());

describe('admin routes', () => {
  let admin;
  let member;

  beforeEach(async () => {
    await ensureAdmin({ email: 'admin@example.com', password: PASSWORD });
    admin = (await registerAndLogin(app, 'admin@example.com')).body;
    member = await registerAndLogin(app, 'member@example.com');
  });

  const list = (token) => request(app).get('/api/admin/users').set(bearer(token));
  const setDisabled = (id, disabled, token = admin.accessToken) =>
    request(app).patch(`/api/admin/users/${id}`).set(bearer(token)).send({ disabled });

  it('lets an admin list users without password hashes', async () => {
    const res = await list(admin.accessToken);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(JSON.stringify(res.body)).not.toContain('argon2');
  });

  it('refuses normal users and anonymous requests', async () => {
    const { accessToken, user } = member.body;
    expect((await list(accessToken)).status).toBe(403);
    expect((await setDisabled(admin.user.id, true, accessToken)).status).toBe(403);
    expect((await setDisabled(user.id, false, accessToken)).status).toBe(403);
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
  });

  it('disables an account and ends its sessions, then re-enables it', async () => {
    const { user, accessToken } = member.body;
    expect((await setDisabled(user.id, true)).body.user.disabled).toBe(true);

    const cookie = member.headers['set-cookie'][0].split(';')[0];
    const me = await request(app).get('/api/auth/me').set(bearer(accessToken));
    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(me.status).toBe(403);
    expect(refresh.status).toBe(401);

    await setDisabled(user.id, false);
    expect((await registerAndLogin(app, 'member@example.com')).status).toBe(200);
  });

  it('stops an admin disabling their own account', async () => {
    expect((await setDisabled(admin.user.id, true)).status).toBe(400);
  });

  it('returns 404 for unknown or malformed ids', async () => {
    expect((await setDisabled('not-an-id', true)).status).toBe(404);
    expect((await setDisabled('0123456789abcdef01234567', true)).status).toBe(404);
  });

  it('promotes an existing account without changing its password', async () => {
    const result = await ensureAdmin({ email: 'member@example.com', password: 'different-pass-9' });
    expect(result.created).toBe(false);
    const res = await registerAndLogin(app, 'member@example.com');
    expect(res.body.user.role).toBe('admin');
  });
});
