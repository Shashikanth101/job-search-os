import './config/load-env.js';
import { assertEnv, getConfig } from './config/env.js';
import { createDatabase } from './db.js';
import { createApp } from './app.js';
import { startScheduler } from './scheduler.js';

try {
  assertEnv({ requireLlm: true });
} catch (error) {
  console.error(`[Config] ${error.message}`);
  process.exit(1);
}

const database = createDatabase();
const app = createApp(database);
const port = getConfig().port;

app.listen(port, () => {
  console.log(`job-search-os API listening on port ${port}`);
  startScheduler(database);
  console.log('Scrapers scheduled daily at 09:00 and 18:00; stale applied jobs close weekly on Monday at 09:00 Asia/Kolkata.');
});
