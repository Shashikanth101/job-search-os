import { BaseScraper } from './base-scraper.js';

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
    const relevantTerms = ['frontend', 'front-end', 'react', 'ui engineer', 'sde', 'software development engineer', 'software engineer', 'member of technical staff', 'mts', 'web engineer', 'full stack', 'fullstack'];
    return (postings ?? [])
      .filter((posting) => {
        const searchableText = [posting.text, posting.categories?.team]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return relevantTerms.some((term) => searchableText.includes(term));
      })
      .map((posting) => ({
        job_id: posting.id,
        title: posting.text,
        company: this.company,
        location: posting.categories?.location,
        job_type: posting.categories?.commitment,
        description: posting.descriptionPlain?.slice(0, 2000) ?? '',
        apply_url: posting.applyUrl ?? posting.hostedUrl,
        source: `lever-${this.slug}`,
        posted_at: new Date(posting.createdAt).toISOString(),
      }));
  }
}
