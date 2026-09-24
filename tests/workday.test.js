import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { WorkdayScraper, parseWorkdayUrl } from '../src/scrapers/workday.js';
import { workdayConfigs } from '../src/config/workday.js';
import { createScrapers, runAllScrapers } from '../src/scrapers/index.js';

const options = { db: {}, company: 'Test', url: 'https://test.wd5.myworkdayjobs.com/Careers' };
const listing = (id, title = 'Frontend Engineer') => ({ title, externalPath: `/job/Remote/Engineer_${id}`, locationsText: '2 Locations', postedOn: 'Posted 30+ Days Ago' });
const detail = (id, overrides = {}) => ({ title: 'Frontend Engineer', jobReqId: id, location: 'San Jose', country: { descriptor: 'United States of America' },
  additionalLocations: ['Bangalore, India'], jobDescription: '<p>React &amp; TypeScript &#43; UI</p>', startDate: '2026-09-01', timeType: 'Full time', ...overrides });
const json = (data) => ({ ok: true, json: async () => data });

test('Workday resolves standard, localized and alternate URLs and ignores non-ID queries', () => {
  const adobe = parseWorkdayUrl('https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced?jobFamilyGroup=abc');
  assert.equal(adobe.apiBase, 'https://adobe.wd5.myworkdayjobs.com/wday/cxs/adobe/external_experienced');
  const wf = parseWorkdayUrl('https://wd1.myworkdaysite.com/recruiting/wf/WellsFargoJobs');
  assert.equal(wf.apiBase, 'https://wf.wd1.myworkdayjobs.com/wday/cxs/wf/WellsFargoJobs');
  assert.equal(wf.boardUrl, 'https://wd1.myworkdaysite.com/recruiting/wf/WellsFargoJobs');
  for (const url of ['https://example.com/jobs', 'http://test.wd5.myworkdayjobs.com/Careers', 'https://test.wd5.myworkdayjobs.com/', 'https://wd1.myworkdaysite.com/other/wf/Careers']) {
    assert.throws(() => parseWorkdayUrl(url));
  }
});

test('Workday POST paginates by actual page size, resolves multi-location details, ranks only eligible jobs and upserts', async (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
  const scraper = new WorkdayScraper({ ...options, db });
  const offsets = [];
  const details = [];
  let ranked = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url.endsWith('/jobs')) {
      assert.equal(init.method, 'POST');
      const body = JSON.parse(init.body);
      assert.deepEqual(body.appliedFacets, {});
      offsets.push(body.offset);
      return json({ total: body.offset === 0 ? 3 : 0, jobPostings: body.offset === 0 ? [listing('1', 'Account Executive'), listing('2')] : [listing('3')] });
    }
    if (url.includes('/wday/cxs/')) {
      const id = url.slice(-1);
      details.push(id);
      return json({ jobPostingInfo: detail(id, id === '3' ? { additionalLocations: [] } : {}) });
    }
    ranked += 1;
    assert.match(JSON.parse(init.body).messages[1].content, /React & TypeScript \+ UI/);
    return json({ choices: [{ message: { content: JSON.stringify({ score: 9, reason: 'Frontend fit', location: null }) } }] });
  });
  assert.equal(await scraper.run(), 1);
  assert.equal(await scraper.run(), 1);
  assert.deepEqual(offsets, [0, 2, 0, 2]);
  assert.deepEqual(details, ['2', '3', '2', '3']);
  assert.equal(ranked, 2);
  assert.deepEqual(db.prepare('SELECT job_id, posted_at, apply_url, relevance_score FROM jobs').all(), [{
    job_id: '2', posted_at: '2026-09-01', apply_url: 'https://test.wd5.myworkdayjobs.com/Careers/job/Remote/Engineer_2', relevance_score: 9,
  }]);
});

