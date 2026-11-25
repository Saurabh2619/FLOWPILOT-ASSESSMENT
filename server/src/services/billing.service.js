import { PLANS } from '../config/plans.js';
import { HttpError } from '../lib/errors.js';
import { Subscription } from '../models/subscription.model.js';
import { User } from '../models/user.model.js';
import { handleWebhook } from './webhook.service.js';

export function listPlans() {
  return Object.entries(PLANS).map(([id, plan]) => ({ id, ...plan }));
}

const present = (subscription) =>
  subscription && {
    id: subscription.providerSubId,
    plan: subscription.plan,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
  };

export async function getOverview(user) {
  const latest = (filter) =>
    Subscription.findOne({ userId: user._id, ...filter }).sort({ createdAt: -1, _id: -1 });
  const subscription =
    (await latest({ status: { $in: ['active', 'past_due'] } })) ?? (await latest({}));
  return {
    plan: user.plan,
    limits: PLANS[user.plan],
    subscription: present(subscription),
  };
}

export async function startCheckout(user, plan, billingProvider) {
  if (user.plan === plan) throw new HttpError(409, 'You are already on this plan');

  const { providerSubId, checkoutUrl } = await billingProvider.createSubscription({
    userId: user.id,
    plan,
  });
  await Subscription.create({
    userId: user._id,
    provider: billingProvider.name,
    providerSubId,
    plan,
  });
  return { subscriptionId: providerSubId, checkoutUrl };
}

export async function cancelSubscription(user, billingProvider) {
  const current = await Subscription.find({
    userId: user._id,
    provider: billingProvider.name,
    status: { $in: ['active', 'past_due'] },
  });
  if (current.length === 0) throw new HttpError(409, 'There is no subscription to cancel');

  for (const subscription of current) {
    const { webhook } = await billingProvider.cancelSubscription(subscription);
    if (webhook) await handleWebhook(webhook, billingProvider);
  }
  return getOverview(await User.findById(user._id));
}

export async function completeMockCheckout(user, { subscriptionId, outcome }, billingProvider) {
  const subscription = await Subscription.findOne({
    userId: user._id,
    provider: billingProvider.name,
    providerSubId: subscriptionId,
  });
  if (!subscription) throw new HttpError(404, 'Subscription not found');
  if (subscription.status === 'cancelled') {
    throw new HttpError(409, 'This subscription is cancelled');
  }

  await handleWebhook(billingProvider.simulatePayment(subscription, outcome), billingProvider);
  return getOverview(await User.findById(user._id));
}
