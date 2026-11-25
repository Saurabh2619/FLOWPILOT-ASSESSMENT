import mongoose from 'mongoose';
import { SCHEDULE_NAMES } from '../config/plans.js';

const websiteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    url: { type: String, required: true },
    schedule: { type: String, enum: SCHEDULE_NAMES, default: 'daily' },
    active: { type: Boolean, default: true },
    // Set when a plan change paused the site, so the dashboard can explain why.
    pausedReason: { type: String, enum: ['plan_limit', null], default: null },
    nextRunAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Website = mongoose.model('Website', websiteSchema);
