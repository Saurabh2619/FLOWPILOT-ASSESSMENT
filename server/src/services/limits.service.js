import { PLANS, SCHEDULE_NAMES, SCHEDULES } from '../config/plans.js';
import { HttpError } from '../lib/errors.js';
import { Website } from '../models/website.model.js';

export function isScheduleAllowed(plan, schedule) {
  return SCHEDULES[schedule] >= PLANS[plan].minIntervalMinutes;
}

export function assertScheduleAllowed(plan, schedule) {
  if (!SCHEDULE_NAMES.includes(schedule)) throw new HttpError(400, 'Unknown schedule');
  if (!isScheduleAllowed(plan, schedule)) {
    throw new HttpError(403, `The ${PLANS[plan].name} plan does not allow this schedule`);
  }
}

async function assertBelowLimit(user, filter, message) {
  const { maxWebsites, name } = PLANS[user.plan];
  if (maxWebsites === null) return;
  const count = await Website.countDocuments({ userId: user._id, ...filter });
  if (count >= maxWebsites) {
    throw new HttpError(403, `The ${name} plan allows ${maxWebsites} ${message}`);
  }
}

export function assertCanAddWebsite(user) {
  return assertBelowLimit(user, {}, 'website(s). Upgrade to add more');
}

export function assertCanActivateWebsite(user) {
  return assertBelowLimit(user, { active: true }, 'active website(s)');
}

// Brings existing websites within a plan. Nothing is deleted: the oldest active
// sites stay active, the rest are paused, and faster schedules are slowed down.
// Running it again has no further effect.
export async function applyPlanLimits(userId, plan) {
  const { maxWebsites, minIntervalMinutes } = PLANS[plan];

  if (maxWebsites !== null) {
    const excess = await Website.find({ userId, active: true })
      .sort({ createdAt: 1, _id: 1 })
      .skip(maxWebsites)
      .select('_id');
    if (excess.length > 0) {
      await Website.updateMany(
        { _id: { $in: excess.map((site) => site._id) } },
        { active: false, pausedReason: 'plan_limit' },
      );
    }
  }

  const tooFast = SCHEDULE_NAMES.filter((name) => SCHEDULES[name] < minIntervalMinutes);
  if (tooFast.length > 0) {
    const fastestAllowed = SCHEDULE_NAMES.find((name) => SCHEDULES[name] === minIntervalMinutes);
    await Website.updateMany(
      { userId, schedule: { $in: tooFast } },
      { schedule: fastestAllowed },
    );
  }
}
