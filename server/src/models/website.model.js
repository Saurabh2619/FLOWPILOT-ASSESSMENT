import mongoose from 'mongoose';
import { SCHEDULE_NAMES } from '../config/plans.js';

const websiteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    url: { type: String, required: true },
    schedule: { type: String, enum: SCHEDULE_NAMES, default: 'daily' },
    active: { type: Boolean, default: true },
    pausedReason: { type: String, enum: ['plan_limit', null], default: null },
    nextRunAt: { type: Date, default: null },
  },
  { timestamps: true },
);

websiteSchema.index({ userId: 1, url: 1 }, { unique: true });
websiteSchema.index({ active: 1, nextRunAt: 1 });

websiteSchema.methods.toPublic = function toPublic() {
  return {
    id: this.id,
    url: this.url,
    schedule: this.schedule,
    active: this.active,
    pausedReason: this.pausedReason,
    nextRunAt: this.nextRunAt,
    createdAt: this.createdAt,
  };
};

export const Website = mongoose.model('Website', websiteSchema);
