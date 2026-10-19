import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { EventEmitter } from 'node:events';
import Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { callLlm, LlmError, setLlmClient } from '../src/llm/index.js';
import { backfillRankStatus } from '../src/migrations/005-ranking-state.js';
import { acquireLock } from '../src/locks.js';
import { rankPending } from '../src/ranker/rank-pending.js';
import { PROMPT_VERSION, RankOutputError, SYSTEM_PROMPT, parseRankOutput } from '../src/ranker/index.js';
import { BaseScraper } from '../src/scrapers/base-scraper.js';
import { runScheduledCycle, startScheduler } from '../src/scheduler.js';

const noSleep = async () => {};
const reply = (score = 8, usage = { input_tokens: 100, output_tokens: 20 }) => ({ text: JSON.stringify({ score, reason: 'fit', location: 'Bengaluru' }), usage });

function memoryDb() {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
  return db;
}

function addJobs(db, count, extra = "rank_status = 'pending'") {
  const insert = db.prepare("INSERT INTO jobs (job_id, title, company, location, description, apply_url, source, rank_status, prefilter_status) VALUES (?, ?, 'Acme', 'Bengaluru, India', 'React', ?, 'test', 'pending', 'passed')");
  const ids = [];
  const offset = db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n;
  for (let i = offset; i < offset + count; i += 1) ids.push(Number(insert.run(`j${i}`, `Frontend Engineer ${i}`, `https://x/${i}`).lastInsertRowid));
  if (extra !== "rank_status = 'pending'") db.exec(`UPDATE jobs SET ${extra}`);
  return ids;
}

function useClient(t, handler) {
  const calls = [];
  setLlmClient(async (request) => {
    calls.push(request);
    return handler(request, calls.length);
  });
  t.after(() => setLlmClient(null));
  return calls;
}

const snapshot = (db) => db.prepare('SELECT * FROM jobs ORDER BY id').all();

class StubScraper extends BaseScraper {
  constructor(db, jobs) {
    super({ db, source: 'stub' });
    this.jobs = jobs;
  }
  async scrape() { return {}; }
  parseJobs() { return this.jobs; }
}

test('re-scraping ranked and pending jobs makes 0 LLM calls and changes no rank_*, relevance_* or prefilter_* field', async (t) => {
  const db = memoryDb();
  const calls = useClient(t, () => reply(9));
  const posting = { job_id: 'p1', title: 'Frontend Engineer', company: 'Acme', location: 'Bengaluru', description: 'v1', apply_url: 'https://x/p1' };
  const scraper = new StubScraper(db, [posting]);
  await scraper.run();
  assert.deepEqual(db.prepare('SELECT rank_status, relevance_score FROM jobs').get(), { rank_status: 'pending', relevance_score: null });
  await rankPending({ db, sleep: noSleep });
  assert.equal(calls.length, 1);
  const before = snapshot(db)[0];
  scraper.jobs = [{ ...posting, description: 'v2', title: 'Frontend Engineer II', location: 'Elsewhere' }];
  await scraper.run();
  await rankPending({ db, sleep: noSleep });
  assert.equal(calls.length, 1);
  const after = snapshot(db)[0];
  for (const key of Object.keys(before).filter((k) => /^(rank_|relevance_|prefilter_|ranked_at|location|status|source)/.test(k))) assert.equal(after[key], before[key], key);
  assert.equal(after.description, 'v2');
  db.close();
});

