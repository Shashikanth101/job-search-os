import cron from 'node-cron';
import { runAllScrapers } from './scrapers/index.js';

/**
 * Registers the twice-daily scraper schedule in India Standard Time.
 * @param {import('better-sqlite3').Database} db Database connection.
 * @returns {import('node-cron').ScheduledTask} Scheduled task.
 */
export function startScheduler(db) {
  return cron.schedule('0 9,18 * * *', () => runAllScrapers(db), {
    timezone: 'Asia/Kolkata'
  });
}
