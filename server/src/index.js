import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { connectDatabase } from './db/connect.js';

const config = loadConfig();
const app = createApp(config);

await connectDatabase(config.mongoUri);

app.listen(config.port, (error) => {
  if (error) throw error;
  console.log(`FlowPilot API listening on port ${config.port}`);
});
