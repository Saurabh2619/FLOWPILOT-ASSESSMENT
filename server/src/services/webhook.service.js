import { z } from 'zod';
import { PAID_PLAN_NAMES } from '../config/plans.js';
import { HttpError } from '../lib/errors.js';
import { Subscription } from '../models/subscription.model.js';
import { WebhookEvent } from '../models/webhook-event.model.js';
import { syncUserPlan } from './plan-sync.service.js';

const DUPLICATE_KEY = 11000;

const eventSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'subscription.activated',
    'subscription.updated',
    'subscription.cancelled',
    'payment.failed',
  ]),
  providerSubId: z.string().min(1),
  plan: z.enum(PAID_PLAN_NAMES).optional(),
  currentPeriodEnd: z.coerce.date().optional(),
  occurredAt: z.coerce.date(),
});

async function recordEvent(provider, event) {
  const key = { provider, eventId: event.id };
  try {
    return await WebhookEvent.findOneAndUpdate(
      key,
      { $setOnInsert: { type: event.type } },
      { upsert: true, returnDocument: 'after' },
    );
  } catch (error) {
    if (error.code === DUPLICATE_KEY) return WebhookEvent.findOne(key);
    throw error;
  }
}

async function applyEvent(subscription, event) {
  const { type, occurredAt, plan, currentPeriodEnd } = event;
  const byId = { _id: subscription._id };

  if (type === 'subscription.cancelled') {
    await Subscription.updateOne(byId, { status: 'cancelled', $max: { lastEventAt: occurredAt } });
    return;
  }

  const fresh = {
    ...byId,
    status: { $ne: 'cancelled' },
    $or: [{ lastEventAt: null }, { lastEventAt: { $lte: occurredAt } }],
  };

  if (type === 'payment.failed') {
    await Subscription.updateOne(
      { ...fresh, status: { $in: ['active', 'past_due'] } },
      { status: 'past_due', lastEventAt: occurredAt },
    );
    await Subscription.updateOne(
      { ...fresh, status: { $in: ['pending', 'failed'] } },
      { status: 'failed', lastEventAt: occurredAt },
    );
    return;
  }

  await Subscription.updateOne(fresh, {
    status: 'active',
    lastEventAt: occurredAt,
    ...(plan && { plan }),
    ...(currentPeriodEnd && { currentPeriodEnd }),
  });
}

export async function handleWebhook({ rawBody, headers }, billingProvider) {
  const received = billingProvider.parseWebhook(rawBody, headers);
  if (received === null) return { ignored: true };
  const parsed = eventSchema.safeParse(received);
  if (!parsed.success) throw new HttpError(400, 'Unsupported webhook payload');
  const event = parsed.data;
  const provider = billingProvider.name;

  const record = await recordEvent(provider, event);
  if (record.processedAt) return { duplicate: true };

  const subscription = await Subscription.findOne({
    provider,
    providerSubId: event.providerSubId,
  });
  if (!subscription) throw new HttpError(409, 'Unknown subscription');

  await applyEvent(subscription, event);
  await syncUserPlan(subscription.userId, billingProvider);
  await WebhookEvent.updateOne({ _id: record._id }, { processedAt: new Date() });
  return { duplicate: false };
}
