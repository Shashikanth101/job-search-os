import FirecrawlApp from '@mendable/firecrawl-js';
import { BaseScraper } from './base-scraper.js';
import { chat } from '../llm/index.js';

/**
 * Scraper for Swiggy's JavaScript-rendered careers page via Firecrawl.
 */
export class SwiggyScraper extends BaseScraper {
  /**
   * @param {object} options Scraper configuration.
   * @param {import('better-sqlite3').Database} options.db Database connection.
   */
  constructor({ db }) {
    super({ db, source: 'swiggy-careers' });
    this.company = 'Swiggy';
    this.firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
  }

  /**
   * Fetches Swiggy's rendered careers page as markdown.
   * @returns {Promise<object>} Firecrawl scrape response.
   */
  async scrape() {
    const result = await this.firecrawl.scrapeUrl('https://careers.swiggy.com/list.html?dept=Engineering', {
      formats: ['markdown'],
      actions: [{ type: 'wait', milliseconds: 3000 }],
    });
    return result;
  }

  /**
   * Extracts engineering jobs from scraped markdown through the configured LLM.
   * @param {object} response Firecrawl scrape response.
   * @returns {Promise<Array<object>>} Normalized Swiggy jobs.
   */
  async parseJobs(response) {
    const markdown = response?.markdown ?? '';
    const prompt = `Extract all engineering job listings from the following Swiggy careers page markdown.
Return ONLY a valid JSON array. Each item must contain exactly these fields:
title, location, apply_url.
If a field is unavailable, use an empty string.

MARKDOWN:
${markdown}`;

    try {
      const raw = await chat(
        'You extract structured job listings from careers pages. Return only valid JSON.',
        prompt,
      );
      const jsonText = raw.replace(/```json|```/gi, '').trim();
      const start = jsonText.indexOf('[');
      const end = jsonText.lastIndexOf(']');
      if (start === -1 || end === -1 || end < start) throw new Error('LLM response did not contain a JSON array.');

      const extracted = JSON.parse(jsonText.slice(start, end + 1));
      if (!Array.isArray(extracted)) throw new Error('LLM response was not an array.');

      const jobs = extracted.map((job, index) => {
        const title = String(job.title ?? '').trim();
        const location = String(job.location ?? '').trim();
        const applyUrl = String(job.apply_url ?? '').trim();
        return {
          job_id: applyUrl || `swiggy-${index}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          title,
          company: this.company,
          location: location || null,
          job_type: null,
          description: '',
          apply_url: applyUrl || null,
          source: this.source,
          posted_at: null,
        };
      }).filter((job) => job.title);
      return jobs;
    } catch (error) {
      console.error('Failed to parse Swiggy careers markdown:', error.message);
      return [];
    }
  }
}