test('a 402 on the first call aborts the run, leaves every job pending and writes no zero scores', async (t) => {
  const db = memoryDb();
  addJobs(db, 6);
  const calls = useClient(t, () => { throw new LlmError('LLM API error (402): credit balance too low', { status: 402, kind: 'quota' }); });
  const result = await rankPending({ db, concurrency: 1, sleep: noSleep });
  assert.equal(calls.length, 1);
  assert.equal(result.aborted, true);
  assert.match(result.abortReason, /quota/);
  assert.deepEqual(db.prepare("SELECT rank_status, relevance_score, COUNT(*) AS n FROM jobs GROUP BY 1, 2").all(), [{ rank_status: 'pending', relevance_score: null, n: 6 }]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM app_locks').get().n, 0, 'lock released');
  db.close();
});

test('five consecutive transient failures trip the circuit breaker; jobs stay pending', async (t) => {
  const db = memoryDb();
  addJobs(db, 8);
  const calls = useClient(t, () => { throw new LlmError('boom', { status: 503, kind: 'server' }); });
  const result = await rankPending({ db, concurrency: 1, sleep: noSleep });
  assert.equal(result.abortReason, 'circuit_breaker_consecutive_failures');
  assert.equal(calls.length, 15, '5 jobs x (1 try + 2 in-run retries)');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE rank_status = 'pending' AND relevance_score IS NULL").get().n, 8);
  db.close();
});

test('maxJobs, the daily USD cap, a held lock and the kill switch each stop ranking', async (t) => {
  const db = memoryDb();
  addJobs(db, 10);
  const calls = useClient(t, () => reply(7));
  assert.equal((await rankPending({ db, maxJobs: 3, sleep: noSleep })).ranked, 3);
  assert.equal(calls.length, 3);

  process.env.LLM_MODEL = 'claude-haiku-5-5';
  t.after(() => { delete process.env.LLM_MODEL; delete process.env.LLM_DISABLED; });
  setLlmClient(async () => { calls.push({}); return reply(7, { input_tokens: 1_000_000, output_tokens: 0 }); }); // $0.10 per call
  const before = calls.length;
  const capped = await rankPending({ db, maxUsd: 0.25, concurrency: 1, sleep: noSleep });
  assert.equal(calls.length - before, 3);
  assert.equal(capped.abortReason, 'daily_budget_reached');
  const stopped = calls.length;
  assert.equal((await rankPending({ db, maxUsd: 0.25, sleep: noSleep })).ranked, 0, 'budget already spent today');

  assert.equal(acquireLock(db, 'rank', 'other-run', 60_000), true);
  assert.equal((await rankPending({ db, maxUsd: 100, sleep: noSleep })).skipped, 'locked');
  db.prepare("UPDATE app_locks SET expires_at = '2000-01-01T00:00:00.000Z'").run();
  assert.equal((await rankPending({ db, maxUsd: 100, sleep: noSleep })).skipped, null, 'expired lock is taken over');

  process.env.LLM_DISABLED = '1';
  addJobs(db, 1);
  const disabled = await rankPending({ db, maxUsd: 100, sleep: noSleep });
  assert.equal(disabled.skipped, 'disabled');
  assert.ok(calls.length >= stopped);
  db.close();
});

test('the worker pool never exceeds the concurrency limit', async (t) => {
  const db = memoryDb();
  addJobs(db, 12);
  let active = 0;
  let peak = 0;
  useClient(t, async () => {
    active += 1;
    peak = Math.max(peak, active);
    await delay(5);
    active -= 1;
    return reply();
  });
  const result = await rankPending({ db, concurrency: 3, maxUsd: 100, sleep: noSleep });
  assert.equal(result.ranked, 12);
  assert.equal(peak, 3);
  assert.equal(result.maxConcurrent, 3);
  db.close();
});

test('invalid JSON retries in-run, then marks failed with backoff and honors RANK_MAX_ATTEMPTS; transient errors stay pending', async (t) => {
  const db = memoryDb();
  const [id] = addJobs(db, 1);
  const calls = useClient(t, () => ({ text: 'not json', usage: { input_tokens: 5, output_tokens: 5 } }));
  await rankPending({ db, maxUsd: 100, sleep: noSleep });
  assert.equal(calls.length, 3);
  let row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  assert.equal(row.rank_status, 'failed');
  assert.equal(row.rank_attempts, 1);
  assert.equal(row.relevance_score, null);
  assert.ok(row.rank_next_retry_at > new Date().toISOString());
  await rankPending({ db, maxUsd: 100, sleep: noSleep });
  assert.equal(calls.length, 3, 'not retried before rank_next_retry_at');
  for (const expected of [2, 3]) {
    db.prepare("UPDATE jobs SET rank_next_retry_at = '2000-01-01T00:00:00.000Z'").run();
    await rankPending({ db, maxUsd: 100, sleep: noSleep });
    assert.equal(db.prepare('SELECT rank_attempts FROM jobs WHERE id = ?').get(id).rank_attempts, expected);
  }
  db.prepare("UPDATE jobs SET rank_next_retry_at = '2000-01-01T00:00:00.000Z'").run();
  await rankPending({ db, maxUsd: 100, sleep: noSleep });
  assert.equal(calls.length, 9, 'exhausted after RANK_MAX_ATTEMPTS');

  const [other] = addJobs(db, 1);
  let n = 0;
  setLlmClient(async () => { n += 1; throw new LlmError('slow down', { status: 429, kind: 'rate_limit' }); });
  await rankPending({ db, maxUsd: 100, sleep: noSleep });
  assert.equal(n, 3, '1 try + 2 retries');
  row = db.prepare('SELECT rank_status, rank_attempts, relevance_score FROM jobs WHERE id = ?').get(other);
  assert.deepEqual(row, { rank_status: 'pending', rank_attempts: 0, relevance_score: null });
  db.close();
});

test('ranked and skipped jobs are never selected; --rerank-version re-ranks only older prompt versions', async (t) => {
  const db = memoryDb();
  const ids = addJobs(db, 3);
  db.prepare("UPDATE jobs SET rank_status = 'ranked', relevance_score = 6, rank_prompt_version = NULL WHERE id = ?").run(ids[0]);
  db.prepare("UPDATE jobs SET rank_status = 'skipped' WHERE id = ?").run(ids[1]);
  const calls = useClient(t, () => reply(9));
  await rankPending({ db, maxUsd: 100, sleep: noSleep });
  assert.equal(calls.length, 1);
  assert.equal(db.prepare('SELECT relevance_score FROM jobs WHERE id = ?').get(ids[0]).relevance_score, 6);
  const rerank = await rankPending({ db, maxUsd: 100, rerankVersion: 1, sleep: noSleep });
  assert.equal(rerank.ranked, 1);
  assert.equal(db.prepare('SELECT relevance_score, rank_prompt_version FROM jobs WHERE id = ?').get(ids[0]).relevance_score, 9);
  await assert.rejects(rankPending({ db, rerankVersion: 99 }), /PROMPT_VERSION/);
  db.close();
});

test('dry run makes no LLM call, takes no lock and reports estimates', async (t) => {
  const db = memoryDb();
  addJobs(db, 4);
  const calls = useClient(t, () => reply());
  const result = await rankPending({ db, dryRun: true });
  assert.equal(calls.length, 0);
  assert.equal(result.eligible, 4);
  assert.ok(result.estimateAllEligible.inputTokens > 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM app_locks').get().n, 0);
  db.close();
});

test('every GET route, scheduler registration and startup path makes 0 LLM calls', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rank-'));
  const db = createDatabase(path.join(dir, 'jobs.db'));
  addJobs(db, 2);
  let llm = 0;
  setLlmClient(async () => { llm += 1; return reply(); });
  t.after(() => setLlmClient(null));
  t.mock.method(globalThis, 'fetch', async () => { llm += 1; throw new Error('network'); });
  const app = createApp(db);
  startScheduler(db, { schedule: () => ({}) });
  for (const layer of app._router.stack.filter((entry) => entry.route?.methods.get)) {
    await layer.route.stack[0].handle({ params: { id: '1' }, query: {}, body: {} },
      { status() { return this; }, json() { return this; }, sendFile() { return this; } });
  }
  assert.equal(llm, 0);
  db.close();
});

test('the real client refuses to run during tests unless explicitly mocked', async () => {
  setLlmClient(null);
  await assert.rejects(callLlm('s', 'u'), (error) => error instanceof LlmError && /disabled during tests/.test(error.message));
});

test('backfill classifies legacy rows, removes fake zeros, and is idempotent', () => {
  const db = memoryDb();
  const insert = db.prepare("INSERT INTO jobs (job_id, title, company, source, relevance_score, relevance_reason, prefilter_status) VALUES (?, 't', 'c', ?, ?, ?, ?)");
  insert.run('real', 'test', 7, 'good', 'passed');
  insert.run('fake', 'test', 0, 'Ranking failed', 'passed');
  insert.run('null', 'test', null, null, null);
  insert.run('rejected', 'test', 0, 'Ranking failed', 'rejected');
  insert.run('manual', 'manual', 3, 'meh', null);
  assert.equal(backfillRankStatus(db) > 0, true);
  assert.deepEqual(db.prepare('SELECT job_id, rank_status, relevance_score, relevance_reason FROM jobs ORDER BY id').all(), [
    { job_id: 'real', rank_status: 'ranked', relevance_score: 7, relevance_reason: 'good' },
    { job_id: 'fake', rank_status: 'pending', relevance_score: null, relevance_reason: null },
    { job_id: 'null', rank_status: 'pending', relevance_score: null, relevance_reason: null },
    { job_id: 'rejected', rank_status: 'skipped', relevance_score: null, relevance_reason: null },
    { job_id: 'manual', rank_status: 'ranked', relevance_score: 3, relevance_reason: 'meh' },
  ]);
  assert.equal(backfillRankStatus(db), 0);
  db.close();
});

test('manual API keeps the job pending with no zero score on infrastructure errors; stats exclude rejected jobs', async (t) => {
  const db = memoryDb();
  useClient(t, () => { throw new LlmError('LLM API error (402)', { status: 402, kind: 'quota' }); });
  const app = createApp(db);
  const call = async (method, route, body = {}) => {
    const result = { status: 200 };
    const layer = app._router.stack.find((entry) => entry.route?.path === route && entry.route.methods[method]);
    await layer.route.stack[0].handle({ body, query: {}, params: {} }, { status(code) { result.status = code; return this; }, json(value) { result.body = value; return this; } });
    return result;
  };
  const saved = await call('post', '/api/jobs/manual', { company: 'M', title: 'Frontend Engineer', jobDescription: 'React', applyUrl: 'https://m/1' });
  assert.equal(saved.status, 201);
  assert.equal(saved.body.relevance_score, null);
  assert.equal(saved.body.rank_status, 'pending');

  addJobs(db, 2);
  db.exec("UPDATE jobs SET prefilter_status = 'rejected' WHERE job_id = 'j1'");
  assert.equal((await call('get', '/api/stats')).body.total_jobs, 2, 'manual + one kept; rejected excluded');
  db.close();
});

test('Anthropic transport: no temperature, text blocks only, thinking tokens counted, truncation and credit-balance 400 classified', async (t) => {
  setLlmClient(null);
  process.env.LLM_PROVIDER = 'anthropic';
  process.env.LLM_API_KEY = 'test-key';
  process.env.LLM_MODEL = 'claude-haiku-5-5';
  t.after(() => { for (const key of ['LLM_PROVIDER', 'LLM_API_KEY', 'LLM_MODEL']) delete process.env[key]; });
  const bodies = [];
  let next;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return next;
  });
  const json = (value, status = 200) => ({ ok: status < 300, status, json: async () => value, text: async () => JSON.stringify(value) });

  next = json({ content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: '{"score":' }, { type: 'text', text: ' 7}' }], stop_reason: 'end_turn',
    usage: { input_tokens: 1000, output_tokens: 50, output_tokens_details: { thinking_tokens: 30 } } });
  const ok = await callLlm('s', 'u', { maxTokens: 400, temperature: 0 });
  assert.equal(ok.text, '{"score": 7}');
  assert.equal(ok.usage.output_tokens, 50);
  assert.equal('temperature' in bodies[0], false);
  assert.equal(bodies[0].max_tokens, 400);

  next = json({ content: [{ type: 'text', text: '{"score": 7' }], stop_reason: 'max_tokens', usage: { input_tokens: 1, output_tokens: 400 } });
  assert.equal((await callLlm('s', 'u')).truncated, true);

  next = json({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the API.' } }, 400);
  await assert.rejects(callLlm('s', 'u'), (error) => error.kind === 'quota' && /invalid_request_error: Your credit balance/.test(error.message) && !/test-key/.test(error.message));
});

