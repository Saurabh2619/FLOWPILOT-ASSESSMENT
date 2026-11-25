import { MongoBackend } from '@agendajs/mongo-backend';
import { Agenda } from 'agenda';
import { createDueRuns, dispatchRuns } from '../services/scheduler.service.js';
import { executeRun, LOCK_MS } from '../services/run.service.js';

const TICK_JOB = 'scheduler-tick';
const RUN_JOB = 'audit-run';

export async function startWorker({
  db,
  audit,
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

  const enqueue = (run) =>
    agenda
      .create(RUN_JOB, { runId: String(run._id) })
      .priority(run.priority)
      .schedule(new Date())
      .save();

  const tick = async () => {
    await createDueRuns();
    await dispatchRuns(enqueue);
  };

  agenda.define(TICK_JOB, tick, { concurrency: 1, lockLifetime: 60 * 1000 });
  agenda.define(RUN_JOB, (job) => executeRun(job.attrs.data.runId, { audit }), {
    concurrency,
    lockLimit: concurrency,
    lockLifetime: LOCK_MS,
  });

  await agenda.start();
  await agenda.every(tickEvery, TICK_JOB);

  return {
    stop: () => agenda.drain(10000),
  };
}