test('Workday fails visibly for HTTP/schema errors but preserves listings when pagination shrinks or repeats', async (t) => {
  const scraper = new WorkdayScraper(options);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 403 }));
  await assert.rejects(scraper.scrape(), /403/);
  t.mock.method(globalThis, 'fetch', async () => json({ total: 1 }));
  await assert.rejects(scraper.scrape(), /jobPostings/);
  t.mock.method(globalThis, 'fetch', async (url) => url.endsWith('/jobs')
    ? json({ total: 2, jobPostings: [listing('1')] }) : json({ jobPostingInfo: detail('1') }));
  assert.equal((await scraper.scrape()).jobs.length, 1);
  assert.equal(scraper.lastRunStats.paginationStoppedEarly, true);
  let pages = 0;
  t.mock.method(globalThis, 'fetch', async (url) => url.endsWith('/jobs') ? json(++pages === 1
    ? { total: 2, jobPostings: [listing('1')] } : { total: 0, jobPostings: [] }) : json({ jobPostingInfo: detail('1') }));
  assert.equal((await scraper.scrape()).jobs.length, 1);
  t.mock.method(globalThis, 'fetch', async () => json({ total: 0, jobPostings: [] }));
  assert.equal((await scraper.scrape()).jobs.length, 0);
});

test('Workday skips failed details and honors explicit facet IDs', async (t) => {
  const appliedFacets = { locationCountry: ['india-id'], jobFamilyGroup: ['engineering-id'] };
  const scraper = new WorkdayScraper({ ...options, appliedFacets });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url.endsWith('/jobs')) {
      assert.deepEqual(JSON.parse(init.body).appliedFacets, appliedFacets);
      return json({ total: 2, jobPostings: [listing('1'), listing('2')] });
    }
    if (url.endsWith('_1')) return { ok: false, status: 403 };
    return json({ jobPostingInfo: detail('2') });
  });
  const raw = await scraper.scrape();
  assert.equal(raw.detailFailures, 1);
  assert.deepEqual(scraper.parseJobs(raw).map((job) => job.job_id), ['2']);
});

test('Workday parses every supplied facet value and preserves repeated custom keys in all 19 registrations', (t) => {
  const previousKey = process.env.FIRECRAWL_API_KEY;
  const previousPages = process.env.CAREER_PAGES_JSON;
  process.env.FIRECRAWL_API_KEY = 'test-key';
  process.env.CAREER_PAGES_JSON = '[]';
  t.after(() => {
    if (previousKey === undefined) delete process.env.FIRECRAWL_API_KEY;
    else process.env.FIRECRAWL_API_KEY = previousKey;
    if (previousPages === undefined) delete process.env.CAREER_PAGES_JSON;
    else process.env.CAREER_PAGES_JSON = previousPages;
  });
  const scrapers = createScrapers({}).filter((scraper) => scraper instanceof WorkdayScraper);
  assert.equal(scrapers.length, 19);
  for (const config of workdayConfigs) {
    const scraper = scrapers.find((entry) => entry.company === config.company);
    const params = new URL(config.url).searchParams;
    for (const key of new Set(params.keys())) assert.deepEqual(scraper.appliedFacets[key], params.getAll(key), `${config.company}: ${key}`);
    assert.equal(Object.keys(scraper.appliedFacets).length, new Set(params.keys()).size);
  }
  assert.equal(scrapers.find((entry) => entry.company === 'Walmart').wdNumber, '504');
  assert.equal(scrapers.find((entry) => entry.company === 'Netflix').wdNumber, '108');
  assert.equal(scrapers.find((entry) => entry.company === 'Wells Fargo').tenant, 'wf');
  assert.equal(scrapers.find((entry) => entry.company === 'Cohesity').siteName, 'Cohesity_Careers');
});

test('Workday excludes tracking/search parameters and supports an explicit unfiltered override', () => {
  const id = '0123456789abcdef0123456789abcdef';
  const url = `${options.url}?Business_Area=${id}&Business_Area=${id}&utm_campaign=${id}&source=${id}&q=frontend&offset=20&empty=`;
  assert.deepEqual(new WorkdayScraper({ ...options, url }).appliedFacets, { Business_Area: [id, id] });
  assert.deepEqual(new WorkdayScraper({ ...options, url, appliedFacets: {} }).appliedFacets, {});
  assert.deepEqual(new WorkdayScraper(options).appliedFacets, {});
});

