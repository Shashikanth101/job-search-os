import os from 'node:os';

/**
 * Whether a process id is running on this machine (EPERM means it exists but belongs to another user).
 * @param {number} pid Process id.
 * @returns {boolean} True when the process exists.
 */
export function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

/**
 * Try to take a named lock. An expired lock is taken over, and so is an unexpired lock whose owner is a dead
 * process on this same host. A live lock (or one from another host) is never taken and never queued behind.
 * @param {import('better-sqlite3').Database} db Database connection.
 * @param {string} name Lock name.
 * @param {string} owner Unique owner id.
 * @param {number} ttlMs Lifetime in milliseconds.
 * @param {object} [options] Options.
 * @param {number} [options.nowMs] Clock override.
 * @param {number} [options.pid] This process id.
 * @param {string} [options.hostname] This machine's hostname.
 * @param {(pid: number) => boolean} [options.isAlive] Liveness check (injectable for tests).
 * @param {(message: string) => void} [options.log] Logger.
 * @returns {boolean} True when the lock is now held by owner.
 */
export function acquireLock(db, name, owner, ttlMs, { nowMs = Date.now(), pid = process.pid, hostname = os.hostname(), isAlive = isPidAlive, log = console.warn } = {}) {
  const acquiredAt = new Date(nowMs).toISOString();
  const values = { name, owner, acquiredAt, expiresAt: new Date(nowMs + ttlMs).toISOString(), pid, hostname };
  const taken = db.prepare(`
    INSERT INTO app_locks (name, owner, acquired_at, expires_at, pid, hostname) VALUES (@name, @owner, @acquiredAt, @expiresAt, @pid, @hostname)
    ON CONFLICT(name) DO UPDATE SET owner = excluded.owner, acquired_at = excluded.acquired_at, expires_at = excluded.expires_at,
      pid = excluded.pid, hostname = excluded.hostname
    WHERE app_locks.expires_at <= @acquiredAt
  `).run(values);
  if (taken.changes > 0) return true;

  const existing = db.prepare('SELECT owner, pid, hostname FROM app_locks WHERE name = ?').get(name);
  if (!existing || existing.pid == null || existing.hostname !== hostname || isAlive(existing.pid)) return false;
  // Compare-and-swap on the stale owner so two reclaimers cannot both win.
  const reclaimed = db.prepare(`UPDATE app_locks SET owner = @owner, acquired_at = @acquiredAt, expires_at = @expiresAt, pid = @pid, hostname = @hostname
    WHERE name = @name AND owner = @staleOwner`).run({ ...values, staleOwner: existing.owner });
  if (reclaimed.changes > 0) log(`[Locks] reclaiming stale lock from dead pid ${existing.pid}`);
  return reclaimed.changes > 0;
}

/**
 * Release a lock only if owner still holds it (another run's lock is never deleted).
 * @param {import('better-sqlite3').Database} db Database connection.
 * @param {string} name Lock name.
 * @param {string} owner Owner id used to acquire.
 * @returns {boolean} True when a row was deleted.
 */
export function releaseLock(db, name, owner) {
  return db.prepare('DELETE FROM app_locks WHERE name = ? AND owner = ?').run(name, owner).changes > 0;
}
