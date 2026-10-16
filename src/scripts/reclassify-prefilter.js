import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createDatabase } from '../db.js';
import { PREFILTER_VERSION, evaluateJobRules } from '../scrapers/pre-filter.js';

const SAMPLE_SIZE = 40;
const TOP_COMPANIES = 15;
const SAMPLE_SEED = 12012;
const REVIEW_TITLE = /\b(?:staff|lead|manager|architect)\b/i;

/** Deterministic PRNG so the "random" sample in the report is stable across runs. */
function mulberry32(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

/**
 * Evaluate every stored job with the current pre-filter rules. Manual jobs, jobs with
 * status != 'not_applied' and jobs with interviews or outreach rows are never rejected.
 * @param {import('better-sqlite3').Database} db Database connection.
 * @returns {{total: number, decisions: Array<object>, protectedWouldReject: number}} Decisions per job.
 */
export function evaluateStoredJobs(db) {
  const hasColumns = db.prepare('PRAGMA table_info(jobs)').all().some((column) => column.name === 'prefilter_status');
  const jobs = db.prepare(`
    SELECT jobs.id, jobs.company, jobs.title, jobs.location, jobs.description, jobs.source, jobs.status,
      jobs.relevance_reason,
      ${hasColumns ? 'jobs.prefilter_status, jobs.prefilter_reason, jobs.prefilter_version' : 'NULL AS prefilter_status, NULL AS prefilter_reason, NULL AS prefilter_version'},
      (EXISTS (SELECT 1 FROM interviews WHERE interviews.job_id = jobs.id)
        OR EXISTS (SELECT 1 FROM outreach WHERE outreach.job_id = jobs.id)) AS has_activity
    FROM jobs ORDER BY jobs.id
  `).all();
  let protectedWouldReject = 0;
  const decisions = jobs.map((job) => {
    const verdict = evaluateJobRules({ ...job, source: job.source });
    const isProtected = job.source === 'manual' || job.status !== 'not_applied' || Boolean(job.has_activity);
    if (isProtected && !verdict.pass) protectedWouldReject += 1;
    const rejected = !verdict.pass && !isProtected;
    return { ...job, status_new: rejected ? 'rejected' : 'passed', reason_new: rejected ? verdict.reason : null };
  });
  return { total: jobs.length, decisions, protectedWouldReject };
}

/** Count jobs a dashboard would show (not rejected) and how many of those still have a failed ranking. */
function visibleCounts(decisions, useNew) {
  const visible = decisions.filter((job) => (useNew ? job.status_new : (job.prefilter_status ?? 'passed')) !== 'rejected');
  return {
    visible: visible.length,
    visibleRankingFailed: visible.filter((job) => /^ranking failed$/i.test(job.relevance_reason ?? '')).length,
  };
}

function buildReport({ mode, total, decisions, protectedWouldReject, before, after, backupPath }) {
  const rejected = decisions.filter((job) => job.status_new === 'rejected');
  const byReason = new Map();
  for (const job of rejected) {
    const key = job.reason_new.replace(/^years_required_\d+$/, 'years_required_N');
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }
  const byCompany = new Map();
  for (const job of rejected) byCompany.set(job.company, (byCompany.get(job.company) ?? 0) + 1);
  const random = mulberry32(SAMPLE_SEED);
  const sample = [...rejected].sort(() => random() - 0.5).slice(0, SAMPLE_SIZE);
  const reviewKept = decisions.filter((job) => job.status_new === 'passed' && REVIEW_TITLE.test(job.title));
  const lines = [
    '# Pre-filter reclassification report', '',
    `- Mode: **${mode}** (rules version ${PREFILTER_VERSION}); location is not re-evaluated (already enforced at scrape time on raw ATS data)`,
    `- Total jobs: ${total}`,
    `- Would reject: ${rejected.length}`,
    `- Protected rows that matched a reject rule but were kept (manual / status != not_applied / interviews / outreach): ${protectedWouldReject}`,
    `- Dashboard-visible before: ${before.visible} (still "Ranking failed": ${before.visibleRankingFailed})`,
    `- Dashboard-visible after: ${after.visible} (still "Ranking failed": ${after.visibleRankingFailed})`,
    backupPath ? `- Backup: \`${backupPath}\`` : '- Backup: none (dry run, nothing written)', '',
    '## Rejections by reason', '', '| Reason | Count |', '|---|---|',
    ...[...byReason].sort((a, b) => b[1] - a[1]).map(([reason, count]) => `| ${reason} | ${count} |`), '',
    `## Top ${TOP_COMPANIES} companies by rejected count`, '', '| Company | Rejected |', '|---|---|',
    ...[...byCompany].sort((a, b) => b[1] - a[1]).slice(0, TOP_COMPANIES).map(([company, count]) => `| ${company} | ${count} |`), '',
    `## ${SAMPLE_SIZE} random rejected titles (seed ${SAMPLE_SEED})`, '',
    ...sample.map((job) => `- ${job.title} — ${job.company} (${job.reason_new})`), '',
    `## Recall review: kept titles containing staff / lead / manager / architect (${reviewKept.length})`, '',
    ...reviewKept.map((job) => `- #${job.id} ${job.title} — ${job.company}`), '',
    '## Rollback SQL', '',
    '```sql',
    '-- Un-reject only (keeps verdict metadata):',
    `UPDATE jobs SET prefilter_status = 'passed', prefilter_reason = NULL WHERE prefilter_version = ${PREFILTER_VERSION} AND prefilter_status = 'rejected';`,
    '-- Full reset to the pre-reclassification state (all verdict columns were NULL):',
    'UPDATE jobs SET prefilter_status = NULL, prefilter_reason = NULL, prefilter_version = NULL, prefilter_checked_at = NULL;',
    '```',
    backupPath ? `Or restore the file backup: \`${backupPath}\`.` : '', '',
  ];
  const csv = ['id,company,title,location,reason',
    ...rejected.map((job) => [job.id, csvCell(job.company), csvCell(job.title), csvCell(job.location), job.reason_new].join(','))].join('\n');
  return { report: lines.join('\n'), csv };
}

/**
 * Run the reclassification; dry-run by default, writes only with apply: true.
 * @param {object} options Options.
 * @param {string} options.dbPath SQLite database path.
 * @param {boolean} [options.apply] Persist verdicts after taking a backup.
 * @param {string} options.outDir Directory for the report and CSV.
 * @returns {Promise<{total: number, rejected: number, updated: number, before: object, after: object, backupPath: string|null}>} Summary.
 */
export async function reclassifyPrefilter({ dbPath, apply = false, outDir }) {
  let backupPath = null;
  let db;
  if (apply) {
    const source = new Database(dbPath, { fileMustExist: true });
    backupPath = `${dbPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    try { await source.backup(backupPath); } finally { source.close(); }
    db = createDatabase(dbPath);
  } else {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  }
  try {
    const evaluation = evaluateStoredJobs(db);
    const { decisions } = evaluation;
    const before = visibleCounts(decisions, false);
    const after = visibleCounts(decisions, true);
    let updated = 0;
    if (apply) {
      const update = db.prepare(`UPDATE jobs SET prefilter_status = @status_new, prefilter_reason = @reason_new,
        prefilter_version = ${PREFILTER_VERSION}, prefilter_checked_at = CURRENT_TIMESTAMP WHERE id = @id`);
      db.transaction(() => {
        for (const job of decisions) {
          const unchanged = job.prefilter_status === job.status_new && (job.prefilter_reason ?? null) === job.reason_new
            && job.prefilter_version === PREFILTER_VERSION;
          if (unchanged) continue;
          updated += update.run(job).changes;
        }
      }).immediate();
    }
    fs.mkdirSync(outDir, { recursive: true });
    const { report, csv } = buildReport({ mode: apply ? 'apply' : 'dry-run', ...evaluation, before, after, backupPath });
    fs.writeFileSync(path.join(outDir, 'prefilter-reclassify-report.md'), report);
    fs.writeFileSync(path.join(outDir, 'prefilter-rejected.csv'), csv);
    const rejected = decisions.filter((job) => job.status_new === 'rejected').length;
    console.log(`[Reclassify] ${JSON.stringify({ mode: apply ? 'apply' : 'dry-run', total: evaluation.total, rejected, updated, before, after, backupPath })}`);
    return { total: evaluation.total, rejected, updated, before, after, backupPath };
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2);
  const valueOf = (flag) => args.find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);
  reclassifyPrefilter({
    dbPath: path.resolve(valueOf('--db') ?? process.env.DATABASE_PATH ?? './data/jobs.db'),
    apply: args.includes('--apply'),
    outDir: path.resolve(valueOf('--out') ?? 'tmp'),
  }).catch((error) => {
    console.error(`[Reclassify] ${error.message}`);
    process.exitCode = 1;
  });
}
