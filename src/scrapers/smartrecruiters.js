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
 * Scraper for a company's public SmartRecruiters job board.
 */
export class SmartRecruitersScraper extends BaseScraper {
  /**
   * @param {object} options Scraper configuration.
   * @param {import('better-sqlite3').Database} options.db Database connection.
   * @param {string} options.company Company name.
   * @param {string} options.slug SmartRecruiters company identifier.
   */
  constructor({ db, company, slug }) {
    super({ db, source: `smartrecruiters-${slug}` });
    this.company = company;
    this.slug = slug;
  }

  /**
   * Fetches public SmartRecruiters postings.
   * @returns {Promise<object>} SmartRecruiters API response.
   */
  async scrape() {
    const content = [];
    let total = Infinity;
    while (content.length < total) {
      const response = await fetch(`https://api.smartrecruiters.com/v1/companies/${this.slug}/postings?limit=100&offset=${content.length}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`SmartRecruiters fetch failed for ${this.company}: ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data?.content)) throw new Error(`SmartRecruiters response for ${this.company} is missing its content array`);
      if (!data.content.length) break;
      content.push(...data.content);
      total = typeof data.totalFound === 'number' ? data.totalFound : content.length;
    }
    const filteredJobs = this.parseJobs({ content });
    const jobsWithDetails = await Promise.all(filteredJobs.map(async (job) => {
      try {
        const detailResponse = await fetch(`https://api.smartrecruiters.com/v1/companies/${this.slug}/postings/${job.job_id}`, {
          signal: AbortSignal.timeout(30000),
        });
        if (!detailResponse.ok) return { ...job, description: '' };
        const detail = await detailResponse.json();
        return { ...job, description: detail?.jobAd?.sections?.jobDescription?.text ?? '' };
      } catch {
        return { ...job, description: '' };
      }
    }));
    return { normalizedJobs: jobsWithDetails };
  }

  /**
   * Filters and maps SmartRecruiters postings to the normalized job schema.
   * @param {object} response SmartRecruiters API response.
   * @returns {Array<object>} Frontend-relevant normalized jobs.
   */
  parseJobs(response) {
    if (response?.normalizedJobs) return response.normalizedJobs.map((job) => ({ ...job, description: cleanHtml(job.description).slice(0, 2000) }));
    const jobs = (response?.content ?? [])
      .map((job) => ({
        job_id: String(job.id),
        title: job.name,
        company: this.company,
        location: [job.location?.city, job.location?.region, countryName(job.location?.country)]
          .filter(Boolean).join(', ') || (job.location?.remote ? 'Remote' : null),
        job_type: String(job.typeOfEmployment?.label ?? job.typeOfEmployment?.id ?? 'Full-time'),
        description: cleanHtml(String(job.description ?? '').slice(0, 2000)),
        apply_url: `https://careers.smartrecruiters.com/${this.slug}/${job.id}`,
        source: `smartrecruiters-${this.slug}`,
        posted_at: job.releasedDate ? String(job.releasedDate) : null,
      }));

    return preFilterJobs(jobs, this);
  }
}
