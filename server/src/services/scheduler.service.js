import { PLANS, SCHEDULES } from '../config/plans.js';
import { Run } from '../models/run.model.js';
import { Suggestion } from '../models/suggestion.model.js';
import { User } from '../models/user.model.js';
import { Website } from '../models/website.model.js';
import { dispatch } from './leases.js';

const DUPLICATE_KEY = 11000;
const BATCH_SIZE = 200;

export { REDISPATCH_AFTER_MS } from './leases.js';

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

export const dispatchRuns = (enqueue, now = new Date()) => dispatch(Run, enqueue, now);

export const dispatchSuggestions = (enqueue, now = new Date()) =>
  dispatch(Suggestion, enqueue, now);
