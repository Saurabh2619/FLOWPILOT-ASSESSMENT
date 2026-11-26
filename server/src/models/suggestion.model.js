import mongoose from 'mongoose';
import { CATEGORIES, PRIORITIES } from '../providers/ai/schema.js';
import { RUN_STATUSES } from './run.model.js';

const { ObjectId } = mongoose.Schema.Types;

const itemSchema = new mongoose.Schema(
  {
    category: { type: String, enum: CATEGORIES, required: true },
    priority: { type: String, enum: PRIORITIES, required: true },
    title: { type: String, required: true },
    action: { type: String, required: true },
  },
  { _id: false },
);

const suggestionSchema = new mongoose.Schema(
  {
    reportId: { type: ObjectId, ref: 'Report', required: true, unique: true },
    runId: { type: ObjectId, ref: 'Run', required: true, index: true },
    websiteId: { type: ObjectId, ref: 'Website', required: true, index: true },
    userId: { type: ObjectId, ref: 'User', required: true },
    status: { type: String, enum: RUN_STATUSES, default: 'queued' },
    priority: { type: String, enum: ['high', 'normal'], default: 'normal' },
    attempts: { type: Number, default: 0 },
    failureReason: { type: String, default: null },
    nextAttemptAt: { type: Date, required: true },
    dispatchedAt: { type: Date, default: null },
    lockOwner: { type: String, default: null },
    lockedUntil: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    model: { type: String, default: null },
    summary: { type: String, default: null },
    items: { type: [itemSchema], default: [] },
  },
  { timestamps: true, suppressReservedKeysWarning: true },
);

suggestionSchema.index({ status: 1, nextAttemptAt: 1 });

suggestionSchema.methods.toPublic = function toPublic() {
  const { status, failureReason, summary, finishedAt } = this;
  return {
    status,
    failureReason,
    nextAttemptAt: status === 'queued' ? this.nextAttemptAt : null,
    model: this.get('model'),
    summary,
    items: this.items.map(({ category, priority, title, action }) => ({
      category,
      priority,
      title,
      action,
    })),
    finishedAt,
  };
};

export const Suggestion = mongoose.model('Suggestion', suggestionSchema);
