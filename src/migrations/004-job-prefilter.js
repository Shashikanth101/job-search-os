/**
 * Add persisted pre-filter verdict columns to jobs. Idempotent; existing rows stay NULL
 * (treated as passed until src/scripts/reclassify-prefilter.js evaluates them).
 * @param {import('better-sqlite3').Database} database Database connection.
 * @returns {void}
 */
export function migrateJobPrefilter(database) {
  const columns = new Set(database.prepare('PRAGMA table_info(jobs)').all().map((column) => column.name));
  if (!columns.has('prefilter_status')) {
    database.exec("ALTER TABLE jobs ADD COLUMN prefilter_status TEXT CHECK (prefilter_status IS NULL OR prefilter_status IN ('passed', 'rejected'))");
  }
  if (!columns.has('prefilter_reason')) database.exec('ALTER TABLE jobs ADD COLUMN prefilter_reason TEXT');
  if (!columns.has('prefilter_version')) database.exec('ALTER TABLE jobs ADD COLUMN prefilter_version INTEGER');
  if (!columns.has('prefilter_checked_at')) database.exec('ALTER TABLE jobs ADD COLUMN prefilter_checked_at DATETIME');
}
