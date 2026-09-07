import { BaseScraper } from './base-scraper.js';

const relevantTerms = ['frontend', 'front-end', 'react', 'ui engineer', 'sde', 'software development engineer', 'software engineer', 'member of technical staff', 'mts', 'web engineer', 'full stack', 'fullstack'];
const excludedTerms = ['backend', 'devops', 'infrastructure', 'ios', 'android', 'qa', 'data scientist', 'data engineer', 'security', 'finance', 'hr', 'legal', 'sales', 'marketing'];

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
    const response = await fetch(`https://api.smartrecruiters.com/v1/companies/${this.slug}/postings?limit=100`);
    if (!response.ok) throw new Error(`SmartRecruiters fetch failed for ${this.company}: ${response.status}`);
    const data = await response.json();
    const filteredJobs = (data?.content ?? []).filter((job) => {
      const title = String(job.name ?? '').toLowerCase();
      return relevantTerms.some((term) => title.includes(term))
        && !excludedTerms.some((term) => title.includes(term));
    });
    const jobsWithDetails = await Promise.all(filteredJobs.map(async (job) => {
      try {
        const detailResponse = await fetch(`https://api.smartrecruiters.com/v1/companies/${this.slug}/postings/${job.id}`);
        if (!detailResponse.ok) return { ...job, description: '' };
        const detail = await detailResponse.json();
        return { ...job, description: detail?.jobAd?.sections?.jobDescription?.text ?? '' };
      } catch {
        return { ...job, description: '' };
      }
    }));
    return { ...data, content: jobsWithDetails };
  }

  /**
   * Filters and maps SmartRecruiters postings to the normalized job schema.
   * @param {object} response SmartRecruiters API response.
   * @returns {Array<object>} Frontend-relevant normalized jobs.
   */
  parseJobs(response) {
    const jobs = (response?.content ?? [])
      .filter((job) => {
        const title = String(job.name ?? '').toLowerCase();
        return relevantTerms.some((term) => title.includes(term))
          && !excludedTerms.some((term) => title.includes(term));
      })
      .map((job) => ({
        job_id: String(job.id),
        title: job.name,
        company: this.company,
        location: String(job.location?.city ?? job.location?.country ?? job.location?.remote ?? 'India'),
        job_type: String(job.typeOfEmployment?.label ?? job.typeOfEmployment?.id ?? 'Full-time'),
        description: cleanHtml(String(job.description ?? '').slice(0, 2000)),
        apply_url: `https://careers.smartrecruiters.com/${this.slug}/${job.id}`,
        source: `smartrecruiters-${this.slug}`,
        posted_at: job.releasedDate ? String(job.releasedDate) : null,
      }));

    return jobs;
  }
}
