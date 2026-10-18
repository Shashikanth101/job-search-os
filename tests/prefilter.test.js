import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createDatabase } from '../src/db.js';
import { BaseScraper } from '../src/scrapers/base-scraper.js';
import { createApp } from '../src/app.js';
import { classifyTitle, classifyTitleWithReason, evaluateJobRules, extractMinYears, preFilterJobs, PREFILTER_VERSION } from '../src/scrapers/pre-filter.js';
import { reclassifyPrefilter } from '../src/scripts/reclassify-prefilter.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prefilter-'));
}

test('title rules: seniority denies and required passes', () => {
  const denied = [
    ['Principal Software Engineer', 'seniority_title'], ['Distinguished Engineer', 'seniority_title'], ['Fellow, Engineering', 'seniority_title'],
    ['Head of Engineering', 'seniority_title'], ['Director of Engineering', 'seniority_title'], ['VP Engineering', 'seniority_title'],
    ['Vice President, Engineering', 'seniority_title'], ['Vice-President Platform', 'seniority_title'], ['Chief Technology Officer', 'seniority_title'],
    ['Engineering Manager, Web', 'seniority_title'], ['Manager, Engineering', 'seniority_title'], ['principal frontend engineer', 'seniority_title'],
    ['Backend Engineer', 'denied_title'],
  ];
  for (const [title, reason] of denied) assert.deepEqual(classifyTitleWithReason(title), { classification: 'deny', reason }, title);

  const passing = ['Senior Frontend Engineer', 'Staff Frontend Engineer', 'Lead Frontend Engineer', 'Software Engineer II', 'SDE 2',
    'Full Stack Engineer', 'Forward Deployed Engineer', 'Applied AI Engineer', 'Founding Engineer', 'Member of Technical Staff', 'Product Engineer',
    'Overhead Line Engineer', 'Svp Engineer', 'Directorate Liaison Engineer', 'Fellowship Engineer', 'Chiefdom Engineer'];
  for (const title of passing) assert.notEqual(classifyTitle(title), 'deny', title);
  assert.equal(classifyTitle('Staff Frontend Engineer'), 'allow');
});

test('extractMinYears', () => {
  const cases = [
    ['5+ years of experience in React', 5],
    ['3-5 years of experience', 3],
    ['8 to 12 years of relevant experience', 8],
    ['Minimum 7 years of professional experience', 7],
    ['At least 10 years experience building systems', 10],
    ['<ul><li>4+ years experience</li><li>12+ years of experience leading teams</li></ul>', 12],
    ['10+ years of experience is preferred', null],
    ['Bonus: 15 years of experience', null],
    ['Nice to have: 12+ years experience', null],
    ['Our company has been around for 20 years. Join us.', null],
    ['5+ years of Java, plus experience with Kafka', null],
    ['2024 years of experience', null],
    ['', null], [null, null], [undefined, null],
  ];
  for (const [text, expected] of cases) assert.equal(extractMinYears(text), expected, String(text));
  assert.equal(extractMinYears(`${'x'.repeat(80)} 9 years ${'y'.repeat(80)} experience`), null, 'experience beyond the 60 char window');
});

test('evaluateJobRules and preFilterJobs carry reasons and never reject manual jobs', () => {
  assert.deepEqual(evaluateJobRules({ title: 'Frontend Engineer', description: '10 years of experience required' }), { pass: false, reason: 'years_required_10' });
  assert.deepEqual(evaluateJobRules({ title: 'Frontend Engineer', description: '9 years of experience required' }), { pass: true, reason: null });
  assert.deepEqual(evaluateJobRules({ title: 'Frontend Engineer' }), { pass: true, reason: null });
  assert.deepEqual(evaluateJobRules({ title: 'Director of Engineering', description: '20 years experience', source: 'manual' }), { pass: true, reason: null });
  const jobs = [
    { title: 'Frontend Engineer', location: 'Bengaluru, India', description: '3 years of experience' },
    { title: 'Principal Engineer', location: 'Bengaluru, India', description: '' },
    { title: 'Frontend Engineer', location: 'Bengaluru, India', description: '12+ years of experience' },
  ];
  const log = console.log;
  console.log = () => {};
  try {
    assert.deepEqual(preFilterJobs(jobs, { company: 'Acme', source: 'test' }), [jobs[0]]);
  } finally {
    console.log = log;
  }
});

