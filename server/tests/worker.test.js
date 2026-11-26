import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { runAudit } from '../src/audit/run-audit.js';
import { startWorker } from '../src/jobs/worker.js';
import { Report } from '../src/models/report.model.js';
import { Run } from '../src/models/run.model.js';
import { bearer, registerAndLogin } from './helpers/auth.js';
import { testConfig } from './helpers/config.js';
import { useTestDatabase } from './helpers/db.js';
import { useLocalSite } from './helpers/site.js';

useTestDatabase();
const site = useLocalSite({
  '/': { body: '<html lang="en"><head><title>Local test site</title></head><body></body></html>' },
});

async function waitFor(check, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting');
}

describe('background worker', () => {
  it('audits a newly added website and shows it in the history', async () => {
    const fetcher = site.createFetcher();
    const app = createApp(testConfig(), { fetcher });
    const auth = bearer((await registerAndLogin(app)).body.accessToken);
    const added = await request(app).post('/api/websites').set(auth).send({ url: site.origin });
    const { id } = added.body.website;

    expect(await Run.countDocuments()).toBe(0);

    const worker = await startWorker({
      db: mongoose.connection.db,
      audit: (url) => runAudit(url, { fetcher }),
      tickEvery: '1 second',
      processEvery: 200,
    });
    try {
      await waitFor(() => Run.exists({ status: 'success' }));
    } finally {
      await worker.stop();
    }

    const history = await request(app).get(`/api/websites/${id}/runs`).set(auth);
    expect(history.body.runs).toHaveLength(1);
    const [run] = history.body.runs;
    expect(run).toMatchObject({ status: 'success', attempts: 1 });
    expect(run.overallScore).toBeGreaterThan(0);

    const list = await request(app).get('/api/websites').set(auth);
    expect(list.body.websites[0]).toMatchObject({
      latestStatus: 'success',
      latestScore: run.overallScore,
    });

    const detail = await request(app).get(`/api/websites/${id}/runs/${run.id}`).set(auth);
    expect(detail.body.report.issues.length).toBeGreaterThan(0);
    expect(detail.body.report.pages[0].title).toBe('Local test site');

    const stranger = bearer((await registerAndLogin(app, 'other@example.com')).body.accessToken);
    for (const path of [`/api/websites/${id}/runs`, `/api/websites/${id}/runs/${run.id}`]) {
      expect((await request(app).get(path).set(stranger)).status).toBe(404);
    }

    await request(app).delete(`/api/websites/${id}`).set(auth);
    expect(await Run.countDocuments()).toBe(0);
    expect(await Report.countDocuments()).toBe(0);
  });
});
