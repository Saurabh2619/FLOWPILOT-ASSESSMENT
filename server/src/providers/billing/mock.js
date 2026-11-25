import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpError } from '../../lib/errors.js';

export const SIGNATURE_HEADER = 'x-mock-signature';
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export function createMockBillingProvider({ webhookSecret, appUrl }) {
  const sign = (rawBody) => createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

  function buildWebhook(type, subscription, extra = {}) {
    const rawBody = Buffer.from(
      JSON.stringify({
        id: `evt_${randomUUID()}`,
        type,
        providerSubId: subscription.providerSubId,
        plan: subscription.plan,
        occurredAt: new Date().toISOString(),
        ...extra,
      }),
    );
    return { rawBody, headers: { [SIGNATURE_HEADER]: sign(rawBody) } };
  }

  return {
    name: 'mock',

    async createSubscription() {
      const providerSubId = `mock_sub_${randomUUID()}`;
      const checkoutUrl = new URL('/billing/mock-checkout', appUrl);
      checkoutUrl.searchParams.set('subscription', providerSubId);
      return { providerSubId, checkoutUrl: checkoutUrl.toString() };
    },

    async cancelSubscription(subscription) {
      return { webhook: buildWebhook('subscription.cancelled', subscription) };
    },

    parseWebhook(rawBody, headers) {
      const received = Buffer.from(String(headers[SIGNATURE_HEADER] ?? ''));
      const expected = Buffer.from(sign(rawBody));
      if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
        throw new HttpError(400, 'Invalid webhook signature');
      }
      return JSON.parse(rawBody.toString('utf8'));
    },

    simulatePayment(subscription, outcome) {
      if (outcome === 'failure') return buildWebhook('payment.failed', subscription);
      const currentPeriodEnd = new Date(Date.now() + PERIOD_MS).toISOString();
      return buildWebhook('subscription.activated', subscription, { currentPeriodEnd });
    },

    buildWebhook,
  };
}
