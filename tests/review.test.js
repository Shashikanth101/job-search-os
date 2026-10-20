import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { setLlmClient } from '../src/llm/index.js';
import { rankPending } from '../src/ranker/rank-pending.js';
import { runScheduledCycle } from '../src/scheduler.js';
import { runRankCli } from '../src/scripts/rank.js';
import { createDatabase } from '../src/db.js';

const noSleep = async () => {};

function memoryDb() {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
  return db;
}

async function serve(t, db) {
  const server = createApp(db).listen(0);
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (method, route, body) => {
    const response = await fetch(`${base}${route}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
}

function seed(db) {
  const insert = db.prepare(`INSERT INTO jobs (job_id, title, company, location, location_raw, apply_url, source, found_at, relevance_score, relevance_reason,
    rank_status, rank_archetype, rank_seniority_fit, prefilter_status) VALUES (@job_id, @title, @company, @location, @location_raw, @apply_url, @source, @found_at, @score, @reason,
    @rank_status, @archetype, @seniority, @prefilter)`);
  const row = (job_id, extra) => insert.run({ job_id, title: `Job ${job_id}`, company: 'Acme', location: 'Bengaluru', location_raw: 'Bangalore, India', apply_url: `https://x/${job_id}`, source: 'greenhouse-acme',
    found_at: '2026-10-01 10:00:00', score: 8, reason: `reason ${job_id}`, rank_status: 'ranked', archetype: 'frontend', seniority: 'fit', prefilter: 'passed', ...extra }).lastInsertRowid;
  return {
    top: Number(row('top', { score: 9 })),
    newer: Number(row('newer', { found_at: '2026-10-10 10:00:00' })),
    older: Number(row('older')),
    seven: Number(row('seven', { score: 7, company: 'Beta', location: 'United States', location_raw: 'Austin, TX', archetype: 'fullstack', seniority: 'stretch' })),
    remote: Number(row('remote', { score: 7, company: 'Gammatron', location: 'United Kingdom', location_raw: 'Remote - UK' })),
    unknown: Number(row('unknown', { score: 7, location: null, location_raw: null })),
    low: Number(row('low', { score: 6 })),
    rejected: Number(row('rejected', { prefilter: 'rejected' })),
    manual: Number(row('manual', { source: 'manual' })),
    pending: Number(row('pending', { rank_status: 'pending', score: null })),
  };
}