test('archetype and seniority_fit are persisted when valid and stored NULL when invalid, without rejecting the score', async (t) => {
  const db = memoryDb();
  const [first, second] = addJobs(db, 2);
  let n = 0;
  useClient(t, () => {
    n += 1;
    const body = n === 1
      ? { score: 8, reason: 'ok', location: 'Bengaluru', archetype: 'frontend', seniority_fit: 'fit' }
      : { score: 6, reason: 'ok', location: 'Bengaluru', archetype: 'wizard', seniority_fit: 'huge' };
    return { text: JSON.stringify(body), usage: { input_tokens: 1, output_tokens: 1 } };
  });
  await rankPending({ db, concurrency: 1, sleep: noSleep });
  assert.deepEqual(db.prepare('SELECT relevance_score, rank_archetype, rank_seniority_fit, rank_prompt_version FROM jobs WHERE id = ?').get(first),
    { relevance_score: 8, rank_archetype: 'frontend', rank_seniority_fit: 'fit', rank_prompt_version: PROMPT_VERSION });
  assert.deepEqual(db.prepare('SELECT relevance_score, rank_archetype, rank_seniority_fit, rank_status FROM jobs WHERE id = ?').get(second),
    { relevance_score: 6, rank_archetype: null, rank_seniority_fit: null, rank_status: 'ranked' });
  db.close();
});

