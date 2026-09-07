import { BaseScraper } from './base-scraper.js';

function cleanHtml(raw = '') {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Scraper for a company's public Greenhouse job board.
 */
export class GreenhouseScraper extends BaseScraper {
  /**
   * @param {object} options Scraper configuration.
   * @param {import('better-sqlite3').Database} options.db Database connection.
   * @param {string} options.company Company name.
   * @param {string} options.slug Greenhouse board token.
   */
  constructor({ db, company, slug }) {
    super({ db, source: `greenhouse-${slug}` });
    this.company = company;
    this.slug = slug;
  }

  /**
   * Fetches all Greenhouse postings, including their full content.
   * @returns {Promise<object>} Greenhouse API response.
   */
  async scrape() {
    let response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${this.slug}/jobs?content=true&limit=500`);
    if (response.status === 404) {
      response = await fetch(`https://job-boards.eu.greenhouse.io/${this.slug}/jobs?content=true&limit=500`);
      if (!response.ok) {
        throw new Error(`Greenhouse fetch failed for ${this.company}: standard endpoint returned 404 and EU endpoint returned ${response.status}`);
      }
    } else if (!response.ok) {
      throw new Error(`Greenhouse fetch failed for ${this.company}: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Filters and maps Greenhouse postings to the normalized job schema.
   * @param {object} response Greenhouse API response.
   * @returns {Array<object>} Frontend-relevant normalized jobs.
   */
  parseJobs(response) {
    const relevantTerms = ['frontend', 'front-end', 'react', 'ui engineer', 'sde', 'software development engineer', 'software engineer', 'member of technical staff', 'mts', 'web engineer', 'full stack', 'fullstack'];
    const rawJobs = response?.jobs ?? [];
    const filteredJobs = rawJobs.filter((job) => relevantTerms.some((term) => job.title?.toLowerCase().includes(term)));
    console.log(`[Greenhouse] ${this.company}: fetched ${rawJobs.length} total jobs, ${filteredJobs.length} passed filter`);
    return filteredJobs
      .map((job) => ({
        job_id: job.id,
        title: job.title,
        company: this.company,
        location: job.location?.name ?? null,
        job_type: 'Full-time',
        description: cleanHtml(job.content),
        apply_url: job.absolute_url,
        source: `greenhouse-${this.slug}`,
        posted_at: job.updated_at,
      }));
  }
}
