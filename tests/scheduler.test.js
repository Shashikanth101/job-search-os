import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import cron from 'node-cron';
import { closeStaleAppliedJobs, startScheduler, STALE_JOB_CLOSE_SCHEDULE, SCRAPER_SCHEDULE } from '../src/scheduler.js';

function database() {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
  return db;
}

test('stale-job closure uses the latest application date and only closes applied jobs past 75 days', () => {
  const db = database();
  db.exec(`
    INSERT INTO jobs (id, title, company, status) VALUES
      (1, 'Old applied', 'Example', 'applied'),
      (2, 'Recent applied', 'Example', 'applied'),
      (3, 'Old in process', 'Example', 'in_process'),
      (4, 'No applied date', 'Example', 'applied');
    INSERT INTO applications (job_id, applied_at) VALUES
      (1, datetime('now', '-76 days')),
      (1, datetime('now', '-76 days')),
      (2, datetime('now', '-74 days')),
      (3, datetime('now', '-100 days')),
      (4, NULL);
  `);

  assert.equal(closeStaleAppliedJobs(db), 1);
  assert.deepEqual(db.prepare('SELECT id, status FROM jobs ORDER BY id').all(), [
    { id: 1, status: 'closed' },
    { id: 2, status: 'applied' },
    { id: 3, status: 'in_process' },
    { id: 4, status: 'applied' },
  ]);
  db.close();
});

test('scheduler registers the twice-daily scraper and weekly close task in India time', () => {
  assert.equal(cron.validate(SCRAPER_SCHEDULE), true);
  assert.equal(cron.validate(STALE_JOB_CLOSE_SCHEDULE), true);
  const db = database();
  const registrations = [];
  const fakeScheduler = {
    schedule(expression, callback, options) {
      const task = { expression, callback, options };
      registrations.push(task);
      return task;
    },
  };

  const tasks = startScheduler(db, fakeScheduler);
  assert.deepEqual(registrations.map(({ expression, options }) => ({ expression, options })), [
    { expression: '0 9,18 * * *', options: { timezone: 'Asia/Kolkata' } },
    { expression: '0 9 * * 1', options: { timezone: 'Asia/Kolkata' } },
  ]);
  assert.equal(tasks.scraperTask, registrations[0]);
  assert.equal(tasks.staleJobCloseTask, registrations[1]);
  db.close();
});