test('review list: ranked scraped jobs with score >= 7 plus all manual jobs, never pre-filter rejects; score then newest; server-side pagination', async (t) => {
  const db = memoryDb();
  const ids = seed(db);
  const api = await serve(t, db);
  const all = await api('GET', '/api/review/jobs');
  assert.deepEqual(all.body.jobs.map((job) => job.id), [ids.top, ids.newer, ids.manual, ids.older, ids.unknown, ids.remote, ids.seven]);
  assert.deepEqual([all.body.total, all.body.page, all.body.pageSize, all.body.pages], [7, 1, 25, 1]);
  const first = all.body.jobs[0];
  assert.deepEqual([first.score, first.company, first.location, first.location_raw, first.archetype, first.seniority_fit, first.reason, first.review_status, first.location_group, first.apply_url],
    [9, 'Acme', 'Bengaluru', 'Bangalore, India', 'frontend', 'fit', 'reason top', 'new', 'india', 'https://x/top']);
  assert.ok(first.scraped_days_ago >= 1, 'days since first seen (found_at)');

  const page2 = await api('GET', '/api/review/jobs?pageSize=4&page=2');
  assert.deepEqual([page2.body.jobs.map((job) => job.id), page2.body.total, page2.body.pages], [[ids.unknown, ids.remote, ids.seven], 7, 2]);
  assert.equal((await api('GET', '/api/review/jobs?pageSize=1000')).body.pageSize, 100, 'page size is capped');

  const ids_ = async (query) => (await api('GET', `/api/review/jobs?${query}`)).body.jobs.map((job) => job.id).sort((a, b) => a - b);
  assert.deepEqual(await ids_('minScore=6'), [ids.top, ids.newer, ids.older, ids.seven, ids.remote, ids.unknown, ids.low, ids.manual].sort((a, b) => a - b));
  assert.deepEqual(await ids_('minScore=9'), [ids.top, ids.manual].sort((a, b) => a - b), 'manual jobs ignore the min-score filter');
  assert.deepEqual(await ids_('origin=manual'), [ids.manual]);
  assert.deepEqual(await ids_('origin=scraped'), [ids.top, ids.newer, ids.older, ids.seven, ids.remote, ids.unknown].sort((a, b) => a - b));
  assert.equal((await api('GET', '/api/review/jobs?origin=nope')).status, 400);
  assert.deepEqual(await ids_('archetype=fullstack'), [ids.seven]);
  assert.deepEqual(await ids_('seniority=stretch'), [ids.seven]);
  assert.deepEqual(await ids_('company=Gammatron'), [ids.remote]);
  assert.deepEqual(await ids_('locationGroup=unknown'), [ids.unknown]);
  assert.deepEqual(await ids_('locationGroup=remote'), [ids.remote]);
  assert.deepEqual(await ids_('locationGroup=other'), [ids.seven]);
  assert.deepEqual(await ids_('locationGroup=india'), [ids.top, ids.newer, ids.older, ids.manual].sort((a, b) => a - b));
  assert.deepEqual(await ids_('q=reason%20seven'), [ids.seven]);
  assert.deepEqual(await ids_('q=beta'), [ids.seven], 'text search covers the company');
  assert.equal((await api('GET', '/api/review/jobs?locationGroup=mars')).status, 400);
  assert.equal((await api('GET', '/api/review/jobs?minScore=abc')).status, 400);
  assert.equal(all.body.jobs.find((job) => job.id === ids.unknown).location_group, 'unknown', 'unknown-location jobs stay in the feed');

  const filters = (await api('GET', '/api/review/filters')).body;
  assert.deepEqual(filters.companies, ['Acme', 'Beta', 'Gammatron']);
  assert.deepEqual(filters.archetypes, ['frontend', 'fullstack']);
  db.close();
});

test('review statuses: applying/applied use the funnel, saved/skipped use triage, and applied jobs cannot be moved back', async (t) => {
  const db = memoryDb();
  const ids = seed(db);
  const api = await serve(t, db);
  const status = async (id, value) => api('PATCH', `/api/review/jobs/${id}/status`, { status: value });
  const funnel = (id) => db.prepare('SELECT status FROM jobs WHERE id = ?').get(id).status;

  assert.equal((await status(ids.top, 'saved')).body.review_status, 'saved');
  assert.equal(funnel(ids.top), 'not_applied');
  assert.equal((await status(ids.top, 'applying')).body.review_status, 'applying');
  assert.equal(funnel(ids.top), 'in_process', 'apply writes the funnel (jobs.status)');
  assert.equal((await status(ids.top, 'skipped')).body.review_status, 'skipped');
  assert.equal(funnel(ids.top), 'not_applied', 'skipping an in-process job releases the funnel');
  assert.equal((await api('GET', '/api/review/jobs?status=skipped')).body.total, 1);
  assert.equal((await api('GET', '/api/review/jobs?status=new')).body.total, 6);
  assert.equal((await status(ids.top, 'new')).body.review_status, 'new');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM job_triage').get().n, 0);

  assert.equal((await status(ids.newer, 'applied')).body.review_status, 'applied');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM applications WHERE job_id = ?').get(ids.newer).n, 1, 'an applications row is created like the manual flow does');
  assert.equal((await status(ids.newer, 'applied')).status, 200, 'idempotent');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM applications WHERE job_id = ?').get(ids.newer).n, 1);
  const blocked = await status(ids.newer, 'skipped');
  assert.equal(blocked.status, 409);
  assert.equal(funnel(ids.newer), 'applied');
  assert.equal((await status(ids.newer, 'applying')).status, 409);

  assert.equal((await status(ids.older, 'bogus')).status, 400);
  assert.equal((await status(99999, 'saved')).status, 404);
  assert.equal((await api('PATCH', '/api/review/jobs/abc/status', { status: 'saved' })).status, 400);
  db.close();
});

