import './config/load-env.js';
import { createDatabase } from './db.js';
import { runAllScrapers } from './scrapers/index.js';

/**
 * Runs all configured scrapers once from the command line.
 * @returns {Promise<void>} Resolves after all scrapers finish.
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--source=workday')) throw new Error('Usage: npm run scrape -- [--source=workday]');
  const database = createDatabase();
  try {
    const results = await runAllScrapers(database, { sourcePrefix: args.includes('--source=workday') ? 'workday-' : '' });
    console.log(JSON.stringify(results, null, 2));
    if (results.some((result) => result.error)) process.exitCode = 1;
  } finally {
    database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
