import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { AshbyScraper } from '../src/scrapers/ashby.js';
import { GreenhouseScraper } from '../src/scrapers/greenhouse.js';
import { LeverScraper } from '../src/scrapers/lever.js';
import { SmartRecruitersScraper } from '../src/scrapers/smartrecruiters.js';
import { createScrapers } from '../src/scrapers/index.js';
import { classifyTitle, isLocationEligible } from '../src/scrapers/pre-filter.js';

test('department and location gates reject noise while retaining allowed and ambiguous titles', () => {
  for (const title of ['Account Executive', 'Sr Enterprise Account Exec - Utilities', 'Sales Development Representative', 'Frontend Engineer - Marketing', 'Site Reliability Engineer', 'Data Engineer', 'Recruiter']) {
    assert.equal(classifyTitle(title), 'deny', title);
  }
  for (const title of ['Frontend Engineer', 'Full Stack Engineer', 'AI Agents Engineer', 'Forward Deployed Engineer']) {
    assert.equal(classifyTitle(title), 'allow', title);
  }
  assert.equal(classifyTitle('Member of Technical Staff'), 'ambiguous');
  for (const location of ['Bengaluru', 'Remote - India', 'Singapore', 'Dubai, UAE', 'Amsterdam', 'London, UK', 'United States; India']) {
    assert.equal(isLocationEligible(location), true, location);
  }
  for (const location of [null, 'Remote', 'Remote - US', 'New York', 'London, Ontario, Canada', 'Sydney, New South Wales, Australia', 'New South Wales', 'Berlin', 'EMEA']) {
    assert.equal(isLocationEligible(location), false, String(location));
  }
  assert.equal(isLocationEligible('Remote', true), true);
  assert.equal(isLocationEligible('Remote - US', true), false);
});

test('AI and agent engineering title variants are allowed while ML engineering stays ambiguous', () => {
  const allowed = [
    'Applied AI Engineer',
    'AI Application Engineer',
    'Application Engineer, AI',
    'Agent Engineer',
    'Agentic Engineer, Platform',
    'AI Agent Engineer',
    'AI Agents Engineer',
    'AI Product Engineer',
    'Engineer, Applied AI',
    'Engineer - AI Agents',
    'Forward Deployed Engineer',
    'Frontend Engineer',
    'Full Stack Engineer',
    'Software Development Engineer',
    'SDE 2',
    'UI Engineer',
    'Web Engineer',
    'Harness Engineer',
  ];
  for (const title of allowed) assert.equal(classifyTitle(title), 'allow', title);
  for (const title of ['Machine Learning Engineer', 'ML Engineer', 'ML Engineer, Frontend Tooling']) {
    assert.equal(classifyTitle(title), 'ambiguous', title);
  }
  assert.equal(classifyTitle('Data Engineer, ML Platform'), 'deny');
});

test('all four ATS parsers reject Account Executives and US-only engineers before ranking', () => {
  const options = { db: {}, company: 'Test', slug: 'test' };
  const jobs = [
    { id: '1', title: 'Account Executive', location: 'India' },
    { id: '2', title: 'Frontend Engineer', location: 'United States' },
    { id: '3', title: 'Frontend Engineer', location: 'Bengaluru' },
  ];
  const cases = [
    [new GreenhouseScraper(options), { jobs: jobs.map(j => ({ ...j, location: { name: j.location } })) }],
    [new LeverScraper(options), jobs.map(j => ({ ...j, text: j.title, categories: { location: j.location }, createdAt: 0 }))],
    [new SmartRecruitersScraper(options), { content: jobs.map(j => ({ ...j, name: j.title, location: { city: j.location } })) }],
    [new AshbyScraper(options), { jobs }],
  ];
  for (const [scraper, response] of cases) {
    assert.deepEqual(scraper.parseJobs(response).map(j => j.job_id), ['3'], scraper.source);
  }
});

