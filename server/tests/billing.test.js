import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createMockBillingProvider } from '../src/providers/billing/mock.js';
import { bearer, registerAndLogin } from './helpers/auth.js';
import { testConfig } from './helpers/config.js';
import { useTestDatabase } from './helpers/db.js';

useTestDatabase();
const billingProvider = createMockBillingProvider({ webhookSecret: 's', appUrl: 'http://app.test' });
const app = createApp(testConfig(), { billingProvider });

describe('billing routes', () => {
  let token;

  beforeEach(async () => {
    token = (await registerAndLogin(app)).body.accessToken;
  });

  const get = (path, as = token) => request(app).get(`/api/billing/${path}`).set(bearer(as));
  const post = (path, body, as = token) =>
    request(app).post(`/api/billing/${path}`).set(bearer(as)).send(body);
  const checkout = (plan) => post('checkout', { plan });
  const complete = (subscriptionId, outcome = 'success', as = token) =>
    post('mock/complete', { subscriptionId, outcome }, as);

  it('lists the three plans without signing in', async () => {
    const res = await request(app).get('/api/billing/plans');
    expect(res.body.plans.map((plan) => plan.id)).toEqual(['free', 'pro', 'business']);
  });

  it('changes the plan only after payment is confirmed', async () => {
    const started = await checkout('pro');
    expect(started.status).toBe(201);
    expect((await get('subscription')).body.plan).toBe('free');

    const done = await complete(started.body.subscriptionId);
    expect(done.body).toMatchObject({ plan: 'pro', subscription: { status: 'active' } });
    expect((await checkout('pro')).status).toBe(409);
  });

  it('keeps the user on Free when payment fails', async () => {
    const { body } = await checkout('pro');
    const res = await complete(body.subscriptionId, 'failure');
    expect(res.body).toMatchObject({ plan: 'free', subscription: { status: 'failed' } });
  });

  it('upgrades from Pro to Business, then cancels to Free', async () => {
    await complete((await checkout('pro')).body.subscriptionId);
    const upgraded = await complete((await checkout('business')).body.subscriptionId);
    expect(upgraded.body.plan).toBe('business');

    const cancelled = await post('cancel');
    expect(cancelled.body).toMatchObject({ plan: 'free', subscription: { status: 'cancelled' } });
    expect((await post('cancel')).status).toBe(409);
  });

  it("does not let one user complete another user's checkout", async () => {
    const { body } = await checkout('pro');
    const other = (await registerAndLogin(app, 'other@example.com')).body.accessToken;
    expect((await complete(body.subscriptionId, 'success', other)).status).toBe(404);
  });

  it('rejects the free plan and unknown plans at checkout', async () => {
    expect((await checkout('free')).status).toBe(400);
    expect((await checkout('platinum')).status).toBe(400);
  });

  it('requires sign-in', async () => {
    expect((await request(app).get('/api/billing/subscription')).status).toBe(401);
    expect((await request(app).post('/api/billing/checkout')).status).toBe(401);
  });
});

describe('webhook endpoint', () => {
  const send = ({ rawBody, headers }) =>
    request(app)
      .post('/api/webhooks/billing')
      .set({ 'Content-Type': 'application/json', ...headers })
      .send(rawBody.toString('utf8'));

  it('verifies the signature over the raw body', async () => {
    const token = (await registerAndLogin(app)).body.accessToken;
    const { body } = await request(app)
      .post('/api/billing/checkout')
      .set(bearer(token))
      .send({ plan: 'pro' });
    const webhook = billingProvider.buildWebhook('subscription.activated', {
      providerSubId: body.subscriptionId,
      plan: 'pro',
    });

    expect((await send({ ...webhook, headers: {} })).status).toBe(400);
    expect((await send(webhook)).status).toBe(200);

    const me = await request(app).get('/api/auth/me').set(bearer(token));
    expect(me.body.user.plan).toBe('pro');
  });
});