class FakeScraper extends BaseScraper {}

test('re-scrape never changes verdict, relevance, status or user fields; new rows are stamped', () => {
  const dir = tempDir();
  const db = createDatabase(path.join(dir, 'jobs.db'));
  try {
    const scraper = new FakeScraper({ db, source: 'test' });
    const job = { job_id: 'j1', title: 'Frontend Engineer', company: 'Acme', location: 'Bengaluru', description: 'old', apply_url: 'https://x/1',
      relevance_score: 8, relevance_reason: 'good fit' };
    assert.equal(scraper.saveToDb([job]), 1);
    const inserted = db.prepare('SELECT * FROM jobs WHERE job_id = ?').get('j1');
    assert.equal(inserted.prefilter_status, 'passed');
    assert.equal(inserted.prefilter_version, PREFILTER_VERSION);
    assert.ok(inserted.prefilter_checked_at);

    db.prepare(`UPDATE jobs SET status = 'applied', is_new = 0, resume_path = '/r.pdf', prefilter_status = 'rejected',
      prefilter_reason = 'seniority_title', prefilter_version = 99, prefilter_checked_at = '2020-01-01' WHERE job_id = 'j1'`).run();
    const before = db.prepare('SELECT * FROM jobs WHERE job_id = ?').get('j1');
    scraper.saveToDb([{ ...job, title: 'Frontend Engineer II', description: 'new', location: null, relevance_score: 0, relevance_reason: 'Ranking failed', source: 'other' }]);
    const after = db.prepare('SELECT * FROM jobs WHERE job_id = ?').get('j1');
    for (const column of ['prefilter_status', 'prefilter_reason', 'prefilter_version', 'prefilter_checked_at', 'relevance_score', 'relevance_reason',
      'status', 'is_new', 'resume_path', 'location', 'source', 'found_at']) assert.equal(after[column], before[column], column);
    assert.equal(after.title, 'Frontend Engineer II');
    assert.equal(after.description, 'new');

    assert.equal(scraper.saveToDb([{ job_id: 'j2', title: 'Director of Engineering', company: 'Acme', location: 'India', apply_url: 'https://x/2' }]), 0);
  } finally {
    db.close();
  }
});

test('migration is idempotent and jobs API hides rejected jobs unless include_rejected=1', () => {
  const dir = tempDir();
  const file = path.join(dir, 'jobs.db');
  createDatabase(file).close();
  const db = createDatabase(file);
  try {
    const insert = db.prepare(`INSERT INTO jobs (job_id, title, company, apply_url, source, relevance_score, prefilter_status) VALUES (?, ?, 'Acme', ?, 'test', 8, ?)`);
    insert.run('a', 'Kept', 'u1', 'passed');
    insert.run('b', 'Legacy unchecked', 'u2', null);
    insert.run('c', 'Rejected', 'u3', 'rejected');
    const app = createApp(db);
    const route = app._router.stack.find((layer) => layer.route?.path === '/api/jobs');
    const get = (query) => {
      let body;
      route.route.stack[0].handle({ query }, { json(value) { body = value; return this; }, status() { return this; } });
      return body.map((row) => row.title).sort();
    };
    assert.deepEqual(get({}), ['Kept', 'Legacy unchecked']);
    assert.deepEqual(get({ include_rejected: '1' }), ['Kept', 'Legacy unchecked', 'Rejected']);
  } finally {
    db.close();
  }
});

