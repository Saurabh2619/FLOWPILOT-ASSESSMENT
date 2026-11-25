import { PLANS, SCHEDULES } from '../config/plans.js';
import { Run } from '../models/run.model.js';
import { User } from '../models/user.model.js';
import { Website } from '../models/website.model.js';

const DUPLICATE_KEY = 11000;
const BATCH_SIZE = 200;
export const REDISPATCH_AFTER_MS = 10 * 60 * 1000;

async function createRun(website, user) {
  const scheduledFor = website.nextRunAt;
  const runKey = `${website.id}:${scheduledFor.toISOString()}`;
  try {
    await Run.updateOne(
      { runKey },
      {
        $setOnInsert: {
          websiteId: website._id,
          userId: website.userId,
          priority: PLANS[user.plan].priorityJobs ? 'high' : 'normal',
          scheduledFor,
          nextAttemptAt: scheduledFor,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== DUPLICATE_KEY) throw error;
  }
}

export async function createDueRuns(now = new Date()) {
  const due = await Website.find({ active: true, nextRunAt: { $lte: now } })
    .sort({ nextRunAt: 1 })
    .limit(BATCH_SIZE);
  const users = await User.find({ _id: { $in: due.map((site) => site.userId) } });
  const usersById = new Map(users.map((user) => [user.id, user]));

  for (const website of due) {
    const user = usersById.get(String(website.userId));
    if (!user || user.disabled) continue;

    const unfinished = await Run.exists({
      websiteId: website._id,
      status: { $in: ['queued', 'running'] },
    });
    if (!unfinished) await createRun(website, user);

    const minutes = Math.max(SCHEDULES[website.schedule], PLANS[user.plan].minIntervalMinutes);
    await Website.updateOne(
      { _id: website._id, nextRunAt: website.nextRunAt },
      { nextRunAt: new Date(now.getTime() + minutes * 60 * 1000) },
    );
  }
}

export async function dispatchRuns(enqueue, now = new Date()) {
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

  const runs = await Run.find(eligible).sort({ priority: 1, nextAttemptAt: 1 }).limit(BATCH_SIZE);
  for (const run of runs) {
    const claimed = await Run.findOneAndUpdate(
      { _id: run._id, ...eligible },
      { dispatchedAt: now },
    );
    if (claimed) await enqueue(run);
  }
}
