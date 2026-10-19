import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../scripts/eval.js';
import { createDatabase } from '../src/db.js';
import { GOLDEN_PATH, estimateEval, loadGolden, runEval } from '../src/eval/golden.js';
import { LlmError, setLlmClient } from '../src/llm/index.js';
import { MAX_DESCRIPTION_CHARS, PROMPT_VERSION, buildUserMessage, inputHash, prepareDescription } from '../src/ranker/index.js';

const REQUIRED_IDS = [12156, 1597, 589, 1709, 3551, 860, 240, 582];

function useClient(t, handler) {
  const requests = [];
  setLlmClient(async (request) => {
    requests.push(request);
    return handler(request, requests.length);
  });
  t.after(() => setLlmClient(null));
  return requests;
}

const reply = (score, extra = {}) => ({
  text: JSON.stringify({ score, reason: 'ok', location: 'Bengaluru', archetype: 'frontend', seniority_fit: 'fit', ...extra }),
  usage: { input_tokens: 1000, output_tokens: 100 },
});

const entry = (id, min, max, extra = {}) => ({ id, category: 'top', title: `Job ${id}`, company: 'Acme', location: 'Bengaluru', description: 'React work.', expected_min: min, expected_max: max, ...extra });

test('golden.jsonl: 60 unique, valid entries; descriptions are the complete text the ranker sends; required ids present', () => {
  const entries = loadGolden(GOLDEN_PATH);
  assert.equal(entries.length, 60);
  assert.deepEqual(Object.fromEntries(['top', 'irrelevant', 'borderline', 'required', 'boundary'].map((c) => [c, entries.filter((e) => e.category === c).length])),
    { top: 15, irrelevant: 15, borderline: 15, required: 8, boundary: 7 });
  for (const id of REQUIRED_IDS) assert.ok(entries.some((e) => e.id === id), `required id ${id}`);
  for (const e of entries) {
    assert.ok(e.description.length > 0 && e.description.length <= MAX_DESCRIPTION_CHARS, `${e.id} description within the safety cap`);
    assert.equal('description_full' in e, false, `${e.id} has a single description field`);
    assert.equal(prepareDescription(e.description), e.description, `${e.id} is sent in full`);
    assert.ok(e.expected_min >= 1 && e.expected_max <= 10 && e.expected_min <= e.baseline_score && e.baseline_score <= e.expected_max, `${e.id} range brackets the baseline score`);
  }
});

test('loadGolden rejects malformed lines, bad ranges and duplicate ids', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-'));
  const write = (name, lines) => { const file = path.join(dir, name); fs.writeFileSync(file, lines.join('\n')); return file; };
  assert.throws(() => loadGolden(write('a.jsonl', ['{nope'])), /not valid JSON/);
  assert.throws(() => loadGolden(write('b.jsonl', [JSON.stringify({ ...entry(1, 3, 2) })])), /expected_min\/expected_max/);
  assert.throws(() => loadGolden(write('c.jsonl', [JSON.stringify({ ...entry(1, 1, 2), title: '' })])), /missing title/);
  assert.throws(() => loadGolden(write('d.jsonl', [JSON.stringify(entry(1, 1, 2)), JSON.stringify(entry(1, 1, 2))])), /duplicate ids/);
});

test('eval scores through rankJob, reports pass/fail, parse failures, errors and cost; never writes to jobs; ledger rows are marked eval', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaldb-'));
  const db = createDatabase(path.join(dir, 'jobs.db'));
  db.prepare("INSERT INTO jobs (job_id, title, company, source, rank_status, relevance_score) VALUES ('x', 'Seed', 'Acme', 'test', 'ranked', 5)").run();
  const jobsBefore = JSON.stringify(db.prepare('SELECT * FROM jobs').all());
  const entries = [entry(1, 7, 9), entry(2, 1, 2), entry(3, 4, 6), entry(4, 4, 6), entry(5, 4, 6)];
  const requests = useClient(t, ({ user }) => {
    const id = Number(user.match(/Title: Job (\d+)/)[1]);
    if (id === 1) return reply(8);
    if (id === 2) return reply(6);
    if (id === 3) return { text: 'I cannot score this.', usage: { input_tokens: 500, output_tokens: 20 } };
    if (id === 4) throw new LlmError('overloaded', { status: 529, kind: 'server' });
    return reply(5);
  });
  const { summary, results } = await runEval({ entries, db, concurrency: 1, maxUsd: 100 });

  assert.deepEqual(results.map((r) => [r.id, r.status, r.pass]), [[1, 'scored', true], [2, 'scored', false], [3, 'parse_failure', false], [4, 'error', false], [5, 'scored', true]]);
  assert.equal(summary.passed, 2);
  assert.equal(summary.failed, 3);
  assert.equal(summary.passRate, 2 / 5);
  assert.equal(summary.parseFailures, 1);
  assert.equal(summary.errors, 1);
  assert.equal(summary.aborted, false);
  assert.ok(summary.costUsd > 0 && Math.abs(summary.avgCostUsd * 3 - summary.costUsd) < 1e-12, 'cost sums the scored calls');
  assert.equal(requests.length, 5, 'one request per job, no retries');
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM jobs').all()), jobsBefore, 'jobs table untouched');
  const ledger = db.prepare('SELECT kind, purpose, status, COUNT(*) AS n FROM llm_usage GROUP BY 1, 2, 3 ORDER BY 3').all();
  assert.deepEqual(ledger, [{ kind: 'rank', purpose: 'eval', status: 'error', n: 1 }, { kind: 'rank', purpose: 'eval', status: 'ok', n: 4 }]);
  db.close();
});

