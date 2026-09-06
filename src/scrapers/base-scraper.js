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
   * @returns {Array<object>} Normalized jobs.
   */
  parseJobs(rawData) {
    throw new Error(`${this.constructor.name}.parseJobs() must be implemented.`);
  }

  /**
   * Inserts or updates normalized jobs, preserving seen status on updates.
   * @param {Array<object>} jobs Normalized jobs.
   * @returns {number} Number of records written.
   */
  saveToDb(jobs) {
    const statement = this.db.prepare(`
      INSERT INTO jobs (job_id, title, company, location, job_type, description, apply_url, source, posted_at, relevance_score, relevance_reason)
      VALUES (@job_id, @title, @company, @location, @job_type, @description, @apply_url, @source, @posted_at, @relevance_score, @relevance_reason)
      ON CONFLICT(company, job_id) DO UPDATE SET
        title = excluded.title,
        company = excluded.company,
        location = excluded.location,
        job_type = excluded.job_type,
        description = excluded.description,
        apply_url = excluded.apply_url,
        source = excluded.source,
        posted_at = excluded.posted_at,
        relevance_score = excluded.relevance_score,
        relevance_reason = excluded.relevance_reason
    `);
    const saveMany = this.db.transaction((records) => {
      for (const job of records) {
        statement.run({
          job_id: job.job_id ?? job.apply_url,
          title: job.title,
          company: job.company ?? '',
          location: job.location ?? null,
          job_type: job.job_type ?? null,
          description: job.description ?? '',
          apply_url: job.apply_url ?? null,
          source: job.source ?? this.source,
          posted_at: job.posted_at ?? null,
          relevance_score: job.relevance_score == null ? null : Number(job.relevance_score),
          relevance_reason: job.relevance_reason ?? null
        });
      }
      return records.length;
    });
    return saveMany(jobs);
  }

  /**
   * Executes the full scrape, parse, and persistence pipeline.
   * @returns {Promise<number>} Number of records written.
   */
  async run() {
    const jobs = this.parseJobs(await this.scrape());
    return this.saveToDb(jobs);
  }
}
