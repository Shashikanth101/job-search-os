import { BaseScraper } from './base-scraper.js';
import { preFilterJobs, countryName } from './pre-filter.js';

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
 * Scraper for a company's public Ashby job board.
 */
export class AshbyScraper extends BaseScraper {
  /**
   * @param {object} options Scraper configuration.
   * @param {import('better-sqlite3').Database} options.db Database connection.
   * @param {string} options.company Company name.
   * @param {string} options.slug Ashby job board identifier.
   */
  constructor({ db, company, slug }) {
    super({ db, source: `ashby-${slug}` });
    this.company = company;
    this.slug = slug;
  }

  /**
   * Fetches public Ashby postings.
   * @returns {Promise<object>} Ashby API response.
   */
  async scrape() {
    const response = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(this.slug)}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Ashby fetch failed for ${this.company}: ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data?.jobs)) throw new Error(`Ashby response for ${this.company} is missing its jobs array`);
    return data;
  }

  /**
   * Filters and maps Ashby postings to the normalized job schema.
   * @param {object} response Ashby API response.
   * @returns {Array<object>} Frontend-relevant normalized jobs.
   */
  parseJobs(response) {
    return preFilterJobs((response?.jobs ?? [])
      .map((job) => ({
        job_id: job.id,
        title: job.title,
        company: this.company,
        location: [job.location, countryName(job.address?.postalAddress?.addressCountry),
          ...(job.secondaryLocations ?? []).flatMap((location) => [location.location, countryName(location.address?.postalAddress?.addressCountry)])]
          .filter(Boolean).join('; ') || null,
        job_type: job.employmentType ?? 'Full-time',
        description: cleanHtml((job.descriptionPlain ?? job.descriptionHtml ?? '').slice(0, 2000)),
        apply_url: job.applyUrl ?? job.jobUrl,
        source: `ashby-${this.slug}`,
        posted_at: job.publishedAt ?? null,
      })), this);
  }
}
