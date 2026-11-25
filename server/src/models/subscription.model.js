import mongoose from 'mongoose';
import { PAID_PLAN_NAMES } from '../config/plans.js';

// pending: checkout started. active: paid. past_due: a renewal payment failed.
// failed: the first payment failed. cancelled: ended for good.
export const SUBSCRIPTION_STATUSES = ['pending', 'active', 'past_due', 'failed', 'cancelled'];

const subscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, required: true },
    providerSubId: { type: String, required: true },
    plan: { type: String, enum: PAID_PLAN_NAMES, required: true },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'pending' },
    currentPeriodEnd: { type: Date, default: null },
    // Time of the newest provider event applied, used to ignore older ones.
    lastEventAt: { type: Date, default: null },
  },
  { timestamps: true },
);

subscriptionSchema.index({ provider: 1, providerSubId: 1 }, { unique: true });

export const Subscription = mongoose.model('Subscription', subscriptionSchema);
