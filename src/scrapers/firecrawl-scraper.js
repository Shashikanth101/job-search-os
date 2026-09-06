import Firecrawl from '@mendable/firecrawl-js';
import { BaseScraper } from './base-scraper.js';

/**
 * Scrapes a JavaScript-rendered careers page through Firecrawl.
 */
export class FirecrawlCareerScraper extends BaseScraper {
  /**
   * @param {object} options Scraper configuration.
   * @param {import('better-sqlite3').Database} options.db Database connection.
   * @param {string} options.url Careers page URL.
   * @param {string} options.company Company name.
   * @param {string} [options.source] Source label.
   */
  constructor({ db, url, company, source }) {
    super({ db, source: source ?? company });
    if (!url || !company) throw new Error('Firecrawl scrapers require url and company.');
    this.url = url;
    this.company = company;
    this.client = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  }

  /**
   * Fetches the careers page using Firecrawl's rendered markdown output.
   * @returns {Promise<object>} Firecrawl response.
   */
  async scrape() {
    if (!process.env.FIRECRAWL_API_KEY) {
      throw new Error(`FIRECRAWL_API_KEY is required to scrape ${this.company}.`);
    }
    return this.client.scrapeUrl(this.url, { formats: ['markdown'], onlyMainContent: true });
  }

  /**
   * Extracts job-like markdown links from a Firecrawl response.
   * @param {object} response Firecrawl response.
   * @returns {Array<object>} Normalized job records.
   */
  parseJobs(response) {
    const markdown = response?.markdown ?? '';
    const jobs = [];
    const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    for (const match of markdown.matchAll(linkPattern)) {
      const title = match[1].replace(/[*_]/g, '').trim();
      if (!title || /^(apply|learn more|view|search|home)$/i.test(title)) continue;
      jobs.push({
        job_id: match[2],
        title,
        company: this.company,
        location: null,
        apply_url: match[2],
        job_type: null,
        description: markdown.slice(Math.max(0, match.index - 300), match.index + 600).trim(),
        source: this.source,
        posted_at: null,
        relevance_score: null,
        relevance_reason: null
      });
    }
    return jobs;
  }
}
