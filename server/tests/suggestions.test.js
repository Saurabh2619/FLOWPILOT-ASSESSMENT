import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { AiError } from '../src/providers/ai/errors.js';
import { Report } from '../src/models/report.model.js';
import { Run } from '../src/models/run.model.js';
import { Suggestion } from '../src/models/suggestion.model.js';
import { User } from '../src/models/user.model.js';
import { Website } from '../src/models/website.model.js';
import { BACKOFF_MS, MAX_ATTEMPTS } from '../src/services/leases.js';
import { executeRun } from '../src/services/run.service.js';
import { createDueRuns, dispatchSuggestions } from '../src/services/scheduler.service.js';
import { executeSuggestion } from '../src/services/suggestion.service.js';
import { bearer, registerAndLogin } from './helpers/auth.js';
import { testConfig } from './helpers/config.js';
import { useTestDatabase } from './helpers/db.js';

useTestDatabase();

const start = new Date('2026-11-26T10:00:00Z');
const advice = {
  summary: 'Add a title.',
  model: 'fake-model',
  items: [{ category: 'seo', priority: 'high', title: 'Add a title', action: 'Write one.' }],
};
const working = { suggest: async () => advice };
const failing = (transient) => ({
  suggest: async () => {
    throw new AiError('The AI service is unavailable', { transient });
  },
});
const audit = async () => ({
  overallScore: 70,
  categoryScores: { seo: 70 },
  issues: [],
  site: { https: true },
  pages: [],
  brokenLinks: [],
});

async function auditedSite(plan, email = 'owner@example.com') {
  const user = await User.create({ email, passwordHash: 'x', plan });
  const site = await Website.create({
    userId: user._id,
    url: 'https://example.com/',
    nextRunAt: start,
  });
  await createDueRuns(start);
  const run = await Run.findOne({ websiteId: site._id });
  await executeRun(run._id, { audit, now: () => start });
  return { user, site, run };
}

const execute = async (ai, at = start) => {
  const job = await Suggestion.findOne();
  await executeSuggestion(job._id, { ai, now: () => at, log: () => {} });
  return Suggestion.findById(job._id);
};

describe('queueing suggestions', () => {
  it('queues one for a paid plan after the audit', async () => {
    await auditedSite('pro');
    expect(await Suggestion.countDocuments({ status: 'queued' })).toBe(1);
  });

  it('queues none for the Free plan', async () => {
    await auditedSite('free');
    expect(await Report.countDocuments()).toBe(1);
    expect(await Suggestion.countDocuments()).toBe(0);
  });

  it('keeps one per report when the audit is repeated', async () => {
    const { run } = await auditedSite('pro');
    await Run.updateOne({ _id: run._id }, { status: 'running', lockedUntil: new Date(0) });
    await executeRun(run._id, { audit, now: () => start });
    expect(await Suggestion.countDocuments()).toBe(1);
  });

  it('hands a job out once', async () => {
    await auditedSite('business');
    const handed = [];
    const enqueue = async (job) => handed.push(job.priority);
    await Promise.all([dispatchSuggestions(enqueue, start), dispatchSuggestions(enqueue, start)]);
    expect(handed).toEqual(['high']);
  });
});

describe('creating suggestions', () => {
  it('saves the advice', async () => {
    await auditedSite('pro');
    const job = await execute(working);
    expect(job.toPublic()).toMatchObject({
      status: 'success',
      model: 'fake-model',
      summary: 'Add a title.',
      items: advice.items,
    });
  });

  it('asks the AI once when delivered twice', async () => {
    await auditedSite('pro');
    let calls = 0;
    const ai = {
      suggest: async () => {
        calls += 1;
        return advice;
      },
    };
    await Promise.all([execute(ai), execute(ai)]);
    await execute(ai);
    expect(calls).toBe(1);
  });

  it('retries with backoff while the audit stays successful', async () => {
    const { run } = await auditedSite('pro');
    let at = start;
    for (const delay of BACKOFF_MS) {
      const job = await execute(failing(true), at);
      expect(job.status).toBe('queued');
      expect(job.nextAttemptAt.getTime() - at.getTime()).toBe(delay);
      at = job.nextAttemptAt;
    }
    expect(await execute(failing(true), at)).toMatchObject({
      status: 'failed',
      attempts: MAX_ATTEMPTS,
    });
    expect((await Run.findById(run._id)).status).toBe('success');
    expect(await Report.countDocuments()).toBe(1);
  });

  it('gives up at once on a permanent error', async () => {
    await auditedSite('pro');
    expect(await execute(failing(false))).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('does not call the AI after a downgrade', async () => {
    const { user } = await auditedSite('pro');
    await User.updateOne({ _id: user._id }, { plan: 'free' });
    expect((await execute(working)).failureReason).toContain('plan');
  });

  it('explains when AI is not configured', async () => {
    await auditedSite('pro');
    expect((await execute(null)).failureReason).toBe('AI suggestions are not configured');
  });
});

describe('suggestion API', () => {
  async function setup(plan) {
    const app = createApp(testConfig());
    const auth = bearer((await registerAndLogin(app)).body.accessToken);
    await User.updateOne({}, { plan });
    const user = await User.findOne();
    const site = await Website.create({
      userId: user._id,
      url: 'https://example.com/',
      nextRunAt: start,
    });
    await createDueRuns(start);
    const run = await Run.findOne();
    await executeRun(run._id, { audit, now: () => start });
    const base = `/api/websites/${site.id}/runs/${run.id}`;
    return { app, auth, base, user };
  }

  it('returns the suggestion with the run', async () => {
    const { app, auth, base } = await setup('pro');
    await execute(working);
    const res = await request(app).get(base).set(auth);
    expect(res.body.suggestion).toMatchObject({ status: 'success', summary: 'Add a title.' });
  });

  it('lets an upgraded user request suggestions for an old report', async () => {
    const { app, auth, base, user } = await setup('free');
    expect((await request(app).post(`${base}/suggestion`).set(auth)).status).toBe(403);

    await User.updateOne({ _id: user._id }, { plan: 'pro' });
    const res = await request(app).post(`${base}/suggestion`).set(auth);
    expect(res.status).toBe(202);
    expect(res.body.suggestion.status).toBe('queued');
    expect(await Suggestion.countDocuments()).toBe(1);
  });

  it('restarts a failed suggestion but leaves a finished one alone', async () => {
    const { app, auth, base } = await setup('pro');
    await execute(failing(false));
    let res = await request(app).post(`${base}/suggestion`).set(auth);
    expect(res.body.suggestion.status).toBe('queued');

    await Suggestion.updateOne({}, { nextAttemptAt: start });
    await execute(working);
    res = await request(app).post(`${base}/suggestion`).set(auth);
    expect(res.body.suggestion.status).toBe('success');
  });

  it('hides another user’s report and removes suggestions with the website', async () => {
    const { app, auth, base } = await setup('pro');
    const other = bearer((await registerAndLogin(app, 'other@example.com')).body.accessToken);
    await User.updateOne({ email: 'other@example.com' }, { plan: 'pro' });
    expect((await request(app).post(`${base}/suggestion`).set(other)).status).toBe(404);

    await request(app).delete(base.split('/runs/')[0]).set(auth);
    expect(await Suggestion.countDocuments()).toBe(0);
  });
});
