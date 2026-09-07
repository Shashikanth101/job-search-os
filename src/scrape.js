import 'dotenv/config';
import { createDatabase } from './db.js';
import { runAllScrapers } from './scrapers/index.js';

/**
 * Runs all configured scrapers once from the command line.
 * @returns {Promise<void>} Resolves after all scrapers finish.
 */
async function main() {
  const database = createDatabase();
  try {
    const results = await runAllScrapers(database);
    console.log(JSON.stringify(results, null, 2));
  } finally {
    process.exit(0);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