test('reclassify: dry run writes nothing, apply is idempotent and protects rows', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'jobs.db');
  const db = createDatabase(file);
  const insert = db.prepare(`INSERT INTO jobs (job_id, title, company, location, description, apply_url, source, status) VALUES (?, ?, ?, 'India', ?, ?, ?, ?)`);
  const ids = {
    reject: insert.run('1', 'Principal Engineer', 'A', '', 'u1', 'test', 'not_applied').lastInsertRowid,
    years: insert.run('2', 'Frontend Engineer', 'A', '11+ years of experience', 'u2', 'test', 'not_applied').lastInsertRowid,
    keep: insert.run('3', 'Staff Frontend Engineer', 'B', '4 years of experience', 'u3', 'test', 'not_applied').lastInsertRowid,
    manual: insert.run('4', 'Director of X', 'C', '', 'u4', 'manual', 'not_applied').lastInsertRowid,
    applied: insert.run('5', 'VP Engineering', 'C', '', 'u5', 'test', 'applied').lastInsertRowid,
    interview: insert.run('6', 'Head of Web', 'C', '', 'u6', 'test', 'not_applied').lastInsertRowid,
    outreach: insert.run('7', 'Chief Architect', 'C', '', 'u7', 'test', 'not_applied').lastInsertRowid,
  };
  db.prepare("INSERT INTO interviews (job_id, company_name, title, status) VALUES (?, 'C', 'Head of Web', 'ongoing')").run(ids.interview);
  db.prepare('INSERT INTO outreach (job_id) VALUES (?)').run(ids.outreach);
  db.close();

  const out = path.join(dir, 'out');
  const log = console.log;
  console.log = () => {};
  try {
    const dry = await reclassifyPrefilter({ dbPath: file, outDir: out });
    assert.equal(dry.rejected, 2);
    assert.equal(dry.updated, 0);
    assert.equal(fs.readdirSync(dir).filter((name) => name.includes('.bak-')).length, 0);
    const check = new Database(file, { readonly: true });
    assert.equal(check.prepare("SELECT COUNT(*) AS n FROM jobs WHERE prefilter_status IS NOT NULL").get().n, 0);
    check.close();

    const first = await reclassifyPrefilter({ dbPath: file, apply: true, outDir: out });
    assert.equal(first.updated, 7);
    assert.ok(fs.existsSync(first.backupPath));
    const second = await reclassifyPrefilter({ dbPath: file, apply: true, outDir: out });
    assert.equal(second.updated, 0);
  } finally {
    console.log = log;
  }

  const result = new Database(file, { readonly: true });
  const status = Object.fromEntries(result.prepare('SELECT job_id, prefilter_status AS s, prefilter_reason AS r FROM jobs').all().map((row) => [row.job_id, [row.s, row.r]]));
  result.close();
  assert.deepEqual(status['1'], ['rejected', 'seniority_title']);
  assert.deepEqual(status['2'], ['rejected', 'years_required_11']);
  for (const id of ['3', '4', '5', '6', '7']) assert.deepEqual(status[id], ['passed', null], id);
  assert.equal(fs.readFileSync(path.join(out, 'prefilter-rejected.csv'), 'utf8').split('\n').length, 3);
  assert.match(fs.readFileSync(path.join(out, 'prefilter-reclassify-report.md'), 'utf8'), /Rollback SQL/);
  assert.equal(new Database(file, { readonly: true }).prepare('SELECT COUNT(*) AS n FROM jobs').get().n, 7);
});

