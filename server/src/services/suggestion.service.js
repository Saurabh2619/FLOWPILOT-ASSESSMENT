import { isValidObjectId } from 'mongoose';
import { PLANS } from '../config/plans.js';
import { HttpError } from '../lib/errors.js';
import { Report } from '../models/report.model.js';
import { Suggestion } from '../models/suggestion.model.js';
import { User } from '../models/user.model.js';
import { Website } from '../models/website.model.js';
import { claim, closeExhausted, fail, release, retryOrFail } from './leases.js';
import { getWebsite } from './website.service.js';

const DUPLICATE_KEY = 11000;

export async function queueSuggestion(report, { priority = 'normal', now = new Date() } = {}) {
  try {
    await Suggestion.updateOne(
      { reportId: report._id },
      {
        $setOnInsert: {
          runId: report.runId,
          websiteId: report.websiteId,
          userId: report.userId,
          priority,
          nextAttemptAt: now,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== DUPLICATE_KEY) throw error;
  }
}

export async function executeSuggestion(id, { ai, now = () => new Date(), log = console.error }) {
  const job = await claim(Suggestion, id, now());
  if (!job) {
    await closeExhausted(Suggestion, id, 'Suggestions stopped on every attempt', now());
    return;
  }

  try {
    const [report, website, user] = await Promise.all([
      Report.findById(job.reportId),
      Website.findById(job.websiteId),
      User.findById(job.userId),
    ]);
    if (!report || !website) return void (await fail(job, 'The report was removed', now()));
    if (!user || user.disabled) return void (await fail(job, 'The account is disabled', now()));
    if (!PLANS[user.plan].aiSuggestions) {
      return void (await fail(job, 'Your plan does not include AI suggestions', now()));
    }
    if (!ai) return void (await fail(job, 'AI suggestions are not configured', now()));

    const { summary, items, model } = await ai.suggest({
      url: website.url,
      report: report.toPublic(),
    });
    await release(job, {
      status: 'success',
      failureReason: null,
      finishedAt: now(),
      summary,
      items,
      model,
    });
  } catch (error) {
    const known = error.name === 'AiError';
    if (!known) log(error);
    await retryOrFail(
      job,
      {
        reason: known ? error.message : 'Unexpected error while creating suggestions',
        transient: known ? error.transient : true,
      },
      now(),
    );
  }
}

export async function requestSuggestion(user, websiteId, runId, now = new Date()) {
  if (!PLANS[user.plan].aiSuggestions) {
    throw new HttpError(403, 'Upgrade to Pro or Business to get AI suggestions');
  }
  const website = await getWebsite(user, websiteId);
  const report =
    isValidObjectId(runId) && (await Report.findOne({ runId, websiteId: website._id }));
  if (!report) throw new HttpError(404, 'Report not found');

  await Suggestion.updateOne(
    { reportId: report._id, status: 'failed' },
    {
      status: 'queued',
      attempts: 0,
      failureReason: null,
      nextAttemptAt: now,
      dispatchedAt: null,
      finishedAt: null,
    },
  );
  await queueSuggestion(report, {
    priority: PLANS[user.plan].priorityJobs ? 'high' : 'normal',
    now,
  });
  return (await Suggestion.findOne({ reportId: report._id })).toPublic();
}
