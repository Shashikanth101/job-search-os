/**
 * Add jobs.location_raw: the ATS location string exactly as the scraper returned it. `location` stays the normalized
 * value (ranker output or the deterministic fallback); the raw string is what the fallback derives from. Idempotent.
 * @param {import('better-sqlite3').Database} database Database connection.
 * @returns {void}
 */
export function migrateLocationRaw(database) {
  const columns = database.prepare('PRAGMA table_info(jobs)').all().map((column) => column.name);
  if (columns.length && !columns.includes('location_raw')) database.exec('ALTER TABLE jobs ADD COLUMN location_raw TEXT');
}
