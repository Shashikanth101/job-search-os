/**
 * Add a nullable `purpose` marker to llm_usage (for example 'eval') so non-production calls are distinguishable
 * while still counting toward the daily budget. Idempotent.
 * @param {import('better-sqlite3').Database} database Database connection.
 * @returns {void}
 */
export function migrateUsagePurpose(database) {
  const columns = database.prepare('PRAGMA table_info(llm_usage)').all().map((column) => column.name);
  if (columns.length && !columns.includes('purpose')) database.exec('ALTER TABLE llm_usage ADD COLUMN purpose TEXT');
}