test('eval aborts on a fatal LLM error and on the daily budget, and applies model/provider overrides', async (t) => {
  const entries = [entry(1, 1, 10), entry(2, 1, 10), entry(3, 1, 10)];
  let requests = useClient(t, () => { throw new LlmError('credit balance is too low', { status: 400, kind: 'quota' }); });
  const fatal = await runEval({ entries, concurrency: 1 });
  assert.equal(requests.length, 1);
  assert.equal(fatal.summary.aborted, true);
  assert.match(fatal.summary.abortReason, /quota/);
  assert.deepEqual(fatal.results.map((r) => r.status), ['error', 'not_run', 'not_run']);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalbudget-'));
  const db = createDatabase(path.join(dir, 'jobs.db'));
  requests = useClient(t, () => reply(5, {}));
  setLlmClient(async (request) => { requests.push(request); return { ...reply(5), usage: { input_tokens: 2_000_000, output_tokens: 0 } }; });
  process.env.LLM_MODEL = 'claude-haiku-5-5';
  t.after(() => delete process.env.LLM_MODEL);
  const budget = await runEval({ entries, db, concurrency: 1, maxUsd: 0.15 }); // $0.20 per call
  assert.equal(budget.summary.abortReason, 'daily_budget_reached');
  assert.equal(budget.results.filter((r) => r.status === 'scored').length, 1);
  db.close();

  requests = useClient(t, () => reply(5));
  await runEval({ entries: [entry(1, 1, 10)], overrides: { provider: 'openai' } });
  await runEval({ entries: [entry(1, 1, 10)], overrides: { provider: 'openai', model: 'gpt-5-test' } });
  await runEval({ entries: [entry(1, 1, 10)], overrides: { model: 'claude-sonnet-4-6' } });
  assert.deepEqual(requests.map((r) => [r.provider, r.model]), [['openai', 'gpt-4o-mini'], ['openai', 'gpt-5-test'], ['anthropic', 'claude-sonnet-4-6']]);
});

test('npm run eval without --run makes 0 LLM calls and reports count and cost', async (t) => {
  const requests = useClient(t, () => reply(5));
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(String(line)));
  assert.equal(await main([]), 0);
  assert.equal(requests.length, 0);
  assert.ok(lines.some((line) => /DRY RUN .* 60 golden jobs/.test(line)));
  assert.equal(lines.filter((line) => /est cost \$[\d.]+ typical, \$[\d.]+ worst case/.test(line)).length, 1);
  await assert.rejects(main(['--min-pass-rate', '2']), /between 0 and 1/);
});

test('the ranker sends the complete description (safety cap only) and inputHash follows exactly what is sent', () => {
  const long = 'x'.repeat(5000);
  assert.equal(prepareDescription(long), long, 'no 1,500 character cutoff');
  assert.equal(prepareDescription('y'.repeat(MAX_DESCRIPTION_CHARS + 500)).length, MAX_DESCRIPTION_CHARS);
  assert.equal(MAX_DESCRIPTION_CHARS, 20000);
  assert.equal(buildUserMessage('T', long, 'C', 'Pune'), `Score this job:
      Company: C
      Title: T
      Raw location: Pune
      Description: ${long}`);
  assert.equal(buildUserMessage('T', null, 'C'), buildUserMessage('T', '', 'C'));
  assert.ok(buildUserMessage('T', null, 'C').includes('Description: Not provided'));
  const hash = (text) => createHash('sha256').update(`T\n${text}\n${PROMPT_VERSION}`).digest('hex');
  assert.equal(inputHash('T', long), hash(long));
  const over = 'z'.repeat(MAX_DESCRIPTION_CHARS + 100);
  assert.equal(inputHash('T', over), inputHash('T', over.slice(0, MAX_DESCRIPTION_CHARS)), 'text beyond the cap changes neither the message nor the hash');
  assert.notEqual(inputHash('T', long), inputHash('T', long.slice(0, 1500)), 'text past the old 1,500 cutoff is part of the hash');
});

test('migration 008 adds llm_usage.purpose idempotently', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'purpose-'));
  const file = path.join(dir, 'jobs.db');
  createDatabase(file).close();
  const db = createDatabase(file);
  assert.ok(db.prepare('PRAGMA table_info(llm_usage)').all().some((column) => column.name === 'purpose'));
  db.close();
});
