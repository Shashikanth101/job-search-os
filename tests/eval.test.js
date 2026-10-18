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
import { PROMPT_VERSION, buildUserMessage, inputHash, prepareDescription } from '../src/ranker/index.js';
import { TRIM_MAX_CHARS, trimDescription } from '../src/ranker/trim-description.js';

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

const entry = (id, min, max, extra = {}) => ({ id, category: 'top', title: `Job ${id}`, company: 'Acme', location: 'Bengaluru', description: 'React work.', description_full: 'React work. Equal opportunity employer.', expected_min: min, expected_max: max, ...extra });

test('golden.jsonl: 60 unique, valid entries; descriptions are exactly what the ranker sends; required ids present', () => {
  const entries = loadGolden(GOLDEN_PATH);
  assert.equal(entries.length, 60);
  assert.deepEqual(Object.fromEntries(['top', 'irrelevant', 'borderline', 'required', 'boundary'].map((c) => [c, entries.filter((e) => e.category === c).length])),
    { top: 15, irrelevant: 15, borderline: 15, required: 8, boundary: 7 });
  for (const id of REQUIRED_IDS) assert.ok(entries.some((e) => e.id === id), `required id ${id}`);
  for (const e of entries) {
    assert.ok(e.description.length > 0 && e.description.length <= 1500, `${e.id} description cap`);
    assert.equal(e.description, e.description_full.slice(0, 1500), `${e.id} equals the production slice`);
    assert.equal(buildUserMessage(e.title, e.description_full, e.company, e.location, { trim: false }), buildUserMessage(e.title, e.description, e.company, e.location, { trim: false }));
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

test('trim mode sends the trimmed full text; off mode sends the production copy; compare shows both', async (t) => {
  const duties = 'You will build React and TypeScript interfaces and own features end to end. '.repeat(4);
  const boiler = `About Acme Acme is a leader in widgets and we love our customers. About the role ${duties}`
    + 'What you will bring: 4+ years of React experience. Benefits: We offer competitive benefits and health insurance. Equal opportunity employer. Acme does not discriminate.';
  const e = entry(1, 1, 10, { description: boiler.slice(0, 80), description_full: boiler });
  const requests = useClient(t, () => reply(5));
  await runEval({ entries: [e], trim: false });
  await runEval({ entries: [e], trim: true });
  const [off, on] = requests.map((r) => r.user);
  assert.ok(off.includes(e.description) && !off.includes('health insurance'));
  assert.ok(on.includes('React and TypeScript') && !on.includes('health insurance') && !on.includes('does not discriminate') && !on.includes('leader in widgets'));
  const estimateOff = estimateEval([e], { trim: false });
  const estimateOn = estimateEval([e], { trim: true });
  assert.ok(estimateOff.costTypicalUsd > 0 && estimateOn.inputTokens !== estimateOff.inputTokens);
});

test('npm run eval without --run makes 0 LLM calls and reports count and cost', async (t) => {
  const requests = useClient(t, () => reply(5));
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(String(line)));
  assert.equal(await main(['--compare-trim']), 0);
  assert.equal(requests.length, 0);
  assert.ok(lines.some((line) => /DRY RUN .* 60 golden jobs/.test(line)));
  assert.equal(lines.filter((line) => /est cost \$[\d.]+ typical, \$[\d.]+ worst case/.test(line)).length, 2, 'trim OFF and ON estimates');
  await assert.rejects(main(['--min-pass-rate', '2']), /between 0 and 1/);
  await assert.rejects(main(['--trim', 'maybe']), /on or off/);
});

test('trimDescription strips EEO, benefits and company boilerplate, keeps the role, caps length and never over-trims', () => {
  const text = 'About Acme Acme builds widgets for the world and values its people. About the role You will build React interfaces and own them from design to production. '
    + 'What you will do: Ship features, review code, write tests, mentor teammates and improve performance across the web platform. '
    + 'Requirements: 5+ years of TypeScript. Benefits: Health insurance, 401(k), paid time off. Acme is an equal opportunity employer and does not discriminate. We provide reasonable accommodations.';
  const trimmed = trimDescription(text);
  assert.match(trimmed, /^About the role You will build React interfaces/);
  assert.match(trimmed, /What you will do: Ship features/);
  assert.match(trimmed, /Requirements: 5\+ years of TypeScript/);
  for (const gone of ['widgets', 'Health insurance', 'equal opportunity', 'accommodations']) assert.ok(!trimmed.includes(gone), gone);

  assert.equal(trimDescription(''), '');
  assert.equal(trimDescription(null), '');
  const long = `About the role ${'Build React features. '.repeat(200)}`;
  const capped = trimDescription(long);
  assert.ok(capped.length <= TRIM_MAX_CHARS && capped.length > TRIM_MAX_CHARS * 0.8);
  assert.ok(trimDescription(long, 300).length <= 300);
  const allBoilerplate = 'Equal opportunity employer. We offer competitive benefits and health insurance for everyone.';
  assert.equal(trimDescription(allBoilerplate), allBoilerplate, 'falls back to the original rather than returning almost nothing');
  assert.equal(trimDescription(trimmed), trimmed, 'stable on its own output');
});

test('production behavior is unchanged while RANK_TRIM_DESCRIPTIONS is 0; the flag switches it on', (t) => {
  const description = 'x'.repeat(2000);
  assert.equal(prepareDescription(description), 'x'.repeat(1500));
  assert.equal(buildUserMessage('T', description, 'C', 'Pune'), `Score this job:
      Company: C
      Title: T
      Raw location: Pune
      Description: ${'x'.repeat(1500)}`);
  assert.equal(inputHash('T', description), createHash('sha256').update(`T\n${'x'.repeat(1500)}\n${PROMPT_VERSION}`).digest('hex'), 'hash formula unchanged');
  assert.equal(buildUserMessage('T', null, 'C'), buildUserMessage('T', '', 'C'));
  assert.ok(buildUserMessage('T', null, 'C').includes('Description: Not provided'));

  process.env.RANK_TRIM_DESCRIPTIONS = '1';
  t.after(() => delete process.env.RANK_TRIM_DESCRIPTIONS);
  const trimmed = prepareDescription(`About Acme Acme is great and we have many wonderful values to share with you today. About the role ${'Build React features with TypeScript and ship them. '.repeat(8)} Equal opportunity employer.`);
  assert.ok(trimmed.includes('Build React') && !trimmed.includes('Acme is great'));
  assert.notEqual(inputHash('T', description), createHash('sha256').update(`T\n${'x'.repeat(1500)}\n${PROMPT_VERSION}`).digest('hex'));
});

test('migration 008 adds llm_usage.purpose idempotently', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'purpose-'));
  const file = path.join(dir, 'jobs.db');
  createDatabase(file).close();
  const db = createDatabase(file);
  assert.ok(db.prepare('PRAGMA table_info(llm_usage)').all().some((column) => column.name === 'purpose'));
  db.close();
});