test('review refresh header reads the latest cycle_runs row; the review API never scrapes, pre-filters or ranks', async (t) => {
  const db = memoryDb();
  seed(db);
  let llmCalls = 0;
  setLlmClient(async () => { llmCalls += 1; throw new Error('the review API must not call the LLM'); });
  t.after(() => setLlmClient(null));
  t.mock.method(globalThis, 'fetch', globalThis.fetch);
  const api = await serve(t, db);
  assert.deepEqual((await api('GET', '/api/review/refresh')).body, { lastRefreshAt: null, daysAgo: null, trigger: null });
  const completed = new Date(Date.now() - 3 * 86_400_000 - 3_600_000).toISOString();
  db.prepare('INSERT INTO cycle_runs (trigger, started_at, completed_at) VALUES (?, ?, ?), (?, ?, ?)').run('cron', '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z', 'cli', completed, completed);
  assert.deepEqual((await api('GET', '/api/review/refresh')).body, { lastRefreshAt: completed, daysAgo: 3, trigger: 'cli' });
  const before = JSON.stringify(db.prepare('SELECT id, rank_status, relevance_score, prefilter_status FROM jobs').all());
  await api('GET', '/api/review/jobs');
  await api('POST', '/api/review/manual', { url: 'https://example.com/job/1' });
  await api('PATCH', `/api/review/jobs/1/status`, { status: 'saved' });
  assert.equal(llmCalls, 0);
  assert.equal(JSON.stringify(db.prepare('SELECT id, rank_status, relevance_score, prefilter_status FROM jobs WHERE source != ?').all('manual')), JSON.stringify(JSON.parse(before).filter((r) => r.id !== 9)), 'no feed row changed');
  db.close();
});

