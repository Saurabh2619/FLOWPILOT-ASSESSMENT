import { randomUUID } from 'node:crypto';
import { isValidObjectId } from 'mongoose';
import { HttpError } from '../lib/errors.js';
import { Report } from '../models/report.model.js';
import { Run } from '../models/run.model.js';
import { User } from '../models/user.model.js';
import { Website } from '../models/website.model.js';
import { getWebsite } from './website.service.js';

export const MAX_ATTEMPTS = 4;
export const LOCK_MS = 5 * 60 * 1000;
export const BACKOFF_MS = [1, 5, 15].map((minutes) => minutes * 60 * 1000);

function claim(runId, now) {
  return Run.findOneAndUpdate(
    {
      _id: runId,
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

function release(run, changes) {
  return Run.updateOne(
    { _id: run._id, lockOwner: run.lockOwner },
    { lockOwner: null, lockedUntil: null, ...changes },
  );
}

const fail = (run, failureReason, now) =>
  release(run, { status: 'failed', failureReason, finishedAt: now });

function closeExhausted(runId, now) {
  return Run.updateOne(
    { _id: runId, status: 'running', attempts: { $gte: MAX_ATTEMPTS }, lockedUntil: { $lt: now } },
    {
      status: 'failed',
      failureReason: 'The audit stopped unexpectedly on every attempt',
      finishedAt: now,
      lockOwner: null,
      lockedUntil: null,
    },
  );
}

async function handleFailure(run, error, now, log) {
  const known = error.name === 'AuditError' || error.name === 'FetchError';
  if (!known) log(error);
  const reason = known ? error.message : 'Unexpected error during the audit';
  const transient = known ? error.transient : true;

  if (!transient || run.attempts >= MAX_ATTEMPTS) return fail(run, reason, now);

  return release(run, {
    status: 'queued',
    failureReason: reason,
    nextAttemptAt: new Date(now.getTime() + BACKOFF_MS[run.attempts - 1]),
    dispatchedAt: null,
  });
}

export async function executeRun(runId, { audit, now = () => new Date(), log = console.error }) {
  const run = await claim(runId, now());
  if (!run) {
    await closeExhausted(runId, now());
    return;
  }

  try {
    const [website, user] = await Promise.all([
      Website.findById(run.websiteId),
      User.findById(run.userId),
    ]);
    if (!website) return void (await fail(run, 'The website was removed', now()));
    if (!user || user.disabled) return void (await fail(run, 'The account is disabled', now()));
    if (!website.active) return void (await fail(run, 'The website is paused', now()));

    const result = await audit(website.url);

    await Report.updateOne(
      { runId: run._id },
      { ...result, websiteId: run.websiteId, userId: run.userId },
      { upsert: true, runValidators: true },
    );
    if (!(await Website.exists({ _id: run.websiteId }))) {
      await Report.deleteOne({ runId: run._id });
    }
    await release(run, { status: 'success', failureReason: null, finishedAt: now() });
  } catch (error) {
    await handleFailure(run, error, now(), log);
  }
}

export async function listRuns(user, websiteId, { limit }) {
  const website = await getWebsite(user, websiteId);
  const runs = await Run.find({ websiteId: website._id })
    .sort({ scheduledFor: -1, _id: -1 })
    .limit(limit);
  const reports = await Report.find({ runId: { $in: runs.map((run) => run._id) } }).select(
    'runId overallScore',
  );
  const scores = new Map(reports.map((report) => [String(report.runId), report.overallScore]));

  return runs.map((run) => ({ ...run.toPublic(), overallScore: scores.get(run.id) ?? null }));
}

export async function getRun(user, websiteId, runId) {
  const website = await getWebsite(user, websiteId);
  const run =
    isValidObjectId(runId) && (await Run.findOne({ _id: runId, websiteId: website._id }));
  if (!run) throw new HttpError(404, 'Run not found');
  const report = await Report.findOne({ runId: run._id });
  return { run: run.toPublic(), report: report?.toPublic() ?? null };
}
