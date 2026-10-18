const COLUMNS = ['rank_archetype', 'rank_seniority_fit'];

/**
 * Add the model-reported archetype and seniority fit to jobs. Idempotent; also re-run by migration 001
 * after its table rebuild.
 * @param {import('better-sqlite3').Database} database Database connection.
 * @returns {void}
 */
export function migrateRankArchetype(database) {
  const existing = new Set(database.prepare('PRAGMA table_info(jobs)').all().map((column) => column.name));
  for (const name of COLUMNS) {
    if (!existing.has(name)) database.exec(`ALTER TABLE jobs ADD COLUMN ${name} TEXT`);
  }
}