test('Ashby public jobs are fetched, ranked, persisted, and updated without duplicates', async (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
  const scraper = new AshbyScraper({ db, company: 'Test', slug: 'test' });
  let rankingCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url === 'https://api.ashbyhq.com/posting-api/job-board/test') {
      return { ok: true, json: async () => ({ jobs: [{
        id: 'ashby-1', title: 'Frontend Engineer', location: 'Bengaluru',
        employmentType: 'FullTime', descriptionPlain: 'Build React apps.',
        applyUrl: 'https://example.com/apply', jobUrl: 'https://example.com/job', publishedAt: '2026-09-01T00:00:00Z',
      }] }) };
    }
    rankingCalls += 1;
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ score: 9, reason: 'Frontend fit', location: 'Bengaluru' }) } }] }) };
  });
  assert.equal(await scraper.run(), 1);
  assert.equal(await scraper.run(), 1);
  assert.equal(rankingCalls, 2);
  assert.deepEqual(db.prepare('SELECT job_id, source, apply_url, relevance_score FROM jobs').all(), [{
    job_id: 'ashby-1', source: 'ashby-test', apply_url: 'https://example.com/apply', relevance_score: 9,
  }]);
});

test('Ashby rejects HTTP/schema failures and does not invent an India location', async (t) => {
  const scraper = new AshbyScraper({ db: {}, company: 'Test', slug: 'test' });
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404 }));
  await assert.rejects(scraper.scrape(), /404/);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ jobPostings: [] }) }));
  await assert.rejects(scraper.scrape(), /missing its jobs array/);
  assert.deepEqual(scraper.parseJobs({ jobs: [{ title: 'Frontend Engineer' }] }), []);
  assert.equal(scraper.parseJobs({ jobs: [{ title: 'Frontend Engineer', location: 'San Francisco', secondaryLocations: [{ location: 'Bengaluru' }] }] }).length, 1);
  assert.equal(scraper.parseJobs({ jobs: [{ title: 'Frontend Engineer', location: 'San Francisco, US', secondaryLocations: [{ location: 'Bengaluru, India' }] }] }).length, 1);
});

test('SmartRecruiters paginates and only fetches details for eligible jobs', async (t) => {
  const scraper = new SmartRecruitersScraper({ db: {}, company: 'Test', slug: 'test' });
  const requested = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requested.push(url);
    const parsed = new URL(url);
    if (parsed.searchParams.has('offset')) {
      const offset = Number(parsed.searchParams.get('offset'));
      return { ok: true, json: async () => ({ totalFound: 2, content: [{ id: String(offset + 1), name: offset ? 'Frontend Engineer' : 'Account Executive', location: { city: 'Bengaluru', country: 'in' } }] }) };
    }
    return { ok: true, json: async () => ({ jobAd: { sections: { jobDescription: { text: '<p>React &amp; TypeScript</p>' } } } }) };
  });
  const jobs = scraper.parseJobs(await scraper.scrape());
  assert.equal(requested.length, 3);
  assert.ok(requested[1].endsWith('offset=1'));
  assert.ok(requested[2].endsWith('/postings/2'));
  assert.equal(jobs[0].description, 'React & TypeScript');
  assert.equal(jobs[0].location, 'Bengaluru, India');
});

test('registry preserves existing sources and keeps only Perplexity Ashby', () => {
  const previous = process.env.CAREER_PAGES_JSON;
  const previousKey = process.env.FIRECRAWL_API_KEY;
  process.env.FIRECRAWL_API_KEY = 'test-key';
  process.env.CAREER_PAGES_JSON = '[]';
  try {
    const scrapers = createScrapers({});
    assert.equal(scrapers.length, 75);
    assert.equal(new Set(scrapers.map(s => s.source)).size, 75);
    assert.deepEqual(scrapers.filter(s => s.company === 'Perplexity AI').map(s => s.source), ['ashby-perplexity']);
    for (const source of ['greenhouse-razorpaysoftwareprivatelimited', 'greenhouse-groww', 'greenhouse-gleanwork', 'smartrecruiters-PHONEPELIMITED', 'smartrecruiters-Zomato1', 'swiggy-careers']) {
      assert.ok(scrapers.some(s => s.source === source), source);
    }
  } finally {
    if (previousKey === undefined) delete process.env.FIRECRAWL_API_KEY;
    else process.env.FIRECRAWL_API_KEY = previousKey;
    if (previous === undefined) delete process.env.CAREER_PAGES_JSON;
    else process.env.CAREER_PAGES_JSON = previous;
  }
});
