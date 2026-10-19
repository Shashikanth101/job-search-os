import cron from 'node-cron';
import { runAllScrapers } from './scrapers/index.js';
import { rankPending } from './ranker/rank-pending.js';
import { getConfig } from './config/env.js';

export const SCRAPER_SCHEDULE = '0 9,18 * * *';
export const STALE_JOB_CLOSE_SCHEDULE = '0 9 * * 1';
const SCHEDULE_OPTIONS = { timezone: 'Asia/Kolkata' };

let cycleInFlight = false;

/**
 * Record a completed fetch cycle (used by the startup catch-up).
 * @param {import('better-sqlite3').Database} db Database connection.
 * @param {{trigger: string, startedAt: string, scrapeErrors?: number}} cycle Cycle details.
 * @returns {void}
 */
export function recordCycle(db, { trigger, startedAt, scrapeErrors = 0 }) {
  db.prepare('INSERT INTO cycle_runs (trigger, started_at, completed_at, scrape_errors) VALUES (?, ?, ?, ?)')
    .run(trigger, startedAt, new Date().toISOString(), scrapeErrors);
}

/**
 * When the last fetch cycle completed.
 * @param {import('better-sqlite3').Database} db Database connection.
 * @returns {Date|null} Completion time, or null when no cycle has been recorded.
 */
export function lastCompletedCycleAt(db) {
  const row = db.prepare('SELECT MAX(completed_at) AS completedAt FROM cycle_runs').get();
  return row?.completedAt ? new Date(row.completedAt) : null;
}

/**
 * One fetch cycle: scrape (pre-filter runs inside each scraper, no LLM), then rank pending jobs under the env-configured
 * caps. Ranking errors never crash the process. Only one cycle runs at a time per process; an overlapping call is skipped.
 * A cycle whose scrape step finished is recorded in cycle_runs unless `record` is false.
 * @param {import('better-sqlite3').Database} db Database connection.
 * @param {object} [steps] Injectable steps and options.
 * @param {Function} [steps.scrape] Scrape step (default: all scrapers).
 * @param {Function|null} [steps.rank] Rank step (default: rankPending); null skips ranking.
 * @param {string} [steps.trigger] 'cron', 'startup' or 'cli'.
 * @param {boolean} [steps.record] Record the completed cycle (default true).
 * @returns {Promise<{scrape: unknown, rank: unknown, skipped?: boolean}>} Results.
 */
export async function runScheduledCycle(db, { scrape = runAllScrapers, rank = rankPending, trigger = 'cron', record = true } = {}) {
  if (cycleInFlight) {
    console.warn(`[Scheduler] ${trigger} cycle skipped: another cycle is still running.`);
    return { scrape: undefined, rank: undefined, skipped: true };
  }
  cycleInFlight = true;
  const startedAt = new Date().toISOString();
  try {
    const scraped = await scrape(db);
    let ranked;
    if (rank) {
      try {
        ranked = await rank({ db });
      } catch (error) {
        console.error(`[Scheduler] Ranking run failed: ${error.message}`);
      }
    }
    if (record) recordCycle(db, { trigger, startedAt, scrapeErrors: Array.isArray(scraped) ? scraped.filter((result) => result?.error).length : 0 });
    return { scrape: scraped, rank: ranked };
  } finally {
    cycleInFlight = false;
  }
}

/**
 * Startup catch-up: run one cycle when the last completed cycle is older than `hours` (or none was ever recorded).
 * @param {import('better-sqlite3').Database} db Database connection.
 * @param {object} [options] Options.
 * @param {number} [options.hours] Staleness threshold in hours (default FETCH_CATCHUP_HOURS); 0 or less disables the catch-up.
 * @param {number} [options.nowMs] Clock override.
 * @param {Function} [options.cycle] Cycle runner (injectable for tests).
 * @returns {Promise<{ran: boolean, reason: string}>} Whether a cycle ran and why.
 */
export async function catchUpIfStale(db, { hours = getConfig().fetch.catchupHours, nowMs = Date.now(), cycle = runScheduledCycle } = {}) {
  if (!(hours > 0)) return { ran: false, reason: 'disabled' };
  const last = lastCompletedCycleAt(db);
  const ageHours = last ? (nowMs - last.getTime()) / 3_600_000 : Infinity;
  if (ageHours <= hours) return { ran: false, reason: `last cycle ${ageHours.toFixed(1)}h ago` };
  console.log(`[Scheduler] Catch-up: ${last ? `last completed cycle was ${ageHours.toFixed(1)}h ago` : 'no completed cycle recorded'} (threshold ${hours}h); running one cycle now.`);
  await cycle(db, { trigger: 'startup' });
  return { ran: true, reason: last ? `stale (${ageHours.toFixed(1)}h)` : 'no cycle recorded' };
}

/** Close applied jobs whose latest recorded applied date is more than 75 days old.
 * @param {import('better-sqlite3').Database} db Database connection.
 * @returns {number} Number of jobs moved to closed.
 */
export function closeStaleAppliedJobs(db) {
  const result = db.prepare(`
    UPDATE jobs
    SET status = 'closed'
    WHERE status = 'applied'
      AND datetime((
        SELECT applied_at
        FROM applications
        WHERE applications.job_id = jobs.id
        ORDER BY applications.id DESC
        LIMIT 1
      )) < datetime('now', '-75 days')
  `).run();
  const closed = Number(result.changes);
  console.log(`[Scheduler] Closed ${closed} stale applied jobs.`);
  return closed;
}

/**
 * Registers the scraper and weekly stale-job schedules in India Standard Time.
 * @param {import('better-sqlite3').Database} db Database connection.
 * @param {typeof cron} scheduler Cron API, injectable for schedule tests.
 * @returns {{ scraperTask: import('node-cron').ScheduledTask, staleJobCloseTask: import('node-cron').ScheduledTask }} Scheduled tasks.
 */
export function startScheduler(db, scheduler = cron) {
  const scraperTask = scheduler.schedule(SCRAPER_SCHEDULE, () => runScheduledCycle(db), SCHEDULE_OPTIONS);
  const staleJobCloseTask = scheduler.schedule(STALE_JOB_CLOSE_SCHEDULE, () => {
    try {
      closeStaleAppliedJobs(db);
    } catch (error) {
      console.error(`[Scheduler] Could not close stale applied jobs: ${error.message}`);
    }
  }, SCHEDULE_OPTIONS);
  return {
    scraperTask,
    staleJobCloseTask,
  };
}
