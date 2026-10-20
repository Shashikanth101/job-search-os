/**
 * Review-dashboard triage state for the two choices the coarse funnel (jobs.status) has no value for: 'saved' and
 * 'skipped'. Applying and applied live in jobs.status (in_process / applied); 'new' is the absence of a row. Idempotent.
 * @param {import('better-sqlite3').Database} database Database connection.
 * @returns {void}
 */
export function migrateJobTriage(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS job_triage (
    job_id INTEGER PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK (state IN ('saved', 'skipped')),
    updated_at TEXT NOT NULL
  )`);
}
