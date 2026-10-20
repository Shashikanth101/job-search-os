import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getConfig } from '../src/config/env.js';
import { deriveLocation, parseNormalizedLocation } from '../src/jobs/fields.js';
import { setLlmClient } from '../src/llm/index.js';
import { rankPending } from '../src/ranker/rank-pending.js';
import { BaseScraper } from '../src/scrapers/base-scraper.js';
import { backfillLocations, planBackfill } from '../src/scripts/backfill-location.js';
import { catchUpIfStale, lastCompletedCycleAt, recordCycle, runScheduledCycle } from '../src/scheduler.js';

const noSleep = async () => {};
function memoryDb() {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
  return db;
}

class StubScraper extends BaseScraper {
  constructor(db, jobs) {
    super({ db, source: 'stub' });
    this.jobs = jobs;
  }
  async scrape() { return {}; }
  parseJobs() { return this.jobs; }
}

test('deriveLocation: simple deterministic rules, always a valid normalized value, never a guess between countries', () => {
  const cases = [
    ['Bengaluru, Karnataka, India', 'Bengaluru'], ['Bangalore', 'Bengaluru'], ['IN-Bangalore', 'Bengaluru'], ['Gurgaon, Haryana', 'Gurugram'],
    ['Navi Mumbai', 'Mumbai'], ['Remote - India', 'India'], ['New Delhi', 'India'], ['Karnataka', 'India'], ['Bengaluru; Pune', 'India'],
    ['San Francisco, CA; Bengaluru', 'Bengaluru'], ['London, United Kingdom', 'United Kingdom'], ['London, UK', 'United Kingdom'],
    ['San Francisco, CA', 'United States'], ['New York, NY, USA', 'United States'], ['Remote - US', 'United States'], ['Dubai', 'United Arab Emirates'], ['London', 'United Kingdom'], ['San Francisco', 'United States'], ['San Francisco; London', null],
    ['Singapore', 'Singapore'], ['Berlin, Germany', 'Germany'], ['Atlanta, Georgia', null], ['Albuquerque, New Mexico', null],
    ['Remote', null], ['EMEA', null], ['', null], [null, null], ['Berlin, Germany; Paris, France', null], ['Indiana', null],
  ];
  for (const [raw, expected] of cases) {
    const derived = deriveLocation(raw);
    assert.equal(derived, expected, String(raw));
    if (derived) assert.equal(parseNormalizedLocation(derived), derived, `${raw} -> a value the ranker vocabulary accepts`);
  }
});

test('saveToDb stores location_raw untouched, fills it only when missing and never lets a re-scrape change it', () => {
  const db = memoryDb();
  const posting = { job_id: 'p1', title: 'Frontend Engineer', company: 'Acme', location: ' Bangalore, Karnataka ', description: 'v1', apply_url: 'https://x/p1' };
  new StubScraper(db, [posting]).saveToDb([posting]);
  assert.equal(db.prepare('SELECT location_raw FROM jobs').get().location_raw, ' Bangalore, Karnataka ', 'verbatim');
  new StubScraper(db, []).saveToDb([{ ...posting, location: 'Elsewhere' }]);
  assert.equal(db.prepare('SELECT location_raw FROM jobs').get().location_raw, ' Bangalore, Karnataka ', 'not rewritten');
  db.prepare('UPDATE jobs SET location_raw = NULL').run();
  new StubScraper(db, []).saveToDb([{ ...posting, location: 'Pune' }]);
  assert.equal(db.prepare('SELECT location_raw FROM jobs').get().location_raw, 'Pune', 'filled when missing');
  db.close();
});

