import { randomUUID } from 'node:crypto';

export const MAX_ATTEMPTS = 4;
export const LOCK_MS = 5 * 60 * 1000;
export const BACKOFF_MS = [1, 5, 15].map((minutes) => minutes * 60 * 1000);
export const REDISPATCH_AFTER_MS = 10 * 60 * 1000;

const BATCH_SIZE = 200;

export function claim(Model, id, now) {
  return Model.findOneAndUpdate(
    {
      _id: id,
      attempts: { $lt: MAX_ATTEMPTS },
      $or: [
        { status: 'queued', nextAttemptAt: { $lte: now } },
        { status: 'running', lockedUntil: { $lt: now } },
      ],
    },
    {
      status: 'running',
      lockOwner: randomUUID(),
      lockedUntil: new Date(now.getTime() + LOCK_MS),
      startedAt: now,
      $inc: { attempts: 1 },
    },
    { returnDocument: 'after' },
  );
}

export function release(job, changes) {
  return job.constructor.updateOne(
    { _id: job._id, lockOwner: job.lockOwner },
    { lockOwner: null, lockedUntil: null, ...changes },
  );
}

export const fail = (job, failureReason, now) =>
  release(job, { status: 'failed', failureReason, finishedAt: now });

export function retryOrFail(job, { reason, transient }, now) {
  if (!transient || job.attempts >= MAX_ATTEMPTS) return fail(job, reason, now);

  return release(job, {
    status: 'queued',
    failureReason: reason,
    nextAttemptAt: new Date(now.getTime() + BACKOFF_MS[job.attempts - 1]),
    dispatchedAt: null,
  });
}

export function closeExhausted(Model, id, failureReason, now) {
  return Model.updateOne(
    { _id: id, status: 'running', attempts: { $gte: MAX_ATTEMPTS }, lockedUntil: { $lt: now } },
    { status: 'failed', failureReason, finishedAt: now, lockOwner: null, lockedUntil: null },
  );
}

export async function dispatch(Model, enqueue, now) {
  const eligible = {
    $and: [
      {
        $or: [
          { status: 'queued', nextAttemptAt: { $lte: now } },
          { status: 'running', lockedUntil: { $lt: now } },
        ],
      },
      {
        $or: [
          { dispatchedAt: null },
          { dispatchedAt: { $lt: new Date(now.getTime() - REDISPATCH_AFTER_MS) } },
        ],
      },
    ],
  };

  const jobs = await Model.find(eligible).sort({ priority: 1, nextAttemptAt: 1 }).limit(BATCH_SIZE);
  for (const job of jobs) {
    const claimed = await Model.findOneAndUpdate(
      { _id: job._id, ...eligible },
      { dispatchedAt: now },
    );
    if (claimed) await enqueue(job);
  }
}
