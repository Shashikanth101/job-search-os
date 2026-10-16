import { rankJob } from '../ranker/index.js';
import { normalizeJobType } from '../jobs/fields.js';
import { PREFILTER_VERSION, evaluateJobRules } from './pre-filter.js';

/**
 * Base contract for every job scraper.
 */
export class BaseScraper {
  /**
   * @param {object} options Scraper configuration.
   * @param {import('better-sqlite3').Database} options.db Database connection.
   * @param {string} [options.source] Human-readable source name.
   */
  constructor({ db, source = 'unknown' }) {
    if (!db) throw new Error('A database connection is required by BaseScraper.');
    this.db = db;
    this.source = source;
  }

  /**
   * Downloads raw source data. Subclasses must implement this method.
   * @returns {Promise<unknown>} Raw source data.
   */
  async scrape() {
    throw new Error(`${this.constructor.name}.scrape() must be implemented.`);
  }

  /**
   * Converts raw source data into normalized job records.
   * @param {unknown} rawData Raw scraper response.
   * @returns {Array<object> | Promise<Array<object>>} Normalized jobs.
   */
  parseJobs(rawData) {
    throw new Error(`${this.constructor.name}.parseJobs() must be implemented.`);
  }

  /**
   * Inserts new jobs (stamping their pre-filter verdict) and refreshes only non-user
   * metadata of existing rows. A re-scrape never changes prefilter_*, relevance_*,
   * location (ranker-normalized), status, is_new or resume_path.
   * @param {Array<object>} jobs Normalized jobs.
   * @returns {number} Number of records written.
   */
  saveToDb(jobs) {
    const statement = this.db.prepare(`
      INSERT INTO jobs (job_id, title, company, location, job_type, description, apply_url, source, posted_at, relevance_score, relevance_reason,
        prefilter_status, prefilter_reason, prefilter_version, prefilter_checked_at)
      VALUES (@job_id, @title, @company, @location, @job_type, @description, @apply_url, @source, @posted_at, @relevance_score, @relevance_reason,
        'passed', NULL, @prefilter_version, CURRENT_TIMESTAMP)
      ON CONFLICT(company, job_id) DO UPDATE SET
        title = excluded.title,
        job_type = excluded.job_type,
        description = excluded.description,
        apply_url = excluded.apply_url,
        posted_at = excluded.posted_at
    `);
    const existingUrl = this.db.prepare('SELECT id, company, job_id, source FROM jobs WHERE apply_url = ?');
    const existingPosting = this.db.prepare('SELECT id FROM jobs WHERE company = ? AND job_id = ?');
    const saveMany = this.db.transaction((records) => {
      let saved = 0;
      for (const job of records) {
        const isExistingPosting = existingPosting.get(job.company ?? '', job.job_id ?? job.apply_url);
        // Scrapers without their own pre-filter (Firecrawl, Swiggy) still never persist rejected jobs.
        if (!isExistingPosting && !evaluateJobRules({ ...job, source: job.source ?? this.source }).pass) continue;
        const existing = existingUrl.get(job.apply_url ?? null);
        if (existing && (existing.source === 'manual'
          || existing.id !== existingPosting.get(job.company ?? '', job.job_id ?? job.apply_url)?.id)) continue;
        statement.run({
          job_id: job.job_id ?? job.apply_url,
          title: job.title,
          company: job.company ?? '',
          location: job.location ?? null,
          job_type: normalizeJobType(job.job_type) || 'full-time',
          description: job.description ?? '',
          apply_url: job.apply_url ?? null,
          source: job.source ?? this.source,
          posted_at: job.posted_at ?? null,
          relevance_score: job.relevance_score == null ? null : Number(job.relevance_score),
          relevance_reason: job.relevance_reason ?? null,
          prefilter_version: PREFILTER_VERSION
        });
        saved += 1;
      }
      return saved;
    });
    return saveMany(jobs);
  }

  /**
   * Executes the full scrape, parse, rank, and persistence pipeline.
   * @returns {Promise<number>} Number of records written.
   */
  async run() {
    const raw = await this.scrape();
    const jobs = await this.parseJobs(raw);

    const ranked = await Promise.all(
      jobs.map(async (job) => {
        try {
          const { score, reason, location } = await rankJob(job.title, job.description, job.company, job.location);
          return { ...job, location, relevance_score: score, relevance_reason: reason };
        } catch (error) {
          console.error(`Ranking failed for "${job.title}" at ${job.company}:`, error.message);
          return { ...job, relevance_score: 0, relevance_reason: 'Ranking failed' };
        }
      })
    );

    return this.saveToDb(ranked);
  }
}
