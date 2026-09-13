import cron from 'node-cron';
import { runAllScrapers } from './scrapers/index.js';

export const SCRAPER_SCHEDULE = '0 9,18 * * *';
export const STALE_JOB_CLOSE_SCHEDULE = '0 9 * * 1';
const SCHEDULE_OPTIONS = { timezone: 'Asia/Kolkata' };

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
  const scraperTask = scheduler.schedule(SCRAPER_SCHEDULE, () => runAllScrapers(db), SCHEDULE_OPTIONS);
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