test("rank updates never overwrite a stored location with the model's null; a NULL location falls back to location_raw", async (t) => {
  const db = memoryDb();
  const insert = db.prepare("INSERT INTO jobs (job_id, title, company, location, location_raw, description, apply_url, source, rank_status, prefilter_status) VALUES (?, ?, 'Acme', ?, ?, 'React', ?, 'test', 'pending', 'passed')");
  insert.run('stored', 'Job stored', 'Pune', 'Pune, India', 'https://x/1');
  insert.run('derive', 'Job derive', null, 'Bangalore, Karnataka', 'https://x/2');
  insert.run('nothing', 'Job nothing', null, 'Remote', 'https://x/3');
  insert.run('model', 'Job model', 'Pune', 'Pune, India', 'https://x/4');
  insert.run('norw', 'Job norw', null, null, 'https://x/5');
  setLlmClient(async ({ user }) => ({
    text: JSON.stringify({ score: 6, reason: 'ok', location: user.includes('Job model') ? 'Noida' : null, archetype: 'frontend', seniority_fit: 'fit' }),
    usage: { input_tokens: 10, output_tokens: 5 },
  }));
  t.after(() => setLlmClient(null));
  await rankPending({ db, sleep: noSleep, maxUsd: 100 });
  const location = Object.fromEntries(db.prepare('SELECT job_id, location FROM jobs').all().map((row) => [row.job_id, row.location]));
  assert.deepEqual(location, { stored: 'Pune', derive: 'Bengaluru', nothing: null, model: 'Noida', norw: null });
  db.close();
});

test('planBackfill fills location_raw only where missing and derives location only where it is NULL', () => {
  const row = (id, extra) => ({ id, company: 'Acme', job_id: `j${id}`, source: 's', location: null, location_raw: null, ...extra });
  const rows = [row(1), row(2), row(3, { location: 'Pune' }), row(4, { location_raw: 'Berlin, Germany' }), row(5), row(6), row(7)];
  const raw = new Map([['Acme\u0000j1', 'Bangalore'], ['Acme\u0000j2', 'Remote'], ['Acme\u0000j3', 'Pune, India'], ['Acme\u0000j5', null], ['Acme\u0000j7', 'Bengaluru']]);
  const { rawUpdates, locationUpdates, counts, underivable } = planBackfill(rows, raw);
  assert.deepEqual(rawUpdates.map((u) => [u.id, u.location_raw]), [[1, 'Bangalore'], [2, 'Remote'], [3, 'Pune, India'], [7, 'Bengaluru']]);
  assert.deepEqual(locationUpdates.map((u) => [u.id, u.location]), [[1, 'Bengaluru'], [4, 'Germany'], [7, 'Bengaluru']]);
  assert.deepEqual([...underivable], [['Remote', 1]]);
  assert.deepEqual(counts, { rows: 7, nullLocation: 6, nullLocationSeenInScrape: 4, nullLocationWithRaw: 4, nullLocationNotSeen: 2, nullLocationEmptyRaw: 1, locationRawToFill: 4, locationDerivable: 3, locationUnderivable: 1 });
});

test('backfill dry run writes nothing; --run backs up first, fills location_raw and location, and is idempotent', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'jobs.db');
  const legacy = new Database(file);
  legacy.exec(fs.readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8').replace(/  -- ATS location string.*\n  location_raw TEXT,\n/, ''));
  legacy.prepare("INSERT INTO jobs (job_id, title, company, location, source, rank_status) VALUES ('a', 'A', 'Acme', NULL, 's', 'ranked'), ('b', 'B', 'Acme', 'Pune', 's', 'ranked')").run();
  legacy.close();
  const cachePath = path.join(dir, 'cache.json');
  fs.writeFileSync(cachePath, JSON.stringify({ fetchedAt: new Date().toISOString(), entries: [['Acme\u0000a', 'Bangalore, India'], ['Acme\u0000b', 'Pune']], errors: [] }));
  const log = () => {};

  const dry = await backfillLocations({ databasePath: file, cachePath, log });
  assert.equal(dry.usedCache, true);
  assert.deepEqual([dry.counts.nullLocation, dry.counts.locationDerivable, dry.backup], [1, 1, null]);
  const check = new Database(file, { readonly: true });
  assert.equal(check.prepare('PRAGMA table_info(jobs)').all().some((c) => c.name === 'location_raw'), false, 'dry run did not migrate');
  check.close();

  const applied = await backfillLocations({ databasePath: file, cachePath, run: true, log });
  assert.ok(applied.backup && fs.existsSync(applied.backup));
  const after = new Database(file, { readonly: true });
  assert.deepEqual(after.prepare('SELECT job_id, location, location_raw FROM jobs ORDER BY id').all(), [
    { job_id: 'a', location: 'Bengaluru', location_raw: 'Bangalore, India' }, { job_id: 'b', location: 'Pune', location_raw: 'Pune' }]);
  after.close();
  const again = await backfillLocations({ databasePath: file, cachePath, run: true, log });
  assert.deepEqual([again.rawUpdates.length, again.locationUpdates.length, again.backup], [0, 0, null]);
});

