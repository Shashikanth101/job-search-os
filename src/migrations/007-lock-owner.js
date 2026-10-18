/**
 * Add nullable pid and hostname columns to app_locks so a dead owner on this machine can be detected.
 * Idempotent.
 * @param {import('better-sqlite3').Database} database Database connection.
 * @returns {void}
 */
export function migrateLockOwner(database) {
  const columns = new Set(database.prepare('PRAGMA table_info(app_locks)').all().map((column) => column.name));
  if (!columns.size) return;
  if (!columns.has('pid')) database.exec('ALTER TABLE app_locks ADD COLUMN pid INTEGER');
  if (!columns.has('hostname')) database.exec('ALTER TABLE app_locks ADD COLUMN hostname TEXT');
}
