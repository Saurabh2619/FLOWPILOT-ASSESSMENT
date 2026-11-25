import { Subscription } from '../models/subscription.model.js';
import { User } from '../models/user.model.js';
import { applyPlanLimits } from './limits.service.js';

const ENTITLED = ['active', 'past_due'];

const newestEntitled = (userId) =>
  Subscription.findOne({ userId, status: { $in: ENTITLED } }).sort({ createdAt: -1, _id: -1 });

// A newer paid subscription replaces older ones, which are cancelled at the
// provider first so a failure is retried instead of leaving a double charge.
async function cancelSuperseded(current, billingProvider) {
  const older = await Subscription.find({
    userId: current.userId,
    status: { $in: ENTITLED },
    _id: { $ne: current._id },
    createdAt: { $lte: current.createdAt },
  });
  for (const subscription of older) {
    await billingProvider.cancelSubscription(subscription);
    await Subscription.updateOne({ _id: subscription._id }, { status: 'cancelled' });
  }
}

// The user's plan is always derived from their subscriptions, never from a single
// event, so applying this again or out of order gives the same result.
export async function syncUserPlan(userId, billingProvider) {
  let current = await newestEntitled(userId);
  let plan;
  do {
    if (current) await cancelSuperseded(current, billingProvider);
    plan = current?.plan ?? 'free';
    await User.updateOne({ _id: userId }, { plan });
    // Re-read in case another event changed the subscriptions meanwhile.
    current = await newestEntitled(userId);
  } while (plan !== (current?.plan ?? 'free'));

  await applyPlanLimits(userId, plan);
  return plan;
}
