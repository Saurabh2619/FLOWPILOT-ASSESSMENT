import mongoose from 'mongoose';
import { createApp } from './app.js';
import { runAudit } from './audit/run-audit.js';
import { loadConfig } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './db/connect.js';
import { startWorker } from './jobs/worker.js';
import { createFetcher } from './lib/net/fetcher.js';

const config = loadConfig();
const fetcher = createFetcher();
const app = createApp(config, { fetcher });

await connectDatabase(config.mongoUri);

const worker = config.runWorker
  ? await startWorker({
      db: mongoose.connection.db,
      audit: (url) => runAudit(url, { fetcher }),
    })
  : null;

const server = app.listen(config.port, (error) => {
  if (error) throw error;
  console.log(`FlowPilot API listening on port ${config.port}`);
});

async function shutdown() {
  server.close();
  await worker?.stop();
  await disconnectDatabase();
  process.exit(0);
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
