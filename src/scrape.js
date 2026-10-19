import './config/load-env.js';
import { assertEnv } from './config/env.js';
import { createDatabase } from './db.js';
import { runScheduledCycle } from './scheduler.js';
import { runAllScrapers } from './scrapers/index.js';

/**
 * Standalone one-pass fetch: scrape every source, pre-filter inside each scraper, then rank pending jobs under the
 * existing budget caps, job caps, run lock and circuit breaker (the same cycle the cron runs).
 * `--source=workday` limits the scrape to Workday sources (the cycle is then not recorded for the startup catch-up);
 * `--no-rank` scrapes without ranking (no LLM key needed).
 * @returns {Promise<void>} Resolves after the cycle finishes.
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--source=workday', '--no-rank'].includes(arg))) throw new Error('Usage: npm run scrape -- [--source=workday] [--no-rank]');
  const noRank = args.includes('--no-rank');
  const sourcePrefix = args.includes('--source=workday') ? 'workday-' : '';
  if (!noRank) assertEnv({ requireLlm: true });
  const database = createDatabase();
  try {
    const { scrape, rank } = await runScheduledCycle(database, {
      scrape: (db) => runAllScrapers(db, { sourcePrefix }),
      rank: noRank ? null : undefined,
      trigger: 'cli',
      record: sourcePrefix === '',
    });
    console.log(JSON.stringify({ scrape, rank: rank ?? null }, null, 2));
    if (scrape?.some((result) => result.error)) process.exitCode = 1;
  } finally {
    database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
