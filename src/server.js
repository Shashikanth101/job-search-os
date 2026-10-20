import './config/load-env.js';
import { assertEnv, getConfig } from './config/env.js';
import { createDatabase } from './db.js';
import { createApp } from './app.js';
import { catchUpIfStale, startScheduler } from './scheduler.js';

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
  if (getConfig().scheduler.enabled) {
    startScheduler(database);
    catchUpIfStale(database).catch((error) => console.error(`[Scheduler] Startup catch-up failed: ${error.message}`));
    console.log('Scrapers scheduled daily at 09:00 and 18:00; stale applied jobs close weekly on Monday at 09:00 Asia/Kolkata.');
  } else {
    console.log('Scheduler disabled (SCHEDULER_ENABLED=0): the server only reads the database. Run `npm run scrape` to refresh.');
  }
});
