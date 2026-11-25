import { beforeEach, describe, expect, it } from 'vitest';
import { AuditError } from '../src/audit/errors.js';
import { Report } from '../src/models/report.model.js';
import { Run } from '../src/models/run.model.js';
import { User } from '../src/models/user.model.js';
import { Website } from '../src/models/website.model.js';
import { BACKOFF_MS, executeRun, LOCK_MS, MAX_ATTEMPTS } from '../src/services/run.service.js';
import {
  createDueRuns,
  dispatchRuns,
  REDISPATCH_AFTER_MS,
} from '../src/services/scheduler.service.js';
import { useTestDatabase } from './helpers/db.js';

useTestDatabase();

const MINUTE = 60 * 1000;
const start = new Date('2026-11-26T10:00:00Z');
const later = (ms) => new Date(start.getTime() + ms);
const result = (overallScore = 80) => ({
  overallScore,
  categoryScores: { seo: overallScore },
  issues: [{ id: 'x' }],
  site: { https: true },
  pages: [],
  brokenLinks: [],
});

let user;
let site;

beforeEach(async () => {
  user = await User.create({ email: 'owner@example.com', passwordHash: 'x', plan: 'pro' });
  site = await Website.create({
    userId: user._id,
    url: 'https://example.com/',
    schedule: 'hourly',
    nextRunAt: start,
  });
});

async function queuedRun() {
  await createDueRuns(start);
  return Run.findOne();
}
const execute = (run, audit = async () => result(), at = start) =>
  executeRun(run._id, { audit, now: () => at, log: () => {} });
const reload = (run) => Run.findById(run._id);
const failing = (transient) => async () => {
  throw new AuditError('The website responded with status 503', { transient });
};

describe('scheduling', () => {
  it('creates one run for a due website and advances the schedule', async () => {
    await createDueRuns(start);
    expect(await Run.countDocuments()).toBe(1);
    expect((await Website.findById(site._id)).nextRunAt).toEqual(later(60 * MINUTE));
  });

  it('creates no duplicate when schedulers run together or repeat', async () => {
    await Promise.all([createDueRuns(start), createDueRuns(start), createDueRuns(start)]);
    expect(await Run.countDocuments()).toBe(1);
  });

  it('does not duplicate a slot after a crash before advancing', async () => {
    const run = await queuedRun();
    await execute(run);
    await Website.updateOne({ _id: site._id }, { nextRunAt: start });

    await createDueRuns(start);
    expect(await Run.countDocuments()).toBe(1);
  });

  it('makes a single catch-up run after a long sleep', async () => {
    await createDueRuns(later(24 * 60 * MINUTE));
    expect(await Run.countDocuments()).toBe(1);
  });

  it('does not stack a new run on an unfinished one', async () => {
    await createDueRuns(start);
    await createDueRuns(later(61 * MINUTE));
    expect(await Run.countDocuments()).toBe(1);
  });

  it.each([
    ['a paused website', () => Website.updateOne({}, { active: false })],
    ['a disabled user', () => User.updateOne({}, { disabled: true })],
    ['a site that is not due', () => Website.updateOne({}, { nextRunAt: later(MINUTE) })],
  ])('skips %s', async (_, arrange) => {
    await arrange();
    await createDueRuns(start);
    expect(await Run.countDocuments()).toBe(0);
  });

  it('never runs more often than the plan allows', async () => {
    await User.updateOne({ _id: user._id }, { plan: 'free' });
    await createDueRuns(start);
    expect((await Website.findById(site._id)).nextRunAt).toEqual(later(24 * 60 * MINUTE));
  });

  it('gives Business runs high priority', async () => {
    await User.updateOne({ _id: user._id }, { plan: 'business' });
    expect((await queuedRun()).priority).toBe('high');
  });
});

