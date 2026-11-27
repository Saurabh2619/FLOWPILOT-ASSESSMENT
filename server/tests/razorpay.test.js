import { createHmac } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { Subscription } from '../src/models/subscription.model.js';
import { User } from '../src/models/user.model.js';
import { createBillingProvider } from '../src/providers/billing/index.js';
import { createRazorpayProvider } from '../src/providers/billing/razorpay.js';
import { bearer, registerAndLogin } from './helpers/auth.js';
import { testConfig } from './helpers/config.js';
import { useTestDatabase } from './helpers/db.js';

useTestDatabase();

const settings = {
  RAZORPAY_KEY_ID: 'rzp_test_key',
  RAZORPAY_KEY_SECRET: 'key-secret',
  RAZORPAY_WEBHOOK_SECRET: 'hook-secret',
  RAZORPAY_PLAN_PRO: 'plan_pro',
  RAZORPAY_PLAN_BUSINESS: 'plan_business',
};

const reply = (status, body) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

const build = (fetchImpl) =>
  createRazorpayProvider({ ...testConfig(settings).billing.razorpay, fetchImpl });

function signed(event, entity = {}, eventId = 'evt_1') {
  const rawBody = Buffer.from(
    JSON.stringify({
      event,
      created_at: 1_800_000_000,
      payload: { subscription: { entity: { id: 'sub_1', plan_id: 'plan_pro', ...entity } } },
    }),
  );
  const signature = createHmac('sha256', 'hook-secret').update(rawBody).digest('hex');
  return {
    rawBody,
    headers: { 'x-razorpay-signature': signature, 'x-razorpay-event-id': eventId },
  };
}

describe('razorpay settings', () => {
  it('uses the mock provider when no keys are set', () => {
    expect(createBillingProvider(testConfig()).name).toBe('mock');
  });

  it('uses Razorpay when every setting is present', () => {
    expect(createBillingProvider(testConfig(settings)).name).toBe('razorpay');
  });

  it('refuses a partial setup', () => {
    expect(() => testConfig({ RAZORPAY_KEY_ID: 'rzp_test_key' })).toThrow(/RAZORPAY_KEY_SECRET/);
  });
});

describe('razorpay provider', () => {
  it('creates a subscription and returns the hosted checkout link', async () => {
    const fetchImpl = reply(200, { id: 'sub_1', short_url: 'https://rzp.io/i/abc' });
    const result = await build(fetchImpl).createSubscription({ userId: 'u1', plan: 'pro' });

    expect(result).toEqual({ providerSubId: 'sub_1', checkoutUrl: 'https://rzp.io/i/abc' });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.razorpay.com/v1/subscriptions');
    expect(options.headers.Authorization).toBe(
      `Basic ${Buffer.from('rzp_test_key:key-secret').toString('base64')}`,
    );
    expect(JSON.parse(options.body)).toMatchObject({ plan_id: 'plan_pro', total_count: 120 });
  });

  it('reports a refused request as a gateway error', async () => {
    const provider = build(reply(400, { error: { description: 'Bad plan' } }));
    await expect(provider.createSubscription({ userId: 'u1', plan: 'pro' })).rejects.toMatchObject({
      status: 502,
    });
  });

  it('cancels immediately', async () => {
    const fetchImpl = reply(200, { id: 'sub_1', status: 'cancelled' });
    await build(fetchImpl).cancelSubscription({ providerSubId: 'sub_1' });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.razorpay.com/v1/subscriptions/sub_1/cancel');
    expect(JSON.parse(options.body)).toEqual({ cancel_at_cycle_end: false });
  });

  it('treats an already cancelled subscription as done', async () => {
    const description = 'Subscription is not cancellable in cancelled status.';
    const provider = build(reply(400, { error: { description } }));
    await expect(provider.cancelSubscription({ providerSubId: 'sub_1' })).resolves.toEqual({});
  });

  it('translates a signed webhook', () => {
    const { rawBody, headers } = signed('subscription.charged', { current_end: 1_802_000_000 });
    expect(build().parseWebhook(rawBody, headers)).toEqual({
      id: 'evt_1',
      type: 'subscription.activated',
      providerSubId: 'sub_1',
      plan: 'pro',
      currentPeriodEnd: new Date(1_802_000_000 * 1000),
      occurredAt: new Date(1_800_000_000 * 1000),
    });
  });

  it('rejects a wrong signature', () => {
    const { rawBody, headers } = signed('subscription.activated');
    const forged = { ...headers, 'x-razorpay-signature': 'a'.repeat(64) };
    expect(() => build().parseWebhook(rawBody, forged)).toThrow(/signature/);
  });
});

describe('razorpay webhook endpoint', () => {
  const app = createApp(testConfig(settings));
  const deliver = ({ rawBody, headers }) =>
    request(app)
      .post('/api/webhooks/billing')
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(rawBody.toString('utf8'));

  async function pendingSubscription() {
    await registerAndLogin(app);
    const user = await User.findOne({ email: 'owner@example.com' });
    await Subscription.create({
      userId: user._id,
      provider: 'razorpay',
      providerSubId: 'sub_1',
      plan: 'pro',
    });
    return user;
  }

  it('upgrades the user after a verified activation', async () => {
    const user = await pendingSubscription();
    await deliver(signed('subscription.activated')).expect(200);
    expect((await User.findById(user._id)).plan).toBe('pro');
  });

  it('acknowledges events it does not use', async () => {
    const user = await pendingSubscription();
    await deliver(signed('subscription.authenticated')).expect(200);
    expect((await User.findById(user._id)).plan).toBe('free');
  });

  it('does not offer the mock payment route', async () => {
    const login = await registerAndLogin(app);
    await request(app)
      .post('/api/billing/mock/complete')
      .set(bearer(login.body.accessToken))
      .send({ subscriptionId: 'sub_1', outcome: 'success' })
      .expect(404);
  });
});
