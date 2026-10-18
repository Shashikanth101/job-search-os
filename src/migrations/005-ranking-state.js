const RANK_COLUMNS = [
  ['rank_status', "TEXT CHECK (rank_status IS NULL OR rank_status IN ('pending', 'ranked', 'failed', 'skipped'))"],
  ['rank_attempts', 'INTEGER DEFAULT 0'],
  ['rank_last_error', 'TEXT'],
  ['rank_next_retry_at', 'TEXT'],
  ['rank_model', 'TEXT'],
  ['rank_prompt_version', 'INTEGER'],
  ['rank_input_hash', 'TEXT'],
  ['ranked_at', 'TEXT'],
];

/**
 * Add the jobs.rank_* columns (also re-run by migration 001 after its table rebuild). Idempotent.
 * @param {import('better-sqlite3').Database} database Database connection.
 * @returns {void}
 */
export function migrateJobRankColumns(database) {
  const columns = new Set(database.prepare('PRAGMA table_info(jobs)').all().map((column) => column.name));
  for (const [name, definition] of RANK_COLUMNS) {
    if (!columns.has(name)) database.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${definition}`);
  }
}

/**
 * Add ranking state columns plus the llm_usage ledger and app_locks tables. Idempotent;
 * existing rows keep rank_status NULL until backfillRankStatus() classifies them.
 * @param {import('better-sqlite3').Database} database Database connection.
 * @returns {void}
 */
export function migrateRankingState(database) {
  migrateJobRankColumns(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS llm_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      run_id TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('rank', 'resume', 'extract', 'manual')),
      job_id INTEGER,
      model TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      est_cost_usd REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_llm_usage_ts ON llm_usage (ts);
    CREATE TABLE IF NOT EXISTS app_locks (
      name TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      acquired_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
}

/**
 * Classify rows whose rank_status is still NULL and remove fake zero scores. Idempotent:
 * only NULL-status rows are touched, so a second run changes 0 rows.
 *  - prefilter rejected          -> skipped
 *  - score 0 + "Ranking failed", or NULL score (non-manual) -> pending, score/reason NULL
 *  - everything else (real score, or manual)  -> ranked
 * @param {import('better-sqlite3').Database} database Database connection.
 * @returns {number} Number of rows changed.
 */
export function backfillRankStatus(database) {
  const fakeZero = "(relevance_score = 0 AND LOWER(COALESCE(relevance_reason, '')) = 'ranking failed')";
  return database.transaction(() => {
    let changed = 0;
    changed += database.prepare(`UPDATE jobs SET relevance_score = NULL, relevance_reason = NULL WHERE rank_status IS NULL AND ${fakeZero}`).run().changes;
    changed += database.prepare(`UPDATE jobs SET rank_status = 'skipped' WHERE rank_status IS NULL AND prefilter_status = 'rejected'`).run().changes;
    changed += database.prepare(`UPDATE jobs SET rank_status = 'pending' WHERE rank_status IS NULL AND relevance_score IS NULL`).run().changes;
    changed += database.prepare(`UPDATE jobs SET rank_status = 'ranked' WHERE rank_status IS NULL`).run().changes;
    return changed;
  }).immediate();
}