test('thinking is disabled only when explicitly opted in, for Anthropic ranking calls', async (t) => {
  setLlmClient(null);
  Object.assign(process.env, { LLM_PROVIDER: 'anthropic', LLM_API_KEY: 'k', LLM_MODEL: 'claude-haiku-5-5' });
  t.after(() => { for (const key of ['LLM_PROVIDER', 'LLM_API_KEY', 'LLM_MODEL', 'LLM_ANTHROPIC_DISABLE_THINKING']) delete process.env[key]; });
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 } }) };
  });
  await callLlm('s', 'u', { disableThinking: true });
  process.env.LLM_ANTHROPIC_DISABLE_THINKING = '1';
  await callLlm('s', 'u', { disableThinking: true });
  await callLlm('s', 'u');
  assert.deepEqual(bodies.map((body) => body.thinking ?? null), [null, { type: 'disabled' }, null]);
});

test('invalid JSON stores a single-line sample (max 200 chars) in rank_last_error; max tokens default is 600', async (t) => {
  const db = memoryDb();
  const [id] = addJobs(db, 1);
  const requests = useClient(t, () => ({ text: `Sorry,\nI cannot\tanswer ${'x'.repeat(400)}`, usage: { input_tokens: 5, output_tokens: 5 } }));
  await rankPending({ db, maxUsd: 100, sleep: noSleep });
  const row = db.prepare('SELECT rank_status, rank_last_error FROM jobs WHERE id = ?').get(id);
  assert.equal(row.rank_status, 'failed');
  assert.match(row.rank_last_error, /^Model output was not valid JSON: Sorry, I cannot answer x+$/);
  assert.ok(!/[\n\t]/.test(row.rank_last_error));
  assert.equal(row.rank_last_error.length, 'Model output was not valid JSON: '.length + 200);
  assert.equal(requests[0].maxTokens, 600);
  db.close();
});

