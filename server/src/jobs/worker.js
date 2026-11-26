import { MongoBackend } from '@agendajs/mongo-backend';
import { Agenda } from 'agenda';
import { LOCK_MS } from '../services/leases.js';
import { executeRun } from '../services/run.service.js';
import {
  createDueRuns,
  dispatchRuns,
  dispatchSuggestions,
} from '../services/scheduler.service.js';
import { executeSuggestion } from '../services/suggestion.service.js';

const TICK_JOB = 'scheduler-tick';
const RUN_JOB = 'audit-run';
const SUGGESTION_JOB = 'ai-suggestion';

export async function startWorker({
  db,
  audit,
  ai = null,
  tickEvery = '30 seconds',
  processEvery = '5 seconds',
  concurrency = 3,
}) {
  const agenda = new Agenda({
    backend: new MongoBackend({ mongo: db }),
    processEvery,
    removeOnComplete: true,
  });
  agenda.on('error', (error) => console.error('Job queue error', error));
  agenda.on('fail', (error, job) => console.error(`Job ${job.attrs.name} failed`, error));

  const enqueue = (name) => (record) =>
    agenda
      .create(name, { id: String(record._id) })
      .priority(record.priority)
      .schedule(new Date())
      .save();

  const tick = async () => {
    await createDueRuns();
    await dispatchRuns(enqueue(RUN_JOB));
    await dispatchSuggestions(enqueue(SUGGESTION_JOB));
  };

  agenda.define(TICK_JOB, tick, { concurrency: 1, lockLifetime: 60 * 1000 });
  agenda.define(RUN_JOB, (job) => executeRun(job.attrs.data.id, { audit }), {
    concurrency,
    lockLimit: concurrency,
    lockLifetime: LOCK_MS,
  });
  agenda.define(SUGGESTION_JOB, (job) => executeSuggestion(job.attrs.data.id, { ai }), {
    concurrency: 1,
    lockLimit: 1,
    lockLifetime: LOCK_MS,
  });

  await agenda.start();
  await agenda.every(tickEvery, TICK_JOB);

  return {
    stop: () => agenda.drain(10000),
  };
}
