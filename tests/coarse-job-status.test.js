import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { migrateCoarseJobStatus } from '../src/migrations/003-coarse-job-status.js';

function invoke(app, method, routePath, params = {}, body = {}) {
  const route = app._router.stack.find((layer) => layer.route?.path === routePath && layer.route.methods[method]);
  const result = { status: 200 };
  const response = { status(code) { result.status = code; return this; }, json(value) { result.body = value; return this; } };
  route.route.stack[0].handle({ params, body }, response);
  return result;
}

test('coarse status migration preserves jobs, maps latest application state, and creates interviews once', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE jobs (id INTEGER PRIMARY KEY, company TEXT NOT NULL, title TEXT NOT NULL);
    CREATE TABLE applications (id INTEGER PRIMARY KEY, job_id INTEGER REFERENCES jobs(id), status TEXT);
    INSERT INTO jobs VALUES (1, 'Saved Co', 'Saved'), (2, 'Applied Co', 'Applied'),
      (3, 'Followed Co', 'Followed'), (4, 'Interview Co', 'Interview'),
      (5, 'Offer Co', 'Offer'), (6, 'Rejected Co', 'Rejected'), (7, 'New Co', 'New');
    INSERT INTO applications (job_id, status) VALUES
      (1, 'saved'), (2, 'applied'), (3, 'followed_up'), (4, 'interviewing'), (5, 'offer'), (6, 'rejected');
  `);
  migrateCoarseJobStatus(db);
  migrateCoarseJobStatus(db);

  assert.deepEqual(db.prepare('SELECT id, status FROM jobs ORDER BY id').all(), [
    { id: 1, status: 'not_applied' }, { id: 2, status: 'applied' },
    { id: 3, status: 'applied' }, { id: 4, status: 'in_process' },
    { id: 5, status: 'closed' }, { id: 6, status: 'closed' },
    { id: 7, status: 'not_applied' },
  ]);
  assert.deepEqual(db.prepare('SELECT status, COUNT(*) AS count FROM interviews GROUP BY status ORDER BY status').all(), [
    { status: 'offer-received', count: 1 }, { status: 'ongoing', count: 1 },
  ]);
  assert.deepEqual(db.prepare('SELECT company_name, title, comments, contacts FROM interviews ORDER BY id').all(), [
    { company_name: 'Interview Co', title: 'Interview', comments: '', contacts: '' },
    { company_name: 'Offer Co', title: 'Offer', comments: '', contacts: '' },
  ]);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count, 7);
  assert.throws(() => db.exec("UPDATE jobs SET status='interviewing' WHERE id=1"), /CHECK constraint/);
  db.close();
});

test('status API and feed expose only the four coarse job states', () => {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
  db.exec("INSERT INTO jobs (title, company, status) VALUES ('Engineer', 'Example', 'not_applied')");
  const app = createApp(db);
  const changed = invoke(app, 'patch', '/api/jobs/:id/status', { id: '1' }, { status: 'in_process' });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.status, 'in_process');
  assert.equal(invoke(app, 'patch', '/api/jobs/:id/status', { id: '1' }, { status: 'interviewing' }).status, 400);
  const feedRoute = app._router.stack.find((layer) => layer.route?.path === '/api/jobs' && layer.route.methods.get);
  const feed = { json(value) { this.body = value; return this; } };
  feedRoute.route.stack[0].handle({ query: {} }, feed);
  assert.equal(feed.body[0].status, 'in_process');
  assert.equal(Object.hasOwn(feed.body[0], 'application_status'), false);
  db.close();
});

test('stats and follow-up reminders follow jobs.status, and completing a reminder only reschedules it', () => {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
  db.exec(`
    INSERT INTO jobs (id, title, company, status) VALUES
      (1, 'Saved', 'Example', 'not_applied'),
      (2, 'Applied', 'Example', 'applied'),
      (3, 'Interview', 'Example', 'in_process'),
      (4, 'Closed', 'Example', 'closed');
    INSERT INTO applications (job_id, applied_at, follow_up_due) VALUES
      (2, datetime('now', '-6 days'), NULL),
      (3, datetime('now', '-2 days'), datetime('now', '+2 days'));
  `);
  const app = createApp(db);
  const statsRoute = app._router.stack.find((layer) => layer.route?.path === '/api/stats' && layer.route.methods.get);
  const readStats = () => {
    const response = { json(value) { this.body = value; return this; } };
    statsRoute.route.stack[0].handle({ query: {} }, response);
    return response.body;
  };

  let stats = readStats();
  assert.equal(stats.saved_applications, 1);
  assert.equal(stats.applied_applications, 2);
  assert.deepEqual(stats.followUps.map((reminder) => reminder.job_id), [2]);
  assert.equal(stats.pending_follow_ups, 1);

  const applied = invoke(app, 'patch', '/api/jobs/:id/status', { id: '1' }, { status: 'applied' });
  assert.equal(applied.body.status, 'applied');
  stats = readStats();
  assert.equal(stats.saved_applications, 0);
  assert.equal(stats.applied_applications, 3);

  const scheduled = invoke(app, 'patch', '/api/applications/:id', { id: '1' }, {
    follow_up_due: new Date(Date.now() + (10 * 24 * 60 * 60 * 1000)).toISOString(),
  });
  assert.equal(scheduled.status, 200);
  assert.equal(Object.hasOwn(scheduled.body, 'status'), false);
  assert.equal(db.prepare('SELECT status FROM applications WHERE id=1').get().status, 'saved');
  assert.deepEqual(readStats().followUps, []);
  db.close();
});