test('JSON extraction: prose or fences around the object, braces inside strings, stray braces, and failures', () => {
  const ok = '{"score": 6, "reason": "Brace } in { text", "location": null, "archetype": "frontend", "seniority_fit": "fit"}';
  const cases = [
    [ok, 6],
    [`The description is truncated, so I scored from the title.\n${ok}\nHope that helps.`, 6],
    [`\`\`\`json\n${ok}\n\`\`\``, 6],
    [`Noted {not json} first. ${ok}`, 6],
    ['{"score": 3, "reason": "nested ok", "extra": {"a": {"b": 1}}}', 3],
  ];
  for (const [text, score] of cases) assert.equal(parseRankOutput(text).score, score, text.slice(0, 40));
  assert.equal(parseRankOutput(ok).reason, 'Brace } in { text');
  for (const bad of ['The description is truncated.', '{"score": 7, "reason": "cut off', '', '{"score": 99, "reason": "x"}']) {
    assert.throws(() => parseRankOutput(bad), RankOutputError, bad);
  }
  assert.match(SYSTEM_PROMPT, /Always reply with the JSON object only/);
});

test('prompt v8 content (v6 generic-title rule, v7 HARD RULES, v8 hands-on customer-facing rule): employer-based company signal, customer-facing technical roles, new calibration examples', () => {
  assert.equal(PROMPT_VERSION, 8);
  const handsOn = 'Hands-on customer-facing AI roles (Applied AI, Solutions, Deployed, Forward Deployed) at AI labs or product companies: partnering with account executives, translating customer requirements, workshops and conference talks do not make a role pre-sales. If the duties include building pilots, prototypes, eval suites, agents or code reviews with customer engineers, score 7-8. A Python or ML emphasis lowers the score by at most 1 for these roles. Roles whose duties are mainly pre-sales demos, account management, executive value cases, training delivery or project management with no hands-on building stay at 3-4.';
  const at = SYSTEM_PROMPT.indexOf(handsOn);
  assert.ok(at > SYSTEM_PROMPT.indexOf('Customer-facing technical roles at product or AI companies (Applied AI') && at < SYSTEM_PROMPT.indexOf('HARD RULES'), 'v8 hands-on rule sits under the customer-facing guidance');
  assert.ok(SYSTEM_PROMPT.includes('Generic titles (Software Engineer, SDE, Senior Software Engineer) with no stack information in the text: score 5, not lower. Score 3 or below only with positive evidence of a mismatch, such as a Java, Go, C++ or Python-primary backend, data, infra or hardware work.'));
  const hard = SYSTEM_PROMPT.indexOf('HARD RULES');
  assert.ok(hard > 0 && hard < SYSTEM_PROMPT.indexOf('SCORING (1-10)'), 'HARD RULES come before the scoring bands');
  for (const phrase of ['People-management roles (the job manages engineers or teams, titles such as Manager, Senior Manager, Head, Director, Engineering Manager) score 1, regardless of company, domain or stack.',
    'Required experience of 10 or more years, or titles Senior Staff, Sr. Staff, Principal or Distinguished: the score cannot exceed 5.',
    "Never adjust the score for the job's location."]) {
    const at = SYSTEM_PROMPT.indexOf(phrase);
    assert.ok(at > hard && at < SYSTEM_PROMPT.indexOf('SCORING (1-10)'), phrase);
  }
  assert.ok(!SYSTEM_PROMPT.includes('score 1-2.\nUse the full range') && SYSTEM_PROMPT.includes('score 1 (see HARD RULES)'), 'no conflicting 1-2 people-management line');
  assert.ok(SYSTEM_PROMPT.indexOf('Generic titles') > SYSTEM_PROMPT.indexOf('ADJUSTMENTS') && SYSTEM_PROMPT.indexOf('Generic titles') < SYSTEM_PROMPT.indexOf('CALIBRATION EXAMPLES'));
  for (const phrase of ['judge the employer, not the job title', 'never lower a score because the title contains Consultant',
    'TCS, Infosys, Accenture, Capgemini, Cognizant, Wipro', 'Score them like FDE roles (7-9 when the stack fits)',
    'mainly sales support, pre-sales demos, account management, training delivery or project management',
    'Applied AI Engineer at an AI lab: customer pilots, prototypes, eval suites, code reviews with customer engineers -> 8',
    'Technical Consultant at a large IT services firm -> 3']) assert.ok(SYSTEM_PROMPT.includes(phrase), phrase);
  assert.ok(!SYSTEM_PROMPT.includes('IT services, consulting, outsourcing and staffing companies score at most 4.'));
  assert.ok(SYSTEM_PROMPT.includes('"score": <integer 1-10>') && SYSTEM_PROMPT.includes('NORMALIZED LOCATION'));
});

