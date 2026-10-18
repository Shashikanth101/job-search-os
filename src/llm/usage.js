/**
 * Append one row to the llm_usage ledger. Ledger failures never break the caller.
 * @param {import('better-sqlite3').Database|undefined} db Database connection.
 * @param {object} entry Ledger fields.
 * @returns {void}
 */
export function recordUsage(db, { runId = null, kind, jobId = null, model, inputTokens = 0, outputTokens = 0, estCostUsd = 0, status, error = null }) {
  if (!db) return;
  try {
    db.prepare(`INSERT INTO llm_usage (ts, run_id, kind, job_id, model, input_tokens, output_tokens, est_cost_usd, status, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(new Date().toISOString(), runId, kind, jobId, model ?? null, inputTokens, outputTokens, estCostUsd, status,
      error ? String(error).slice(0, 500) : null);
  } catch (err) {
    console.error(`[LLM] Could not write llm_usage ledger row: ${err.message}`);
  }
}

/**
 * Sum estimated spend since local midnight (the "current day" for the daily budget).
 * @param {import('better-sqlite3').Database} db Database connection.
 * @param {Date} [now] Clock override.
 * @returns {number} USD spent today.
 */
export function dailySpendUsd(db, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  return db.prepare('SELECT COALESCE(SUM(est_cost_usd), 0) AS total FROM llm_usage WHERE ts >= ?').get(start).total;
}