test('manual jobs: saved without fetching or ranking, listed with status and "not ranked yet", duplicates and bad URLs rejected', async (t) => {
  const db = memoryDb();
  let llmCalls = 0;
  setLlmClient(async () => { llmCalls += 1; throw new Error('no LLM on save'); });
  t.after(() => setLlmClient(null));
  const api = await serve(t, db);
  const fetchSpy = t.mock.method(globalThis, 'fetch', globalThis.fetch);

  assert.equal((await api('POST', '/api/review/manual', {})).status, 400);
  assert.equal((await api('POST', '/api/review/manual', { url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await api('POST', '/api/review/manual', { url: 'not a url' })).status, 400);
  const bare = await api('POST', '/api/review/manual', { url: 'https://jobs.example.com/role/7' });
  assert.equal(bare.status, 201);
  assert.deepEqual([bare.body.company, bare.body.title, bare.body.rank_status, bare.body.score, bare.body.review_status, bare.body.source], ['jobs.example.com', 'Untitled role', 'pending', null, 'new', 'manual']);
  const full = await api('POST', '/api/review/manual', { url: 'https://acme.dev/careers/1', company: ' Acme ', title: 'Frontend Engineer', location: 'Pune', description: 'React and TypeScript' });
  assert.equal(full.status, 201);
  const stored = db.prepare('SELECT * FROM jobs WHERE id = ?').get(full.body.id);
  assert.deepEqual([stored.company, stored.title, stored.location, stored.location_raw, stored.description, stored.rank_status, stored.relevance_score], ['Acme', 'Frontend Engineer', 'Pune', 'Pune', 'React and TypeScript', 'pending', null]);
  assert.equal((await api('POST', '/api/review/manual', { url: 'https://acme.dev/careers/1' })).status, 409);
  assert.equal(llmCalls, 0);
  assert.equal(fetchSpy.mock.calls.filter((call) => !String(call.arguments[0]).startsWith('http://127.0.0.1')).length, 0, 'the posting URL is never fetched');

  assert.equal((await api('PATCH', `/api/review/jobs/${full.body.id}/status`, { status: 'applying' })).body.review_status, 'applying');
  const listed = (await api('GET', '/api/review/manual')).body;
  assert.deepEqual(listed.map((job) => [job.title, job.rank_status, job.score, job.review_status]), [['Frontend Engineer', 'pending', null, 'applying'], ['Untitled role', 'pending', null, 'new']]);
  db.close();
});

test('never-ranked manual jobs are skipped by the cron cycle, rank and scrape selections; only rank:manual ranks them', async (t) => {
  const db = memoryDb();
  const insert = db.prepare("INSERT INTO jobs (job_id, title, company, description, apply_url, location, source, rank_status) VALUES (?, ?, 'Acme', 'React', ?, 'Pune', ?, ?)");
  insert.run('m1', 'Manual pending', 'https://x/m1', 'manual', 'pending');
  insert.run('m2', 'Manual failed', 'https://x/m2', 'manual', 'failed');
  insert.run('a1', 'Auto pending', 'https://x/a1', 'greenhouse-acme', 'pending');
  const titles = [];
  setLlmClient(async ({ user }) => {
    titles.push(user.match(/Title: (.*)/)[1].trim());
    return { text: JSON.stringify({ score: 6, reason: 'ok', location: null, archetype: 'frontend', seniority_fit: 'fit' }), usage: { input_tokens: 10, output_tokens: 5 } };
  });
  t.after(() => setLlmClient(null));

  const dry = await rankPending({ db, dryRun: true });
  assert.equal(dry.eligible, 1, 'dry run counts only the non-manual job');
  await rankPending({ db, sleep: noSleep, maxUsd: 100 });
  assert.deepEqual(titles, ['Auto pending']);
  await runScheduledCycle(db, { scrape: async () => [], trigger: 'cron' });
  await rankPending({ db, sleep: noSleep, maxUsd: 100, sourcePrefix: '' });
  assert.deepEqual(titles, ['Auto pending'], 'the cron cycle (scrape + rank), npm run rank and npm run scrape never rank manual jobs');
  assert.deepEqual(db.prepare("SELECT rank_status FROM jobs WHERE source = 'manual' ORDER BY id").all().map((r) => r.rank_status), ['pending', 'failed']);
  await assert.rejects(rankPending({ db, manualOnly: true, rerankVersion: 1 }), /cannot be combined/);

  const manualDry = await rankPending({ db, dryRun: true, manualOnly: true });
  assert.equal(manualDry.eligible, 2);
  assert.ok(manualDry.estimateThisRun.costMaxUsd > 0, 'worst-case cost is reported');
  assert.equal(titles.length, 1, 'dry run makes no LLM call');
  const ranked = await rankPending({ db, manualOnly: true, sleep: noSleep, maxUsd: 100 });
  assert.equal(ranked.ranked, 2);
  assert.deepEqual(titles.slice(1).sort(), ['Manual failed', 'Manual pending']);
  assert.deepEqual(db.prepare("SELECT rank_status, relevance_score FROM jobs WHERE source = 'manual'").all().map((r) => [r.rank_status, r.relevance_score]), [['ranked', 6], ['ranked', 6]]);
  db.close();
});

test('npm run rank:manual (--manual-only) is a dry run by default and reports the count and worst-case cost', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rankmanual-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'jobs.db');
  const seeded = createDatabase(file);
  seeded.prepare("INSERT INTO jobs (job_id, title, company, description, apply_url, source, rank_status) VALUES ('m1', 'Manual', 'Acme', 'React', 'https://x/m1', 'manual', 'pending'), ('a1', 'Auto', 'Acme', 'React', 'https://x/a1', 'ats', 'pending')").run();
  seeded.close();
  const previous = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = file;
  t.after(() => { if (previous === undefined) delete process.env.DATABASE_PATH; else process.env.DATABASE_PATH = previous; });
  let llmCalls = 0;
  setLlmClient(async () => { llmCalls += 1; throw new Error('dry run'); });
  t.after(() => setLlmClient(null));
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(String(line)));
  const result = await runRankCli(['--manual-only']);
  assert.deepEqual([result.dryRun, result.eligible, llmCalls], [true, 1, 0]);
  assert.ok(lines.some((line) => /eligible now: 1; this run would rank 1/.test(line)));
  assert.ok(lines.some((line) => /est cost \$[\d.]+ typical, \$[\d.]+ worst case/.test(line)));
  assert.equal(JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../package.json'), 'utf8')).scripts['rank:manual'], 'node src/scripts/rank.js --manual-only');
});

