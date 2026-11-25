import { describe, expect, it } from 'vitest';
import { createMockBillingProvider, SIGNATURE_HEADER } from '../src/providers/billing/mock.js';

const options = { webhookSecret: 'secret-one', appUrl: 'http://app.test' };
const provider = createMockBillingProvider(options);
const subscription = { providerSubId: 'mock_sub_1', plan: 'pro' };

describe('mock billing provider', () => {
  it('accepts a webhook it signed', () => {
    const { rawBody, headers } = provider.simulatePayment(subscription, 'success');
    expect(provider.parseWebhook(rawBody, headers)).toMatchObject({
      type: 'subscription.activated',
      providerSubId: 'mock_sub_1',
      plan: 'pro',
    });
  });

  it('rejects a tampered body', () => {
    const { rawBody, headers } = provider.simulatePayment(subscription, 'success');
    const tampered = Buffer.from(rawBody.toString().replace('"pro"', '"business"'));
    expect(() => provider.parseWebhook(tampered, headers)).toThrow(/signature/);
  });

  it('rejects a missing, short or foreign signature', () => {
    const { rawBody } = provider.simulatePayment(subscription, 'success');
    const other = createMockBillingProvider({ ...options, webhookSecret: 'secret-two' });
    const foreign = other.simulatePayment(subscription, 'success').headers;
    for (const headers of [{}, { [SIGNATURE_HEADER]: 'abc' }, foreign]) {
      expect(() => provider.parseWebhook(rawBody, headers)).toThrow(/signature/);
    }
  });

  it('builds a checkout link on the web app', async () => {
    const checkout = await provider.createSubscription({ plan: 'pro' });
    expect(checkout.checkoutUrl).toContain('http://app.test/billing/mock-checkout');
    expect(checkout.checkoutUrl).toContain(checkout.providerSubId);
  });
});