function seedRanked(db) {
  const insert = db.prepare(`INSERT INTO jobs (job_id, title, company, location, description, apply_url, source, rank_status, prefilter_status,
    relevance_score, relevance_reason, rank_archetype, rank_prompt_version) VALUES (?, ?, 'Acme', 'Bengaluru', 'React', ?, ?, ?, ?, ?, 'old', ?, ?)`);
  const rows = [
    // [key, source, rank_status, prefilter, score, archetype, version]
    ['s9', 'test', 'ranked', 'passed', 9, 'frontend', 4],
    ['s5', 'test', 'ranked', 'passed', 5, 'backend', 4],
    ['s3', 'test', 'ranked', 'passed', 3, 'infra', 4],
    ['s2fde', 'test', 'ranked', 'passed', 2, 'fde_applied_ai', 4],
    ['s2other', 'test', 'ranked', 'passed', 2, 'other', 4],
    ['s1', 'test', 'ranked', 'passed', 1, 'backend', 4],
    ['s8old', 'test', 'ranked', 'passed', 8, 'fullstack', null],
    ['v5', 'test', 'ranked', 'passed', 9, 'frontend', 5],
    ['man', 'manual', 'ranked', 'passed', 9, 'frontend', 4],
    ['rej', 'test', 'skipped', 'rejected', 9, 'frontend', 4],
  ];
  const ids = {};
  rows.forEach(([key, source, status, prefilter, score, archetype, version], index) => {
    ids[key] = Number(insert.run(key, `Title ${key}`, `https://r/${index}`, source, status, prefilter, score, archetype, version).lastInsertRowid);
  });
  return ids;
}

