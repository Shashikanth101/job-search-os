import '../config/load-env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { getConfig } from '../config/env.js';
import { SENIOR_TITLE_MAX_SCORE, applySeniorTitleCap } from '../ranker/index.js';

/**
 * One-time clamp of already-ranked rows whose title is Senior Staff / Sr. Staff / Principal / Distinguished to the
 * seniority cap. Backs up the database first, then updates relevance_score and relevance_reason only (the original
 * score is kept in the reason). Dry run unless `run` is true.
 * @param {object} [options] Options.
 * @param {string} [options.databasePath] Database file.
 * @param {boolean} [options.run] Apply the update (default: report only).
 * @returns {{matched: number, changed: number, backup: string|null, rows: Array<{id: number, title: string, from: number, to: number}>}} Outcome.
 */
export function clampSeniorTitles({ databasePath = getConfig().databasePath, run = false } = {}) {
  const file = path.resolve(databasePath);
  const db = new Database(file, { fileMustExist: true });
  try {
    const candidates = db.prepare(`SELECT id, title, relevance_score, relevance_reason FROM jobs WHERE rank_status = 'ranked' AND relevance_score > ?`).all(SENIOR_TITLE_MAX_SCORE);
    const rows = candidates
      .map((job) => ({ job, capped: applySeniorTitleCap(job.title, job.relevance_score, job.relevance_reason ?? '') }))
      .filter(({ capped }) => capped.clamped);
    const summary = rows.map(({ job, capped }) => ({ id: job.id, title: job.title, from: job.relevance_score, to: capped.score }));
    if (!run || !rows.length) return { matched: rows.length, changed: 0, backup: null, rows: summary };
    const backup = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}-pre-senior-clamp`;
    db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
    const update = db.prepare('UPDATE jobs SET relevance_score = @score, relevance_reason = @reason WHERE id = @id');
    let changed = 0;
    db.transaction(() => {
      for (const { job, capped } of rows) changed += update.run({ id: job.id, score: capped.score, reason: capped.reason }).changes;
    })();
    return { matched: rows.length, changed, backup, rows: summary };
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = process.argv.includes('--run');
  try {
    const result = clampSeniorTitles({ run });
    for (const row of result.rows) console.log(`  #${row.id} ${row.title}: ${row.from} -> ${row.to}`);
    console.log(`[Clamp] ${run ? `${result.changed} row(s) changed (backup ${result.backup ? path.relative(process.cwd(), result.backup) : 'none'})` : `DRY RUN: ${result.matched} row(s) would change; pass --run to apply`}.`);
  } catch (error) {
    console.error(`[Clamp] ${error.message}`);
    process.exitCode = 1;
  }
}
