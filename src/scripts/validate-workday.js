import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { WorkdayScraper } from '../scrapers/workday.js';

// Isolated live validation: no registry changes or writes to the user's job database.
const db = new Database(':memory:');
db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
try {
  for (const [company, url] of [
    ['Adobe', 'https://adobe.wd5.myworkdayjobs.com/external_experienced'],
    ['Cisco', 'https://cisco.wd5.myworkdayjobs.com/Cisco_Careers'],
  ]) {
    const scraper = new WorkdayScraper({ db, company, url });
    const raw = await scraper.scrape();
    assert.equal(raw.jobPostings.length, raw.total, `${company}: incomplete pagination`);
    const jobs = scraper.parseJobs(raw);
    assert.ok(jobs.length > 0, `${company}: no eligible jobs`);
    const saved = scraper.saveToDb(jobs);
    assert.equal(saved, jobs.length);
    const sample = jobs.find((job) => /software engineer|front.?end|full.?stack/i.test(job.title)) ?? jobs[0];
    if (process.argv.includes('--rank-sample')) {
      // Reuse fetched data and exercise the unchanged BaseScraper.run with one real LLM call.
      scraper.scrape = async () => ({ jobs: raw.jobs.filter(({ detail }) => (detail.jobReqId || detail.id) === sample.job_id) });
      assert.equal(await scraper.run(), 1);
      const ranked = db.prepare('SELECT relevance_score, relevance_reason FROM jobs WHERE company = ? AND job_id = ?').get(company, sample.job_id);
      assert.ok(ranked.relevance_score > 0, `${company}: live ranking failed`);
      console.log(`[Validation] ${company} live ranking: ${JSON.stringify(ranked)}`);
    }
    const rows = db.prepare('SELECT count(*) AS count FROM jobs WHERE company = ?').get(company).count;
    assert.equal(rows, new Set(jobs.map((job) => job.job_id)).size);
    console.log(`[Validation] ${JSON.stringify({ company, fetched: raw.jobPostings.length, total: raw.total,
      details: raw.jobs.length, detailFailures: raw.detailFailures, eligible: jobs.length, saved, rows,
      listing: raw.jobPostings.find((posting) => posting.externalPath === raw.jobs.find(({ detail }) => detail.jobReqId === sample.job_id)?.externalPath),
      sample: { ...sample, description: sample.description.slice(0, 160) } })}`);
    if (raw.detailFailures) process.exitCode = 1;
  }
} finally {
  db.close();
}
