import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config/env.js';
import { migrateJobResumePath } from './migrations/002-job-resume-path.js';
import { migrateCoarseJobStatus } from './migrations/003-coarse-job-status.js';
import { migrateJobPrefilter } from './migrations/004-job-prefilter.js';
import { migrateRankingState } from './migrations/005-ranking-state.js';
import { migrateRankArchetype } from './migrations/006-rank-archetype.js';
import { migrateLockOwner } from './migrations/007-lock-owner.js';

const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));

/**
 * Migrates the first scaffold's jobs table to the supplied jobs schema while
 * preserving the fields that existed in the earlier version.
 * @param {import('better-sqlite3').Database} database Database connection.
 * @returns {void}
 */
function migrateLegacyJobsTable(database) {
  const table = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'jobs'").get();
  if (!table) return;
  const columns = database.prepare('PRAGMA table_info(jobs)').all().map((column) => column.name);
  if (columns.includes('job_id')) return;

  database.exec('ALTER TABLE jobs RENAME TO jobs_legacy;');
  database.exec(fs.readFileSync(schemaPath, 'utf8'));
  database.exec(`
    INSERT INTO jobs (id, job_id, title, company, location, description, apply_url, source, found_at, posted_at, relevance_score, is_new)
    SELECT id, url, title, company, location, description, url, source, created_at, posted_at, CAST(relevance_score AS INTEGER), is_new
    FROM jobs_legacy;
    DROP TABLE jobs_legacy;
  `);
}

/**
 * Opens the SQLite database and applies the schema used by the application.
 * @param {string} databasePath Path to the SQLite database file.
 * @returns {import('better-sqlite3').Database} Configured database connection.
 */
export function createDatabase(databasePath = getConfig().databasePath) {
  const resolvedPath = path.resolve(databasePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const database = new Database(resolvedPath);
  database.pragma('journal_mode = WAL');
  migrateLegacyJobsTable(database);
  database.exec(fs.readFileSync(schemaPath, 'utf8'));
  migrateJobResumePath(database);
  migrateCoarseJobStatus(database);
  migrateJobPrefilter(database);
  migrateRankingState(database);
  migrateRankArchetype(database);
  migrateLockOwner(database);
  return database;
}

/**
 * Converts SQLite's integer boolean representation to a JSON boolean.
 * @param {Record<string, unknown> | undefined} job A database row.
 * @returns {Record<string, unknown> | null} Normalized job row.
 */
export function serializeJob(job) {
  if (!job) return null;
  return { ...job, is_new: Boolean(job.is_new) };
}
