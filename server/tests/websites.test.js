import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { Website } from '../src/models/website.model.js';
import { bearer, registerAndLogin } from './helpers/auth.js';
import { testConfig } from './helpers/config.js';
import { useTestDatabase } from './helpers/db.js';
import { useLocalSite } from './helpers/site.js';

useTestDatabase();
const site = useLocalSite({
  '/': { body: 'home' },
  '/a': { body: 'a' },
  '/b': { body: 'b' },
  '/private': { status: 403 },
  '/gone': { status: 404 },
  '/broken': { status: 500 },
});

describe('websites', () => {
  let app;
  let token;
  let userId;

  beforeEach(async () => {
    app = createApp(testConfig(), { fetcher: site.createFetcher() });
    const { body } = await registerAndLogin(app);
    token = body.accessToken;
    userId = body.user.id;
    site.hits.length = 0;
  });

  const setPlan = (plan) => User.updateOne({ _id: userId }, { plan });
  const add = (path, extra = {}, as = token) =>
    request(app)
      .post('/api/websites')
      .set(bearer(as))
      .send({ url: `${site.origin}${path}`, ...extra });
  const patch = (id, body, as = token) =>
    request(app).patch(`/api/websites/${id}`).set(bearer(as)).send(body);

  it('saves a reachable website and queues its first audit', async () => {
    const res = await add('/');
    expect(res.status).toBe(201);
    expect(res.body.website).toMatchObject({ schedule: 'daily', active: true });
    expect(new Date(res.body.website.nextRunAt).getTime()).toBeLessThanOrEqual(Date.now());
    expect(site.hits).toEqual(['/']);
  });

  it('accepts a site that blocks bots but rejects missing or failing pages', async () => {
    await setPlan('pro');
    expect((await add('/private')).status).toBe(201);
    expect((await add('/gone')).status).toBe(422);
    expect((await add('/broken')).status).toBe(422);
    expect(await Website.countDocuments()).toBe(1);
  });

  it('explains why a private or malformed address is refused', async () => {
    const real = createApp(testConfig());
    const send = (url) =>
      request(real).post('/api/websites').set(bearer(token)).send({ url });

    const metadata = await send('http://169.254.169.254/latest/meta-data');
    expect(metadata.status).toBe(422);
    expect(metadata.body.error.details.code).toBe('blocked_address');
    expect((await send('http://localhost')).status).toBe(422);
    expect((await send('ftp://example.com')).status).toBe(422);
    expect(await Website.countDocuments()).toBe(0);
  });

  it('enforces the Free website and schedule limits without making requests', async () => {
    expect((await add('/', { schedule: 'hourly' })).status).toBe(403);
    expect(site.hits).toEqual([]);

    expect((await add('/')).status).toBe(201);
    expect((await add('/a')).status).toBe(403);
    expect(site.hits).toEqual(['/']);
  });

  it('never exceeds the limit when adds run in parallel', async () => {
    await Promise.all([add('/'), add('/a'), add('/b')]);
    expect(await Website.countDocuments()).toBeLessThanOrEqual(1);
  });

  it('rejects a duplicate', async () => {
    await setPlan('pro');
    await add('/');
    expect((await add('/')).status).toBe(409);
  });

  it('changes the schedule only within the plan', async () => {
    const { id } = (await add('/')).body.website;
    expect((await patch(id, { schedule: 'hourly' })).status).toBe(403);

    await setPlan('pro');
    expect((await patch(id, { schedule: 'hourly' })).body.website.schedule).toBe('hourly');
    expect((await patch(id, { schedule: '15m' })).status).toBe(403);
    expect((await patch(id, {})).status).toBe(400);
  });

  it('will not resume more sites than the plan allows', async () => {
    await setPlan('pro');
    const first = (await add('/')).body.website;
    const second = (await add('/a')).body.website;
    await patch(second.id, { active: false });
    await setPlan('free');

    expect((await patch(second.id, { active: true })).status).toBe(403);
    await patch(first.id, { active: false });
    expect((await patch(second.id, { active: true })).body.website.active).toBe(true);
  });

  it("hides and protects another user's website", async () => {
    const { id } = (await add('/')).body.website;
    const other = (await registerAndLogin(app, 'other@example.com')).body.accessToken;
    const asOther = bearer(other);

    expect((await request(app).get(`/api/websites/${id}`).set(asOther)).status).toBe(404);
    expect((await patch(id, { active: false }, other)).status).toBe(404);
    expect((await request(app).delete(`/api/websites/${id}`).set(asOther)).status).toBe(404);
    expect((await request(app).get('/api/websites').set(asOther)).body.websites).toEqual([]);
  });

  it('lists and deletes websites', async () => {
    const { id } = (await add('/')).body.website;
    const list = await request(app).get('/api/websites').set(bearer(token));
    expect(list.body.websites).toHaveLength(1);
    expect((await request(app).delete(`/api/websites/${id}`).set(bearer(token))).status).toBe(204);
    expect(await Website.countDocuments()).toBe(0);
  });

  it('requires sign-in', async () => {
    expect((await request(app).get('/api/websites')).status).toBe(401);
  });
});
