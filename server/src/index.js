import { createApp } from './app.js';
import { loadConfig } from './config/env.js';

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, (error) => {
  if (error) throw error;
  console.log(`FlowPilot API listening on port ${config.port}`);
});
