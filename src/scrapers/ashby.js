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
    const response = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${this.slug}`);
    if (!response.ok) throw new Error(`Ashby fetch failed for ${this.company}: ${response.status}`);
    return response.json();
  }

  /**
   * Filters and maps Ashby postings to the normalized job schema.
   * @param {object} response Ashby API response.
   * @returns {Array<object>} Frontend-relevant normalized jobs.
   */
  parseJobs(response) {
    const relevantTerms = ['frontend', 'front-end', 'react', 'ui engineer', 'sde', 'software development engineer', 'software engineer', 'member of technical staff', 'mts', 'web engineer', 'full stack', 'fullstack'];
    const excludedTerms = ['backend', 'devops', 'infrastructure', 'ios', 'android', 'qa', 'data scientist', 'data engineer', 'security', 'finance', 'hr', 'legal', 'sales', 'marketing'];

    return (response?.jobPostings ?? [])
      .filter((job) => {
        const title = String(job.title ?? '').toLowerCase();
        return relevantTerms.some((term) => title.includes(term))
          && !excludedTerms.some((term) => title.includes(term));
      })
      .map((job) => ({
        job_id: job.id,
        title: job.title,
        company: this.company,
        location: job.location ?? 'India',
        job_type: job.employmentType ?? 'Full-time',
        description: cleanHtml((job.descriptionPlain ?? job.descriptionHtml ?? '').slice(0, 2000)),
        apply_url: job.jobUrl,
        source: `ashby-${this.slug}`,
        posted_at: job.publishedAt ?? null,
      }));
  }
}
