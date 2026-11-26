import { isValidObjectId } from 'mongoose';
import { PLANS, SCHEDULES } from '../config/plans.js';
import { HttpError } from '../lib/errors.js';
import { FetchError } from '../lib/net/errors.js';
import { parseWebUrl } from '../lib/net/url.js';
import { Report } from '../models/report.model.js';
import { Run } from '../models/run.model.js';
import { Suggestion } from '../models/suggestion.model.js';
import { Website } from '../models/website.model.js';
import {
  assertCanActivateWebsite,
  assertCanAddWebsite,
  assertScheduleAllowed,
} from './limits.service.js';

const DUPLICATE_KEY = 11000;
const REACHABLE_ERRORS = new Set([401, 403, 429]);

async function verifyReachable(input, fetcher) {
  try {
    const url = parseWebUrl(input, { allowedPorts: fetcher.allowedPorts });
    const response = await fetcher(url.toString(), { maxBytes: 64 * 1024 });
    if (response.status >= 400 && !REACHABLE_ERRORS.has(response.status)) {
      throw new HttpError(422, `The website responded with status ${response.status}`);
    }
    return url.toString();
  } catch (error) {
    if (error instanceof FetchError) throw new HttpError(422, error.message, { code: error.code });
    throw error;
  }
}

export async function addWebsite(user, { url, schedule }, { fetcher }) {
  assertScheduleAllowed(user.plan, schedule);
  await assertCanAddWebsite(user);
  const verifiedUrl = await verifyReachable(url, fetcher);

  let website;
  try {
    website = await Website.create({
      userId: user._id,
      url: verifiedUrl,
      schedule,
      nextRunAt: new Date(),
    });
  } catch (error) {
    if (error.code === DUPLICATE_KEY) throw new HttpError(409, 'You already added this website');
    throw error;
  }

  const { maxWebsites, name } = PLANS[user.plan];
  if (maxWebsites !== null && (await Website.countDocuments({ userId: user._id })) > maxWebsites) {
    await website.deleteOne();
    throw new HttpError(403, `The ${name} plan allows ${maxWebsites} website(s). Upgrade to add more`);
  }
  return website;
}

export function listWebsites(user) {
  return Website.find({ userId: user._id }).sort({ createdAt: 1, _id: 1 });
}

export async function getWebsite(user, id) {
  const website = isValidObjectId(id) && (await Website.findOne({ _id: id, userId: user._id }));
  if (!website) throw new HttpError(404, 'Website not found');
  return website;
}

export async function updateWebsite(user, id, { schedule, active }) {
  const website = await getWebsite(user, id);

  if (schedule !== undefined && schedule !== website.schedule) {
    assertScheduleAllowed(user.plan, schedule);
    website.schedule = schedule;
    const soonest = new Date(Date.now() + SCHEDULES[schedule] * 60 * 1000);
    if (website.nextRunAt > soonest) website.nextRunAt = soonest;
  }

  const resuming = active === true && !website.active;
  if (resuming) await assertCanActivateWebsite(user);
  if (active !== undefined) {
    website.active = active;
    website.pausedReason = null;
  }
  await website.save();

  if (resuming) {
    const { maxWebsites } = PLANS[user.plan];
    const count = await Website.countDocuments({ userId: user._id, active: true });
    if (maxWebsites !== null && count > maxWebsites) {
      await Website.updateOne({ _id: website._id }, { active: false });
      throw new HttpError(403, 'Your plan has no room for another active website');
    }
  }
  return website;
}

export async function deleteWebsite(user, id) {
  const website = await getWebsite(user, id);
  await website.deleteOne();
  await Promise.all([
    Run.deleteMany({ websiteId: website._id }),
    Report.deleteMany({ websiteId: website._id }),
    Suggestion.deleteMany({ websiteId: website._id }),
  ]);
}
