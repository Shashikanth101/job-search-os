/**
 * Record of completed fetch cycles (scrape + rank), used by the startup catch-up to see how stale the data is. Idempotent.
 * @param {import('better-sqlite3').Database} database Database connection.
 * @returns {void}
 */
export function migrateCycleRuns(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS cycle_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trigger TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    scrape_errors INTEGER NOT NULL DEFAULT 0
  )`);
}