test('non-API GET paths fall back to index.html (client-side routes survive a hard refresh); /api and assets are not swallowed', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
  fs.writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log(1)');
  const db = memoryDb();
  const server = createApp(db, { frontendDist: dir }).listen(0);
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const get = async (route) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${route}`); return { status: r.status, type: r.headers.get('content-type'), text: await r.text() }; };
  for (const route of ['/', '/review', '/review/manual', '/ops', '/review/', '/anything/else']) {
    const page = await get(route);
    assert.equal(page.status, 200, route);
    assert.match(page.text, /id="root"/, route);
  }
  assert.equal((await get('/assets/app.js')).text, 'console.log(1)');
  assert.equal((await get('/assets/missing.js')).status, 404, 'a missing asset is a 404, not the SPA page');
  const api = await get('/api/review/refresh');
  assert.match(api.type, /json/);
  assert.equal((await get('/api/does-not-exist')).text.includes('id="root"'), false, 'unknown API paths never get the SPA page');
  assert.deepEqual(JSON.parse((await get('/api/review/nope')).text), { error: 'API route not found.' });
  const missing = createApp(db, { frontendDist: path.join(dir, 'nope') }).listen(0);
  t.after(() => missing.close());
  await new Promise((resolve) => missing.once('listening', resolve));
  assert.equal((await fetch(`http://127.0.0.1:${missing.address().port}/review`)).status, 404, 'a clear 404 when the frontend is not built');
  db.close();
});

