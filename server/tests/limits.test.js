import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { Website } from '../src/models/website.model.js';
import {
  applyPlanLimits,
  assertCanActivateWebsite,
  assertCanAddWebsite,
  assertScheduleAllowed,
} from '../src/services/limits.service.js';
import { useTestDatabase } from './helpers/db.js';

useTestDatabase();

const userOn = (plan) => ({ _id: new mongoose.Types.ObjectId(), plan });

async function addSites(userId, count, fields = {}) {
  for (let i = 0; i < count; i += 1) {
    await Website.create({
      userId,
      url: `https://site-${i}.example.com`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      ...fields,
    });
  }
}

describe('schedule limits', () => {
  it.each([
    ['free', 'daily', true],
    ['free', 'hourly', false],
    ['free', '15m', false],
    ['pro', 'hourly', true],
    ['pro', '15m', false],
    ['business', '15m', true],
  ])('%s with %s is allowed: %s', (plan, schedule, allowed) => {
    const check = () => assertScheduleAllowed(plan, schedule);
    if (allowed) expect(check).not.toThrow();
    else expect(check).toThrow(/does not allow/);
  });

  it('rejects an unknown schedule', () => {
    expect(() => assertScheduleAllowed('business', 'every-second')).toThrow(/Unknown/);
  });
});

describe('website limits', () => {
  it.each([
    ['free', 1],
    ['pro', 10],
  ])('%s stops at %i websites', async (plan, max) => {
    const user = userOn(plan);
    await addSites(user._id, max - 1);
    await expect(assertCanAddWebsite(user)).resolves.toBeUndefined();
    await addSites(user._id, 1);
    await expect(assertCanAddWebsite(user)).rejects.toMatchObject({ status: 403 });
  });

  it('does not limit Business', async () => {
    const user = userOn('business');
    await addSites(user._id, 15);
    await expect(assertCanAddWebsite(user)).resolves.toBeUndefined();
  });

  it('counts only active sites when resuming one', async () => {
    const user = userOn('free');
    await addSites(user._id, 2, { active: false });
    await expect(assertCanActivateWebsite(user)).resolves.toBeUndefined();
  });
});

describe('downgrade', () => {
  it('keeps the oldest site active and pauses the rest', async () => {
    const user = userOn('free');
    await addSites(user._id, 40, { schedule: '15m' });

    await applyPlanLimits(user._id, 'free');
    await applyPlanLimits(user._id, 'free');

    const sites = await Website.find({ userId: user._id }).sort({ createdAt: 1 });
    expect(sites).toHaveLength(40);
    expect(sites.filter((site) => site.active).map((site) => site.url)).toEqual([sites[0].url]);
    expect(sites[1].pausedReason).toBe('plan_limit');
    expect(sites.every((site) => site.schedule === 'daily')).toBe(true);
  });

  it('slows only schedules the new plan does not allow', async () => {
    const user = userOn('pro');
    await addSites(user._id, 1, { schedule: '15m' });
    await addSites(user._id, 1, { schedule: 'daily' });

    await applyPlanLimits(user._id, 'pro');

    const schedules = (await Website.find({ userId: user._id })).map((site) => site.schedule);
    expect(schedules.sort()).toEqual(['daily', 'hourly']);
  });

  it('leaves other users untouched', async () => {
    const other = userOn('business');
    await addSites(other._id, 3, { schedule: '15m' });
    await applyPlanLimits(userOn('free')._id, 'free');
    expect(await Website.countDocuments({ active: true, schedule: '15m' })).toBe(3);
  });
});