test('Workday skips incomplete disappearing listings and continues pagination', async (t) => {
  const scraper = new WorkdayScraper(options);
  const offsets = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (!url.endsWith('/jobs')) return json({ jobPostingInfo: detail('1') });
    const { offset } = JSON.parse(init.body);
    offsets.push(offset);
    return json({ total: offset === 0 ? 2 : 0, jobPostings: offset === 0 ? [{ bulletFields: ['PT-JR041624'] }] : [listing('1')] });
  });
  const raw = await scraper.scrape();
  assert.deepEqual(offsets, [0, 1]);
  assert.equal(raw.jobs.length, 1);
  assert.equal(scraper.lastRunStats.invalidListings, 1);
  assert.equal(scraper.lastRunStats.paginationStoppedEarly, false);
});

test('Workday uses detail countries, preserves alternate apply links and never invents dates or locations', () => {
  const scraper = new WorkdayScraper({ ...options, url: 'https://wd1.myworkdaysite.com/recruiting/wf/WellsFargoJobs' });
  const rows = scraper.parseJobs({ jobs: [
    { ...listing('1'), detail: detail('1', { location: 'Reading', country: { descriptor: 'United Kingdom' }, additionalLocations: [], startDate: undefined }) },
    { ...listing('2'), detail: detail('2', { location: null, country: null, additionalLocations: [] }) },
    { ...listing('3'), detail: detail('3', { canApply: false }) },
    { ...listing('4'), detail: detail('4', { posted: false }) },
  ] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].posted_at, null);
  assert.equal(rows[0].location, 'Reading, United Kingdom');
  assert.equal(rows[0].apply_url, 'https://wd1.myworkdaysite.com/recruiting/wf/WellsFargoJobs/job/Remote/Engineer_1');
});

test('Workday retains an eligible secondary city even when the primary country is US', () => {
  const scraper = new WorkdayScraper(options);
  const rows = scraper.parseJobs({ jobs: [{ ...listing('1'), detail: detail('1', { additionalLocations: ['Bangalore'] }) }] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].location, 'San Jose, United States of America; Bangalore');
});

test('Workday retries a transient server failure without changing the POST body', async (t) => {
  const scraper = new WorkdayScraper(options);
  let attempts = 0;
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    bodies.push(init.body);
    return ++attempts === 1 ? { ok: false, status: 503 } : json({ total: 0, jobPostings: [] });
  });
  assert.equal((await scraper.scrape()).total, 0);
  assert.equal(attempts, 2);
  assert.equal(bodies[0], bodies[1]);
});

test('targeted runner isolates a company failure and continues all remaining Workday registrations', async (t) => {
  const previousKey = process.env.FIRECRAWL_API_KEY;
  const previousPages = process.env.CAREER_PAGES_JSON;
  process.env.FIRECRAWL_API_KEY = 'test-key';
  process.env.CAREER_PAGES_JSON = '[]';
  t.after(() => {
    if (previousKey === undefined) delete process.env.FIRECRAWL_API_KEY;
    else process.env.FIRECRAWL_API_KEY = previousKey;
    if (previousPages === undefined) delete process.env.CAREER_PAGES_JSON;
    else process.env.CAREER_PAGES_JSON = previousPages;
  });
  t.mock.method(WorkdayScraper.prototype, 'run', async function () {
    this.lastRunStats = { fetched: 3, afterPreFilter: 2 };
    if (this.company === 'Adobe') throw new Error('Workday fetch failed: 403');
    return 2;
  });
  const results = await runAllScrapers({}, { sourcePrefix: 'workday-' });
  assert.equal(results.length, 19);
  assert.match(results[0].error, /403/);
  assert.equal(results[0].saved, 0);
  assert.equal(results.at(-1).company, 'Wells Fargo');
  assert.equal(results.at(-1).saved, 2);
  assert.ok(results.slice(1).every((row) => row.fetched === 3 && row.afterPreFilter === 2 && !row.error));
});
