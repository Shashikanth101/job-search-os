import '../config/load-env.js';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../config/env.js';
import { createDatabase } from '../db.js';
import { backfillRankStatus } from '../migrations/005-ranking-state.js';

/**
 * Back up the database, apply migration 005 and classify existing rows into rank_status. Idempotent.
 * @param {string} dbPath SQLite database path.
 * @returns {Promise<{backupPath: string, changed: number, counts: object[]}>} Result.
 */
export async function runBackfill(dbPath) {
  const source = new Database(dbPath, { fileMustExist: true });
  const backupPath = `${dbPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  try { await source.backup(backupPath); } finally { source.close(); }
  const db = createDatabase(dbPath);
  try {
    const changed = backfillRankStatus(db);
    const counts = db.prepare('SELECT rank_status, COUNT(*) AS n FROM jobs GROUP BY rank_status ORDER BY n DESC').all();
    console.log(`[Backfill] ${JSON.stringify({ backupPath, changed, counts })}`);
    return { backupPath, changed, counts };
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBackfill(path.resolve(getConfig().databasePath)).catch((error) => {
    console.error(`[Backfill] ${error.message}`);
    process.exitCode = 1;
  });
}
