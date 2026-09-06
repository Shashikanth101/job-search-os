import 'dotenv/config';
import { createDatabase } from './db.js';
import { createApp } from './app.js';
import { startScheduler } from './scheduler.js';

const database = createDatabase();
const app = createApp(database);
const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`job-search-os API listening on port ${port}`);
  startScheduler(database);
  console.log('Scrapers scheduled daily at 09:00 and 18:00 Asia/Kolkata.');
});