const eligibleKeys = async (db, options) => {
  const result = await rankPending({ db, dryRun: true, rerankVersion: 5, ...options });
  return result;
};

test('targeted re-rank filter: score OR archetype, manual/rejected/current-version rows excluded, no flags unchanged', async () => {
  const db = memoryDb();
  seedRanked(db);
  const names = (rows) => rows.map((row) => row.job_id).sort();
  const candidates = (options) => {
    // Dry run reports counts; read the exact candidate set through the same selection path with a large cap.
    return eligibleKeys(db, { maxJobs: 1000, ...options });
  };
  assert.equal((await candidates({})).eligible, 7, 'no flags: every non-manual, non-rejected row below v5');
  const both = await candidates({ minScore: 3, archetypes: ['fde_applied_ai'] });
  assert.equal(both.eligible, 5, 's9, s5, s3, s8old (score >= 3) plus s2fde (archetype)');
  assert.deepEqual(both.filter, { minScore: 3, archetypes: ['fde_applied_ai'] });
  assert.equal((await candidates({ minScore: 5 })).eligible, 3, 's9, s5, s8old');
  assert.equal((await candidates({ archetypes: ['fde_applied_ai', 'infra'] })).eligible, 2, 's3 and s2fde');
  assert.equal((await candidates({ minScore: 9 })).eligible, 1);
  assert.ok(both.estimateAllEligible.costTypicalUsd > 0 && both.estimateAllEligible.costMaxUsd >= both.estimateAllEligible.costTypicalUsd);
  assert.equal(both.estimateAllEligible.model != null, true);
  await assert.rejects(rankPending({ db, dryRun: true, minScore: 3 }), /only apply together with --rerank-version/);
  await assert.rejects(rankPending({ db, dryRun: true, rerankVersion: 5, archetypes: ['wizard'] }), /Unknown archetype/);
  await assert.rejects(rankPending({ db, dryRun: true, rerankVersion: 5, minScore: Number.NaN }), /--min-score must be a number/);
  db.close();
});