test('counts and list share one filter builder: per bucket, same filters, bucket ignored, Inbox <= All, list totals equal sidebar counts', async (t) => {
  const db = memoryDb();
  const ids = seed(db);
  db.prepare("UPDATE jobs SET description = 'Full posting text' WHERE id = ?").run(ids.top);
  const api = await serve(t, db);
  const status = (id, value) => api('PATCH', `/api/review/jobs/${id}/status`, { status: value });
  await status(ids.top, 'saved');
  await status(ids.newer, 'skipped');
  await status(ids.older, 'applying');
  await status(ids.seven, 'applied');
  await status(ids.remote, 'saved');

  const filterSets = ['', 'minScore=5', 'minScore=9', 'minScore=0', 'archetype=fullstack', 'archetype=frontend,fullstack', 'locationGroup=india', 'locationGroup=unknown',
    'company=Acme', 'q=reason', 'q=beta', 'minScore=6&archetype=frontend&locationGroup=india&company=Acme&q=job'];
  for (const filters of filterSets) {
    const counts = (await api('GET', `/api/review/counts?${filters}`)).body;
    assert.ok(counts.new <= counts.all, `Inbox <= All for [${filters}]`);
    assert.equal(counts.new + counts.saved + counts.applying + counts.applied + counts.skipped + counts.closed, counts.all, `All is the union of the buckets for [${filters}]`);
    for (const bucket of ['new', 'saved', 'applying', 'applied', 'skipped']) {
      const listStatus = bucket;
      assert.equal((await api('GET', `/api/review/jobs?${filters}&status=${listStatus}`)).body.total, counts[bucket], `list total == sidebar count for ${bucket} [${filters}]`);
    }
    assert.equal((await api('GET', `/api/review/jobs?${filters}`)).body.total, counts.all, `All jobs list == All count [${filters}]`);
    assert.equal((await api('GET', `/api/review/jobs?${filters}&origin=manual`)).body.total, counts.manual, `Manual list == Manual count [${filters}]`);
  }

  const defaults = (await api('GET', '/api/review/counts')).body;
  assert.deepEqual([defaults.new, defaults.saved, defaults.applying, defaults.applied, defaults.skipped, defaults.all, defaults.manual, defaults.minScore], [2, 2, 1, 1, 1, 7, 1, 7]);
  const narrowed = (await api('GET', '/api/review/counts?archetype=fullstack')).body;
  assert.deepEqual([narrowed.all, narrowed.applied], [1, 1], 'counts apply the current filters');
  assert.deepEqual(narrowed.totals, (await api('GET', '/api/review/counts?minScore=0')).body.totals, 'totals ignore every filter');
  assert.equal(narrowed.totals.all, 8, 'bucket totals include every score');
  assert.equal((await api('GET', '/api/review/counts?minScore=x')).status, 400);
  assert.equal((await api('GET', '/api/review/counts?locationGroup=mars')).status, 400);

  const detail = (await api('GET', `/api/review/jobs/${ids.seven}`)).body;
  assert.deepEqual([detail.id, detail.review_status, detail.description, detail.application_id !== null], [ids.seven, 'applied', null, true]);
  assert.equal((await api('GET', `/api/review/jobs/${ids.top}`)).body.description, 'Full posting text');
  assert.equal((await api('GET', `/api/review/jobs/${ids.rejected}`)).status, 200, 'detail is not limited to the list population');
  assert.equal((await api('GET', '/api/review/jobs/99999')).status, 404);
  assert.equal((await api('GET', '/api/review/jobs/abc')).status, 400);
  db.close();
});

test('review API: comma-separated archetypes, company grouping, facets per view, required experience', async (t) => {
  const db = memoryDb();
  const ids = seed(db);
  db.prepare("UPDATE jobs SET description = 'We need 5+ years of experience with React.' WHERE id = ?").run(ids.top);
  db.prepare("UPDATE jobs SET description = 'Minimum 4 years of professional experience. Nice to have: 12 years of experience.' WHERE id = ?").run(ids.newer);
  db.prepare("UPDATE jobs SET description = '3-5 years of relevant experience' WHERE id = ?").run(ids.older);
  db.prepare("UPDATE jobs SET rank_archetype = 'infra' WHERE id = ?").run(ids.remote);
  const api = await serve(t, db);
  const list = async (query) => (await api('GET', `/api/review/jobs?${query}`)).body.jobs;

  assert.deepEqual((await list('archetype=fullstack,infra')).map((job) => job.id).sort((a, b) => a - b), [ids.seven, ids.remote].sort((a, b) => a - b));
  assert.deepEqual((await list('archetype=frontend,fullstack')).map((job) => job.id).includes(ids.remote), false);
  assert.deepEqual((await list('groupBy=company')).map((job) => job.company), ['Acme', 'Acme', 'Acme', 'Acme', 'Acme', 'Beta', 'Gammatron'], 'company grouping keeps a company together');
  assert.equal((await api('GET', '/api/review/jobs?groupBy=nope')).status, 400);

  const byId = Object.fromEntries((await list('')).map((job) => [job.id, job.experience]));
  assert.deepEqual([byId[ids.top], byId[ids.newer], byId[ids.older], byId[ids.seven]], ['5+ yrs', '4+ yrs', '3-5 yrs', null]);
  assert.equal('description_text' in (await list(''))[0], false, 'descriptions are not sent with list rows');
  assert.equal((await api('GET', `/api/review/jobs/${ids.top}`)).body.experience, '5+ yrs');

  const facets = (await api('GET', '/api/review/facets')).body.archetypes;
  assert.deepEqual(facets, [{ value: 'frontend', count: 5 }, { value: 'fullstack', count: 1 }, { value: 'infra', count: 1 }]);
  assert.equal(facets.some((entry) => ['data_ml'].includes(entry.value)), false, 'archetypes with no rows never appear');
  await api('PATCH', `/api/review/jobs/${ids.seven}/status`, { status: 'saved' });
  assert.deepEqual((await api('GET', '/api/review/facets?status=saved')).body.archetypes, [{ value: 'fullstack', count: 1 }]);
  assert.deepEqual((await api('GET', '/api/review/facets?origin=manual')).body.archetypes, [{ value: 'frontend', count: 1 }]);
  assert.equal((await api('GET', '/api/review/facets?status=bogus')).status, 400);

  db.close();
});

