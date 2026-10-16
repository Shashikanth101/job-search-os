import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import { createDatabase } from '../db.js';
import { workdayConfigs } from '../config/scrappers.js';
import { WorkdayScraper } from '../scrapers/workday.js';
import { rankJob } from '../ranker/index.js';

// Retry only failed Workday rankings; never overwrite successful scores or user fields.
const db = createDatabase();
try {
  const scrapers = new Map(workdayConfigs.map((config) => {
    const scraper = new WorkdayScraper({ db, ...config });
    return [scraper.source, scraper];
  }));
  const failed = db.prepare("SELECT * FROM jobs WHERE source LIKE 'workday-%' AND relevance_reason = 'Ranking failed'").all();
  const update = db.prepare("UPDATE jobs SET relevance_score = ?, relevance_reason = ?, location = ? WHERE id = ? AND relevance_reason = 'Ranking failed'");
  let recovered = 0;
  for (let start = 0; start < failed.length; start += 4) {
    await Promise.all(failed.slice(start, start + 4).map(async (row) => {
      try {
        const scraper = scrapers.get(row.source);
        if (!scraper) throw new Error('No matching Workday registration');
        const pathname = new URL(row.apply_url).pathname;
        const jobIndex = pathname.indexOf('/job/');
        if (jobIndex < 0) throw new Error('No job path in application URL');
        const externalPath = pathname.slice(jobIndex);
        const { jobPostingInfo: detail } = await scraper.request(externalPath);
        const [job] = scraper.parseJobs({ jobs: [{ externalPath, detail }] });
        if (!job) throw new Error('Job is no longer eligible or available');
        // BaseScraper's failed-ranking fallback stores a null location; restore
        // authoritative location context from Workday before retrying the ranker.
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const result = await rankJob(row.title, row.description, row.company, job.location);
          if (result.score > 0 && result.reason !== 'Ranking failed') {
            recovered += update.run(result.score, result.reason, result.location, row.id).changes;
            return;
          }
          if (attempt < 2) await delay(1000 * (attempt + 1));
        }
        throw new Error('Ranking failed after three attempts');
      } catch (error) {
        console.warn(`[WorkdayRetry] ${row.company} ${row.job_id}: ${error.message}`);
      }
    }));
    console.log(`[WorkdayRetry] processed ${Math.min(start + 4, failed.length)}/${failed.length}; recovered ${recovered}`);
  }
  console.log(`[WorkdayRetry] ${JSON.stringify({ attempted: failed.length, recovered, remaining: failed.length - recovered })}`);
  if (recovered !== failed.length) process.exitCode = 1;
} finally {
  db.close();
}