test('targeted re-rank runs best-score-first, honors the job cap, and never touches rows outside the filter', async (t) => {
  const db = memoryDb();
  const ids = seedRanked(db);
  const before = new Map(db.prepare('SELECT * FROM jobs').all().map((row) => [row.job_id, row]));
  const order = [];
  setLlmClient(async ({ user }) => {
    order.push(user.match(/Title: (Title \w+)/)[1]);
    return { text: JSON.stringify({ score: 6, reason: 'new', location: 'Bengaluru', archetype: 'frontend', seniority_fit: 'fit' }), usage: { input_tokens: 10, output_tokens: 5 } };
  });
  t.after(() => setLlmClient(null));

  const capped = await rankPending({ db, rerankVersion: 5, minScore: 3, archetypes: ['fde_applied_ai'], concurrency: 1, maxJobs: 3, maxUsd: 100, sleep: noSleep, processRef: new EventEmitter(), exit() {} });
  assert.equal(capped.ranked, 3);
  assert.deepEqual(order, ['Title s9', 'Title s8old', 'Title s5'], 'highest stored score first');
  const full = await rankPending({ db, rerankVersion: 5, minScore: 3, archetypes: ['fde_applied_ai'], concurrency: 1, maxUsd: 100, sleep: noSleep, processRef: new EventEmitter(), exit() {} });
  assert.equal(full.ranked, 2, 'the two remaining candidates (s3, s2fde); already re-ranked rows are v5 now');
  assert.deepEqual(order.slice(3), ['Title s3', 'Title s2fde']);

  const after = new Map(db.prepare('SELECT * FROM jobs').all().map((row) => [row.job_id, row]));
  for (const key of ['s2other', 's1', 'v5', 'man', 'rej']) assert.deepEqual(after.get(key), before.get(key), `${key} untouched`);
  for (const key of ['s9', 's5', 's3', 's2fde', 's8old']) {
    assert.equal(after.get(key).rank_prompt_version, PROMPT_VERSION, key);
    assert.equal(after.get(key).relevance_score, 6, key);
  }
  assert.equal(ids.s9 > 0, true);
  db.close();
});

test('CLI parses --min-score and --include-archetype for the dry run', async (t) => {
  const { runRankCli } = await import('../src/scripts/rank.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rankcli-'));
  const file = path.join(dir, 'jobs.db');
  const seeded = createDatabase(file);
  seedRanked(seeded);
  seeded.close();
  const previous = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = file;
  t.after(() => { if (previous === undefined) delete process.env.DATABASE_PATH; else process.env.DATABASE_PATH = previous; });
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(String(line)));
  const result = await runRankCli(['--rerank-version', '5', '--min-score', '3', '--include-archetype', 'fde_applied_ai,infra']);
  assert.equal(result.eligible, 5);
  assert.ok(lines.some((line) => /FILTER .*score >= 3 OR archetype in \[fde_applied_ai, infra\] -> 5 candidates; est cost \$[\d.]+ typical \/ \$[\d.]+ worst case/.test(line)));
  await assert.rejects(runRankCli(['--rerank-version', '5', '--min-score', 'abc']), /--min-score must be a number/);
});