describe('dispatch', () => {
  const dispatched = async (at) => {
    const ids = [];
    await dispatchRuns(async (run) => ids.push(run.id), at);
    return ids;
  };

  it('hands each run out once, even from parallel dispatchers', async () => {
    await createDueRuns(start);
    const [a, b] = await Promise.all([dispatched(start), dispatched(start)]);
    expect(a.length + b.length).toBe(1);
    expect(await dispatched(later(MINUTE))).toEqual([]);
  });

  it('hands out a run again if it never started', async () => {
    await createDueRuns(start);
    await dispatched(start);
    expect(await dispatched(later(REDISPATCH_AFTER_MS + MINUTE))).toHaveLength(1);
  });

  it('recovers a run whose worker died', async () => {
    const run = await queuedRun();
    await Run.updateOne({ _id: run._id }, { status: 'running', lockedUntil: later(LOCK_MS) });
    expect(await dispatched(later(MINUTE))).toEqual([]);
    expect(await dispatched(later(LOCK_MS + MINUTE))).toEqual([run.id]);
  });
});

describe('executing a run', () => {
  it('saves the report and marks the run successful', async () => {
    const run = await queuedRun();
    await execute(run);
    expect(await reload(run)).toMatchObject({ status: 'success', attempts: 1, lockOwner: null });
    expect((await Report.findOne({ runId: run._id })).overallScore).toBe(80);
  });

  it('runs once when delivered twice at the same time', async () => {
    const run = await queuedRun();
    let calls = 0;
    const audit = async () => {
      calls += 1;
      return result();
    };
    await Promise.all([execute(run, audit), execute(run, audit)]);
    await execute(run, audit);
    expect(calls).toBe(1);
    expect(await Report.countDocuments()).toBe(1);
  });

  it('replaces the report when a crashed run is repeated', async () => {
    const run = await queuedRun();
    await execute(run, async () => result(50));
    await Run.updateOne({ _id: run._id }, { status: 'running', lockedUntil: start });

    await execute(run, async () => result(90), later(MINUTE));
    expect(await Report.countDocuments()).toBe(1);
    expect((await Report.findOne()).overallScore).toBe(90);
    expect((await reload(run)).status).toBe('success');
  });

  it('retries temporary failures with growing delays, then gives up', async () => {
    const run = await queuedRun();
    let at = start;
    for (const delay of BACKOFF_MS) {
      await execute(run, failing(true), at);
      const state = await reload(run);
      expect(state).toMatchObject({ status: 'queued', dispatchedAt: null });
      expect(state.nextAttemptAt.getTime() - at.getTime()).toBe(delay);
      at = state.nextAttemptAt;
    }
    await execute(run, failing(true), at);
    expect(await reload(run)).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
  });

  it('does not retry before the backoff has passed', async () => {
    const run = await queuedRun();
    await execute(run, failing(true));
    await execute(run, undefined, later(10 * 1000));
    expect((await reload(run)).attempts).toBe(1);
  });

  it('fails at once for a permanent problem, with the reason', async () => {
    const run = await queuedRun();
    await execute(run, failing(false));
    expect(await reload(run)).toMatchObject({
      status: 'failed',
      attempts: 1,
      failureReason: 'The website responded with status 503',
    });
    expect(await Report.countDocuments()).toBe(0);
  });

  it('survives an unexpected error and hides its details', async () => {
    const run = await queuedRun();
    await expect(
      execute(run, async () => {
        throw new Error('secret internal detail');
      }),
    ).resolves.toBeUndefined();
    expect(await reload(run)).toMatchObject({
      status: 'queued',
      failureReason: 'Unexpected error during the audit',
    });
  });

  it('closes a run that crashed on every attempt', async () => {
    const run = await queuedRun();
    await Run.updateOne(
      { _id: run._id },
      { status: 'running', attempts: MAX_ATTEMPTS, lockedUntil: start },
    );
    await execute(run, undefined, later(MINUTE));
    expect((await reload(run)).status).toBe('failed');
  });

  it('ignores a slow worker that lost its lock', async () => {
    const run = await queuedRun();
    await execute(run, async () => {
      await Run.updateOne({ _id: run._id }, { lockOwner: 'another-worker' });
      return result();
    });
    expect(await reload(run)).toMatchObject({ status: 'running', lockOwner: 'another-worker' });
  });

  it('stops if the website was removed or paused', async () => {
    const run = await queuedRun();
    await Website.updateOne({ _id: site._id }, { active: false });
    await execute(run);
    expect((await reload(run)).failureReason).toBe('The website is paused');
  });
});
