import { isValidObjectId } from 'mongoose';
import { PLANS } from '../config/plans.js';
import { HttpError } from '../lib/errors.js';
import { Report } from '../models/report.model.js';
import { Run } from '../models/run.model.js';
import { Suggestion } from '../models/suggestion.model.js';
import { User } from '../models/user.model.js';
import { Website } from '../models/website.model.js';
import { claim, closeExhausted, fail, release, retryOrFail } from './leases.js';
import { queueSuggestion } from './suggestion.service.js';
import { getWebsite } from './website.service.js';

export { BACKOFF_MS, LOCK_MS, MAX_ATTEMPTS } from './leases.js';

function handleFailure(run, error, now, log) {
  const known = error.name === 'AuditError' || error.name === 'FetchError';
  if (!known) log(error);
  return retryOrFail(
    run,
    {
      reason: known ? error.message : 'Unexpected error during the audit',
      transient: known ? error.transient : true,
    },
    now,
  );
}

export async function executeRun(runId, { audit, now = () => new Date(), log = console.error }) {
  const run = await claim(Run, runId, now());
  if (!run) {
    await closeExhausted(Run, runId, 'The audit stopped unexpectedly on every attempt', now());
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

    const report = await Report.findOneAndUpdate(
      { runId: run._id },
      { ...result, websiteId: run.websiteId, userId: run.userId },
      { upsert: true, runValidators: true, returnDocument: 'after' },
    );
    if (PLANS[user.plan].aiSuggestions) {
      await queueSuggestion(report, { priority: run.priority, now: now() });
    }
    if (!(await Website.exists({ _id: run.websiteId }))) {
      await Promise.all([
        Report.deleteOne({ runId: run._id }),
        Suggestion.deleteOne({ runId: run._id }),
      ]);
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
  const [report, suggestion] = await Promise.all([
    Report.findOne({ runId: run._id }),
    Suggestion.findOne({ runId: run._id }),
  ]);
  return {
    run: run.toPublic(),
    report: report?.toPublic() ?? null,
    suggestion: suggestion?.toPublic() ?? null,
  };
}
