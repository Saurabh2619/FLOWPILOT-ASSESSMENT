import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

export const RUN_STATUSES = ['queued', 'running', 'success', 'failed'];

// The source of truth for audit work. Agenda only delivers it to a worker.
const runSchema = new mongoose.Schema(
  {
    websiteId: { type: ObjectId, ref: 'Website', required: true },
    userId: { type: ObjectId, ref: 'User', required: true },
    // Website plus scheduled time: the same slot can never create two runs.
    runKey: { type: String, required: true, unique: true },
    status: { type: String, enum: RUN_STATUSES, default: 'queued' },
    priority: { type: String, enum: ['high', 'normal'], default: 'normal' },
    scheduledFor: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    // Latest problem, kept while a retry is pending and after a final failure.
    failureReason: { type: String, default: null },
    nextAttemptAt: { type: Date, required: true },
    dispatchedAt: { type: Date, default: null },
    lockOwner: { type: String, default: null },
    lockedUntil: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

runSchema.index({ websiteId: 1, scheduledFor: -1 });
runSchema.index({ status: 1, nextAttemptAt: 1 });

runSchema.methods.toPublic = function toPublic() {
  return {
    id: this.id,
    websiteId: String(this.websiteId),
    status: this.status,
    scheduledFor: this.scheduledFor,
    attempts: this.attempts,
    failureReason: this.failureReason,
    nextAttemptAt: this.status === 'queued' ? this.nextAttemptAt : null,
    startedAt: this.startedAt,
    finishedAt: this.finishedAt,
  };
};

export const Run = mongoose.model('Run', runSchema);
