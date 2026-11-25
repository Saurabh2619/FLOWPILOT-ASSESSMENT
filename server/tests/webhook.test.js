import { beforeEach, describe, expect, it } from 'vitest';
import { Subscription } from '../src/models/subscription.model.js';
import { User } from '../src/models/user.model.js';
import { WebhookEvent } from '../src/models/webhook-event.model.js';
import { Website } from '../src/models/website.model.js';
import { createMockBillingProvider } from '../src/providers/billing/mock.js';
import { handleWebhook } from '../src/services/webhook.service.js';
import { useTestDatabase } from './helpers/db.js';

useTestDatabase();
const provider = createMockBillingProvider({ webhookSecret: 's', appUrl: 'http://app.test' });

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000).toISOString();

describe('billing webhooks', () => {
  let user;
  let pro;

  const createSubscription = (providerSubId, plan, fields = {}) =>
    Subscription.create({ userId: user._id, provider: 'mock', providerSubId, plan, ...fields });
  const deliver = (type, subscription, extra) =>
    handleWebhook(provider.buildWebhook(type, subscription, extra), provider);
  const planOf = async () => (await User.findById(user._id)).plan;
  const statusOf = async (subscription) => (await Subscription.findById(subscription._id)).status;

  beforeEach(async () => {
    user = await User.create({ email: 'owner@example.com', passwordHash: 'x' });
    pro = await createSubscription('sub_pro', 'pro');
  });

  it('upgrades the user when payment succeeds', async () => {
    await deliver('subscription.activated', pro);
    expect(await planOf()).toBe('pro');
    expect(await statusOf(pro)).toBe('active');
  });

  it('rejects an unsigned event and changes nothing', async () => {
    const { rawBody } = provider.buildWebhook('subscription.activated', pro);
    await expect(handleWebhook({ rawBody, headers: {} }, provider)).rejects.toMatchObject({
      status: 400,
    });
    expect(await planOf()).toBe('free');
    expect(await WebhookEvent.countDocuments()).toBe(0);
  });

  it('applies a repeated delivery only once', async () => {
    const webhook = provider.buildWebhook('subscription.activated', pro);
    await handleWebhook(webhook, provider);
    await expect(handleWebhook(webhook, provider)).resolves.toEqual({ duplicate: true });
    expect(await WebhookEvent.countDocuments()).toBe(1);
  });

  it('copes with the same event arriving twice at once', async () => {
    const webhook = provider.buildWebhook('subscription.activated', pro);
    await Promise.all([handleWebhook(webhook, provider), handleWebhook(webhook, provider)]);
    expect(await planOf()).toBe('pro');
    expect(await WebhookEvent.countDocuments()).toBe(1);
  });

  it('retries an event that was recorded but not finished', async () => {
    const webhook = provider.buildWebhook('subscription.activated', pro);
    await handleWebhook(webhook, provider);
    await WebhookEvent.updateMany({}, { processedAt: null });
    await User.updateOne({ _id: user._id }, { plan: 'free' });

    await handleWebhook(webhook, provider);
    expect(await planOf()).toBe('pro');
  });

  it('ignores an event older than the last applied one', async () => {
    await deliver('subscription.updated', pro, { plan: 'business', occurredAt: minutesAgo(1) });
    await deliver('payment.failed', pro, { occurredAt: minutesAgo(10) });
    expect(await statusOf(pro)).toBe('active');
    expect(await planOf()).toBe('business');
  });

  it('never revives a cancelled subscription', async () => {
    await deliver('subscription.cancelled', pro, { occurredAt: minutesAgo(1) });
    await deliver('subscription.activated', pro, { occurredAt: minutesAgo(0) });
    expect(await statusOf(pro)).toBe('cancelled');
    expect(await planOf()).toBe('free');
  });

  it('keeps access after a failed renewal', async () => {
    await deliver('subscription.activated', pro, { occurredAt: minutesAgo(5) });
    await deliver('payment.failed', pro);
    expect(await statusOf(pro)).toBe('past_due');
    expect(await planOf()).toBe('pro');
  });

  it('grants nothing after a failed first payment', async () => {
    await deliver('payment.failed', pro);
    expect(await statusOf(pro)).toBe('failed');
    expect(await planOf()).toBe('free');
  });

  it('downgrades and pauses extra sites on cancellation', async () => {
    await deliver('subscription.activated', pro, { occurredAt: minutesAgo(5) });
    await Website.create([
      { userId: user._id, url: 'https://one.example.com', schedule: 'hourly' },
      { userId: user._id, url: 'https://two.example.com', schedule: 'hourly' },
    ]);

    await deliver('subscription.cancelled', pro);

    expect(await planOf()).toBe('free');
    expect(await Website.countDocuments({ active: true })).toBe(1);
    expect(await Website.countDocuments({ schedule: 'daily' })).toBe(2);
  });

  it('replaces an older subscription when a newer one is activated', async () => {
    await deliver('subscription.activated', pro);
    const business = await createSubscription('sub_business', 'business');
    await deliver('subscription.activated', business);

    expect(await planOf()).toBe('business');
    expect(await statusOf(pro)).toBe('cancelled');
  });

  it('asks the provider to retry an unknown subscription', async () => {
    const unknown = { providerSubId: 'sub_missing', plan: 'pro' };
    await expect(deliver('subscription.activated', unknown)).rejects.toMatchObject({
      status: 409,
    });
    expect((await WebhookEvent.findOne()).processedAt).toBeNull();
  });
});