test('runScheduledCycle records completed cycles, skips an overlapping cycle and never records a failed scrape', async () => {
  const db = memoryDb();
  assert.equal(lastCompletedCycleAt(db), null);
  const order = [];
  const result = await runScheduledCycle(db, { scrape: async () => { order.push('scrape'); return [{ source: 'a', saved: 1 }, { source: 'b', saved: 0, error: 'boom' }]; }, rank: async () => { order.push('rank'); return { ranked: 1 }; }, trigger: 'cron' });
  assert.deepEqual(order, ['scrape', 'rank']);
  assert.deepEqual(result.rank, { ranked: 1 });
  const row = db.prepare('SELECT trigger, scrape_errors FROM cycle_runs').get();
  assert.deepEqual({ ...row }, { trigger: 'cron', scrape_errors: 1 });
  assert.ok(lastCompletedCycleAt(db) instanceof Date);

  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = runScheduledCycle(db, { scrape: () => gate, rank: null, trigger: 'startup' });
  const overlapping = await runScheduledCycle(db, { scrape: async () => assert.fail('must not run'), trigger: 'cron' });
  assert.equal(overlapping.skipped, true);
  release([]);
  await first;
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cycle_runs').get().n, 2);

  await assert.rejects(runScheduledCycle(db, { scrape: async () => { throw new Error('down'); } }), /down/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cycle_runs').get().n, 2, 'a failed scrape is not a completed cycle');
  const unrecorded = await runScheduledCycle(db, { scrape: async () => [], rank: null, record: false });
  assert.deepEqual(unrecorded.rank, undefined);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cycle_runs').get().n, 2);
  db.close();
});

test('startup catch-up runs one cycle only when the last completed cycle is older than FETCH_CATCHUP_HOURS', async (t) => {
  t.mock.method(console, 'log', () => {});
  const db = memoryDb();
  const calls = [];
  const cycle = async (_db, options) => { calls.push(options.trigger); };
  const now = Date.parse('2026-10-19T12:00:00Z');
  assert.equal(getConfig({}).fetch.catchupHours, 0, 'catch-up is disabled by default');
  assert.equal(getConfig({}).scheduler.enabled, false, 'scheduler is disabled by default');
  assert.equal(getConfig({ SCHEDULER_ENABLED: '1' }).scheduler.enabled, true);
  assert.equal(getConfig({ FETCH_CATCHUP_HOURS: '6' }).fetch.catchupHours, 6);

  assert.deepEqual(await catchUpIfStale(db, { hours: 12, nowMs: now, cycle }), { ran: true, reason: 'no cycle recorded' });
  db.prepare('INSERT INTO cycle_runs (trigger, started_at, completed_at) VALUES (?, ?, ?)').run('cron', '2026-10-19T00:00:00Z', '2026-10-19T02:00:00Z');
  assert.equal((await catchUpIfStale(db, { hours: 12, nowMs: now, cycle })).ran, false, '10h old is fresh');
  assert.equal((await catchUpIfStale(db, { hours: 8, nowMs: now, cycle })).ran, true, '10h old is stale for an 8h threshold');
  assert.equal((await catchUpIfStale(db, { hours: 0, nowMs: now, cycle })).reason, 'disabled');
  assert.deepEqual(calls, ['startup', 'startup']);
  recordCycle(db, { trigger: 'cli', startedAt: '2026-10-19T11:00:00Z' });
  assert.equal((await catchUpIfStale(db, { hours: 1, nowMs: Date.now(), cycle })).ran, false, 'a cycle just recorded is fresh');
  db.close();
});

test('saveToDb sets location from deriveLocation(location_raw) only when location is NULL and never overwrites a non-null one', () => {
  const db = memoryDb();
  const stub = new StubScraper(db, []);
  const posting = { job_id: 'p1', title: 'Frontend Engineer', company: 'Acme', description: 'v1', apply_url: 'https://x/p1' };
  // New row without a location: nothing to derive from.
  stub.saveToDb([{ ...posting, location: null }]);
  assert.deepEqual({ ...db.prepare('SELECT location, location_raw FROM jobs').get() }, { location: null, location_raw: null });
  // Re-scrape now returns an ATS string: raw is filled and the NULL location derived.
  stub.saveToDb([{ ...posting, location: 'Bangalore, Karnataka' }]);
  assert.deepEqual({ ...db.prepare('SELECT location, location_raw FROM jobs').get() }, { location: 'Bengaluru', location_raw: 'Bangalore, Karnataka' });
  // A non-null location (normalized by the ranker or by hand) is never overwritten.
  db.prepare("UPDATE jobs SET location = 'Pune'").run();
  stub.saveToDb([{ ...posting, location: 'Hyderabad, India' }]);
  assert.equal(db.prepare('SELECT location FROM jobs').get().location, 'Pune');
  // Undecidable raw strings leave NULL alone.
  db.prepare('UPDATE jobs SET location = NULL, location_raw = NULL').run();
  stub.saveToDb([{ ...posting, location: 'Remote' }]);
  assert.deepEqual({ ...db.prepare('SELECT location, location_raw FROM jobs').get() }, { location: null, location_raw: 'Remote' });
  // A brand-new row with a raw string keeps it as its location until the ranker normalizes it (existing behavior).
  stub.saveToDb([{ ...posting, job_id: 'p2', apply_url: 'https://x/p2', location: 'Bangalore' }]);
  assert.equal(db.prepare("SELECT location FROM jobs WHERE job_id = 'p2'").get().location, 'Bangalore');
  db.close();
});

test('backfill --no-network never fetches and derives NULL locations from the stored location_raw only', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-nn-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'jobs.db');
  const db = new Database(file);
  db.exec(fs.readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
  db.prepare("INSERT INTO jobs (job_id, title, company, location, location_raw, source) VALUES ('a', 'A', 'Acme', NULL, 'Pune, India', 's'), ('b', 'B', 'Acme', NULL, 'Remote', 's'), ('c', 'C', 'Acme', 'Noida', 'Noida', 's'), ('d', 'D', 'Acme', NULL, NULL, 's')").run();
  db.close();
  t.mock.method(globalThis, 'fetch', async () => assert.fail('no network'));
  const log = () => {};
  const dry = await backfillLocations({ databasePath: file, network: false, cachePath: path.join(dir, 'none.json'), log });
  assert.deepEqual([dry.locationUpdates.map((u) => [u.id, u.location]), dry.backup], [[[1, 'Pune']], null]);
  const applied = await backfillLocations({ databasePath: file, network: false, run: true, cachePath: path.join(dir, 'none.json'), log });
  assert.ok(applied.backup);
  const check = new Database(file, { readonly: true });
  assert.deepEqual(check.prepare('SELECT job_id, location FROM jobs ORDER BY id').all().map((r) => [r.job_id, r.location]), [['a', 'Pune'], ['b', null], ['c', 'Noida'], ['d', null]]);
  check.close();
  assert.equal(fs.existsSync(path.join(dir, 'none.json')), false, 'no cache is written');
});