test('v3 non-engineering and wrong-level title keywords', () => {
  const denied = [
    ['Software Engineering Intern', 'intern'], ['Frontend Engineer Intern', 'intern'], ['Summer Internship 2026', 'internship'], ['New Grad Software Engineer', 'new grad'],
    ['Graduate Program - Engineering', 'graduate program'], ['Apprentice Developer', 'apprentice'], ['Student Ambassador', 'student'], ['Business Analyst', 'analyst'],
    ['Product Manager II', 'product manager'], ['Technical Program Manager', 'program manager'], ['Revenue Operations Lead', 'revenue operations'],
    ['Paralegal', 'paralegal'], ['Compliance Associate', 'compliance'], ['Mainframe Engineer', 'mainframe'], ['Network Engineer - NOC', 'network engineer'],
    ['Systems Operations Engineer', 'systems operations'],
    ['Senior Manager, Platform', 'senior manager'], ['Sr. Manager Growth', 'sr. manager'], ['Sr Manager - Payments', 'sr manager'],
    ['Development Manager, Web', 'development manager'], ['Account Executive, Enterprise', null],
  ];
  for (const [title, keyword] of denied) {
    const verdict = classifyTitleWithReason(title);
    assert.equal(verdict.classification, 'deny', title);
    if (keyword) assert.deepEqual([verdict.reason, verdict.keyword], ['non_engineering_title', keyword], title);
  }
  const kept = ['Internal Tools Engineer', 'Developer Advocate', 'Solutions Engineer', 'Analytics Engineer', 'International Payments Engineer', 'Studio Engineer',
    'Frontend Engineer', 'Staff Frontend Engineer', 'Full Stack Engineer', 'Network Engineering Manager Tools',
    'Compliance Engineer - APAC', 'Senior Compliance Engineer', 'Senior Software Engineer', 'Staff Software Engineer', 'Lead Frontend Engineer',
    'Senior Management Systems Engineer', 'Software Development Engineer'];
  for (const title of kept) assert.notEqual(classifyTitleWithReason(title).reason, 'non_engineering_title', title);
  assert.equal(classifyTitleWithReason('Compliance Analyst').keyword, 'compliance', 'only the exact "compliance engineer" phrase is carved out');
  assert.deepEqual(evaluateJobRules({ title: 'Product Manager', source: 'manual' }), { pass: true, reason: null });
  assert.deepEqual(classifyTitleWithReason('Software Engineering Manager'), { classification: 'deny', reason: 'seniority_title' }, 'already covered by the engineering manager rule');
  assert.deepEqual(classifyTitleWithReason('Principal Engineer'), { classification: 'deny', reason: 'seniority_title' }, 'seniority behavior unchanged');
  for (const title of ['Staff Software Engineer', 'Lead Frontend Engineer']) assert.equal(classifyTitle(title), title.startsWith('Staff') ? 'allow' : 'allow', title);
  // Morgan Stanley grade titles: only the three "senior manager" phrases are exempt; every other rule stays.
  const ms = { company: 'Morgan Stanley' };
  for (const title of ['Institutional Equity Division - Senior Manager, Java (Mumbai)', 'Senior Software Engineer (Senior Manager) - Parametric', 'QD Build Engineer, Manager/Senior Manager, Fixed Income Division', 'Sr. Manager, Quant Developer', 'Sr Manager Platform']) {
    assert.deepEqual(evaluateJobRules({ title, ...ms }), { pass: true, reason: null }, title);
    assert.equal(evaluateJobRules({ title, company: 'Meesho' }).reason, 'non_engineering_title', `${title} at another company`);
  }
  for (const [title, keyword] of [['Senior Manager, Product Manager', 'product manager'], ['Business Analyst, Senior Manager', 'analyst'], ['Senior Manager, Compliance', 'compliance'], ['Manager, Development Manager Group', 'development manager']]) {
    const verdict = evaluateJobRules({ title, ...ms });
    assert.deepEqual([verdict.pass, verdict.keyword], [false, keyword], title);
  }
  assert.equal(evaluateJobRules({ title: 'Director of Engineering', ...ms }).reason, 'seniority_title');
  assert.equal(evaluateJobRules({ title: 'Senior Manager, Platform', company: 'Morgan Stanley Capital' }).pass, true);
  assert.equal(classifyTitle('Senior Manager, Platform'), 'deny', 'company-agnostic callers still deny');
  assert.equal(classifyTitle('Senior Manager, Platform', { company: 'Morgan Stanley' }), 'ambiguous');
  assert.equal(PREFILTER_VERSION, 4);
});
