import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from '../../lib/errors.js';

export const SIGNATURE_HEADER = 'x-razorpay-signature';
export const EVENT_ID_HEADER = 'x-razorpay-event-id';
const API_URL = 'https://api.razorpay.com/v1';
const BILLING_CYCLES = 120;
const ALREADY_ENDED = /not cancellable in (cancelled|completed|expired) status/i;

const EVENT_TYPES = {
  'subscription.activated': 'subscription.activated',
  'subscription.charged': 'subscription.activated',
  'subscription.resumed': 'subscription.activated',
  'subscription.updated': 'subscription.updated',
  'subscription.pending': 'payment.failed',
  'subscription.halted': 'payment.failed',
  'subscription.cancelled': 'subscription.cancelled',
  'subscription.completed': 'subscription.cancelled',
};

const toDate = (seconds) => (seconds ? new Date(seconds * 1000) : undefined);

export function createRazorpayProvider({
  keyId,
  keySecret,
  webhookSecret,
  planIds,
  fetchImpl = fetch,
  timeoutMs = 10000,
}) {
  const authorization = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
  const planByRazorpayId = new Map(Object.entries(planIds).map(([plan, id]) => [id, plan]));

  async function call(path, body) {
    let response;
    try {
      response = await fetchImpl(`${API_URL}${path}`, {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new HttpError(502, `Razorpay request failed: ${error.message}`);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = data.error?.description ?? `status ${response.status}`;
      throw new HttpError(502, `Razorpay request failed: ${reason}`);
    }
    return data;
  }

  function verify(rawBody, signature) {
    const received = Buffer.from(String(signature ?? ''));
    const expected = Buffer.from(createHmac('sha256', webhookSecret).update(rawBody).digest('hex'));
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      throw new HttpError(400, 'Invalid webhook signature');
    }
  }

  return {
    name: 'razorpay',

    async createSubscription({ userId, plan }) {
      const subscription = await call('/subscriptions', {
        plan_id: planIds[plan],
        total_count: BILLING_CYCLES,
        notes: { userId, plan },
      });
      return { providerSubId: subscription.id, checkoutUrl: subscription.short_url };
    },

    async cancelSubscription({ providerSubId }) {
      try {
        await call(`/subscriptions/${encodeURIComponent(providerSubId)}/cancel`, {
          cancel_at_cycle_end: false,
        });
      } catch (error) {
        if (!ALREADY_ENDED.test(error.message)) throw error;
      }
      return {};
    },

    parseWebhook(rawBody, headers) {
      verify(rawBody, headers[SIGNATURE_HEADER]);
      const body = JSON.parse(rawBody.toString('utf8'));
      if (!Object.hasOwn(EVENT_TYPES, body.event)) return null;

      const entity = body.payload?.subscription?.entity ?? {};
      return {
        id: headers[EVENT_ID_HEADER],
        type: EVENT_TYPES[body.event],
        providerSubId: entity.id,
        plan: planByRazorpayId.get(entity.plan_id),
        currentPeriodEnd: toDate(entity.current_end),
        occurredAt: toDate(body.created_at),
      };
    },
  };
}
