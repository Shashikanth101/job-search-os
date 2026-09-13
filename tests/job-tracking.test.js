import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { migrateJobConstraints } from '../src/migrations/001-job-constraints.js';
import { GreenhouseScraper } from '../src/scrapers/greenhouse.js';
import { INDIAN_LOCATIONS, JOB_TYPES } from '../src/jobs/fields.js';

function database() {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
  return db;
}

async function request(app, method, path, body = {}, query = {}) {
  const route = app._router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
  const result = { status: 200 };
  const response = { status(code) { result.status = code; return this; }, json(value) { result.body = value; return this; } };
  await route.route.stack[0].handle({ body, query }, response);
  return result;
}

test('migration refuses duplicates without mutating jobs or application links', () => {
  const db = database();
  db.exec("INSERT INTO jobs (title,company,apply_url) VALUES ('A','A','same'),('B','B','same'); INSERT INTO applications(job_id) VALUES(1)");
  const before = db.serialize();
  assert.throws(() => migrateJobConstraints(db), /cleanup first/);
  assert.deepEqual(db.serialize(), before);
  db.close();
});

test('migration preserves rows, relationships and sequence; enforces unique URL, enum, and default', () => {
  const db = database();
  db.pragma('foreign_keys = ON');
  db.exec("INSERT INTO jobs (id,title,company,job_type,apply_url,status) VALUES (10,'A','A','Full Time Employee','url','in_process'); INSERT INTO applications(job_id) VALUES(10)");
  migrateJobConstraints(db);
  migrateJobConstraints(db);
  assert.equal(db.prepare('SELECT job_type FROM jobs WHERE id=10').get().job_type, 'full-time');
  assert.equal(db.prepare('SELECT job_id FROM applications').get().job_id, 10);
  assert.equal(db.prepare('SELECT status FROM jobs WHERE id=10').get().status, 'in_process');
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  assert.throws(() => db.exec("INSERT INTO jobs(title,company,apply_url) VALUES('B','B','url')"), /UNIQUE constraint failed: jobs.apply_url/);
  assert.throws(() => db.exec("INSERT INTO jobs(title,company,job_type) VALUES('B','B','casual')"), /CHECK constraint/);
  db.exec("INSERT INTO jobs(title,company) VALUES('B','B')");
  assert.deepEqual(db.prepare("SELECT id,job_type FROM jobs WHERE title='B'").get(), { id: 11, job_type: 'full-time' });
  db.close();
});

test('migration refuses existing orphan references without changing rows', () => {
  const db = database();
  db.pragma('foreign_keys = OFF');
  db.exec('INSERT INTO applications(job_id) VALUES(999)');
  const before = db.serialize();
  assert.throws(() => migrateJobConstraints(db), /orphan references require cleanup/);
  assert.deepEqual(db.serialize(), before);
  db.close();
});

test('manual API persists all choices, stays visible, and handles duplicate precheck and constraint races', async (t) => {
  const db = database();
  migrateJobConstraints(db);
  const app = createApp(db);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ score: 2, reason: 'Unrelated role', location: 'India' }) } }] }) };
  });
  let index = 0;
  for (const location of [...INDIAN_LOCATIONS, 'United Kingdom']) {
    for (const job_type of JOB_TYPES) {
      const body = { title: 'Chef', company: `Test ${index}`, applyUrl: `https://example.com/${index++}`, jobDescription: 'Cooking', location, job_type };
      const saved = await request(app, 'post', '/api/jobs/manual', body);
      assert.equal(saved.status, 201);
      assert.equal(saved.body.location, location);
      assert.equal(saved.body.job_type, job_type);
      const before = calls;
      const duplicate = await request(app, 'post', '/api/jobs/manual', body);
      assert.deepEqual(duplicate, { status: 409, body: { error: 'This job is already tracked' } });
      assert.equal(calls, before);
    }
  }
  const defaults = await request(app, 'post', '/api/jobs/manual', { title: 'Default', company: 'Default', applyUrl: 'default', jobDescription: 'text' });
  assert.equal(defaults.body.location, 'India');
  assert.equal(defaults.body.job_type, 'full-time');
  const feed = await request(app, 'get', '/api/jobs', {}, { minScore: '5', location: 'india' });
  assert.equal(feed.body.length, index + 1);
  const proxy = new Proxy(db, { get(target, key) {
    if (key === 'prepare') return (sql) => sql === 'SELECT id FROM jobs WHERE apply_url = ?' ? { get() {} } : target.prepare(sql);
    return Reflect.get(target, key);
  } });
  const raced = await request(createApp(proxy), 'post', '/api/jobs/manual', { title: 'Race', company: 'Race', applyUrl: 'default', jobDescription: 'text' });
  assert.equal(raced.status, 409);
  db.close();
});

test('scraper sends raw context once per job, stores normalized locations, and skips cross-source duplicates', async (t) => {
  const db = database();
  migrateJobConstraints(db);
  const scraper = new GreenhouseScraper({ db, company: 'Test', slug: 'test' });
  const samples = ['Bengaluru, India', 'Bangalore', 'IN-Bangalore', 'Remote - India', 'London, UK'];
  const expected = ['Bengaluru', 'Bengaluru', 'Bengaluru', 'India', 'United Kingdom'];
  let calls = 0;
  t.mock.method(scraper, 'scrape', async () => ({ jobs: samples.map((location, index) => ({ id: index + 1, title: 'Frontend Engineer', location: { name: location }, content: 'React', absolute_url: `https://example.com/${index}` })) }));
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const prompt = JSON.parse(options.body).messages[1].content;
    const index = samples.findIndex((sample) => prompt.includes(`Raw location: ${sample}\n`));
    assert.ok(index >= 0);
    calls++;
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ score: 8, reason: 'Relevant', location: expected[index] }) } }] }) };
  });
  assert.equal(await scraper.run(), 5);
  assert.equal(calls, 5);
  assert.deepEqual(db.prepare('SELECT location FROM jobs ORDER BY id').all().map((row) => row.location), expected);
  assert.equal(await scraper.run(), 5); // Numeric ATS IDs must update their TEXT DB keys.
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count, 5);
  db.exec("UPDATE jobs SET source='manual' WHERE id=1");
  assert.equal(await scraper.run(), 4);
  const feed = await request(createApp(db), 'get', '/api/jobs', {}, { minScore: '5', location: 'india' });
  assert.equal(feed.body.length, 4);
  assert.ok(!feed.body.some((job) => job.location === 'United Kingdom'));
  db.close();
});