test('grouped pagination: score and company groups paginate by rows with full group sizes and a continued flag', async (t) => {
  const db = memoryDb();
  const insert = db.prepare("INSERT INTO jobs (job_id, title, company, location, apply_url, source, found_at, relevance_score, rank_status, rank_archetype) VALUES (?, ?, ?, 'Pune', ?, 'greenhouse-x', ?, ?, 'ranked', 'frontend')");
  const plan = [['Zeta', 9], ['Zeta', 9], ['Zeta', 8], ['Alpha', 8], ['Alpha', 8], ['Alpha', 7], ['Mid', 9], ['Solo', 7]];
  plan.forEach(([company, score], index) => insert.run(`j${index}`, `Job ${index}`, company, `https://x/${index}`, `2026-10-0${index + 1} 10:00:00`, score));
  const api = await serve(t, db);
  const page = async (query) => (await api('GET', `/api/review/jobs?${query}`)).body;

  const byScore = [await page('groupBy=score&pageSize=3&page=1'), await page('groupBy=score&pageSize=3&page=2'), await page('groupBy=score&pageSize=3&page=3')];
  assert.deepEqual(byScore.map((p) => p.jobs.map((job) => job.score)), [[9, 9, 9], [8, 8, 8], [7, 7]]);
  assert.deepEqual(byScore[0].groupCounts, { 9: 3, 8: 3, 7: 2 }, 'group counts are the full group sizes, not the slice');
  assert.deepEqual(byScore.map((p) => p.continued), [false, false, false]);
  const split = await page('groupBy=score&pageSize=2&page=2');
  assert.deepEqual([split.jobs.map((job) => job.score), split.continued], [[9, 8], true], 'a group that began on the previous page is marked continued');
  assert.equal(split.total, 8);

  const byCompany = [await page('groupBy=company&pageSize=3&page=1'), await page('groupBy=company&pageSize=3&page=2'), await page('groupBy=company&pageSize=3&page=3')];
  assert.deepEqual(byCompany.flatMap((p) => p.jobs.map((job) => job.company)), ['Zeta', 'Zeta', 'Zeta', 'Mid', 'Alpha', 'Alpha', 'Alpha', 'Solo'].sort(() => 0) && ['Zeta', 'Zeta', 'Zeta', 'Mid', 'Alpha', 'Alpha', 'Alpha', 'Solo']);
  assert.deepEqual(byCompany[0].groupCounts, { Zeta: 3, Mid: 1, Alpha: 3, Solo: 1 });
  assert.deepEqual(byCompany.map((p) => p.continued), [false, false, true], 'Alpha started on page 2 and continues on page 3');
  assert.deepEqual(byCompany.map((p) => p.pages), [3, 3, 3]);
  assert.equal(byCompany[1].jobs[0].company, 'Mid');
  assert.equal((await page('groupBy=none&pageSize=3')).groupCounts, null);
  db.close();
});
