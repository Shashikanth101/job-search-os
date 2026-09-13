import { BaseScraper } from './base-scraper.js';
import { preFilterJobs } from './pre-filter.js';

/**
 * Scraper for a company's public Lever job board.
 */
export class LeverScraper extends BaseScraper {
  /**
   * @param {object} options Scraper configuration.
   * @param {import('better-sqlite3').Database} options.db Database connection.
   * @param {string} options.company Company name.
   * @param {string} options.slug Lever board token.
   */
  constructor({ db, company, slug }) {
    super({ db, source: `lever-${slug}` });
    this.company = company;
    this.slug = slug;
  }

  /**
   * Fetches all postings from Lever's public postings API.
   * @returns {Promise<Array<object>>} Lever job postings.
   */
  async scrape() {
    const response = await fetch(`https://api.lever.co/v0/postings/${this.slug}?mode=json`);
    if (!response.ok) throw new Error(`Lever fetch failed for ${this.company}: ${response.status}`);
    return response.json();
  }

  /**
   * Filters and maps Lever postings to the normalized job schema.
   * @param {Array<object>} postings Lever job postings.
   * @returns {Array<object>} Frontend-relevant normalized jobs.
   */
  parseJobs(postings) {
    return preFilterJobs((postings ?? [])
      .map((posting) => ({
        job_id: posting.id,
        title: posting.text,
        company: this.company,
        location: posting.categories?.location,
        job_type: posting.categories?.commitment,
        description: (posting.descriptionPlain ?? '')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 2000),
        apply_url: posting.applyUrl ?? posting.hostedUrl,
        source: `lever-${this.slug}`,
        posted_at: new Date(posting.createdAt).toISOString(),
      })), this);
  }
}
