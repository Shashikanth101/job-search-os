import { FirecrawlCareerScraper } from './firecrawl-scraper.js';
import { GreenhouseScraper } from './greenhouse.js';
import { LeverScraper } from './lever.js';
import { SwiggyScraper } from './swiggy.js';

/**
 * Parses the optional JSON scraper configuration from the environment.
 * @returns {Array<{url: string, company: string, source?: string}>} Career pages.
 */
export function loadCareerPages() {
  try {
    const pages = JSON.parse(process.env.CAREER_PAGES_JSON ?? '[]');
    if (!Array.isArray(pages)) throw new Error('CAREER_PAGES_JSON must be an array.');
    return pages;
  } catch (error) {
    throw new Error(`Invalid CAREER_PAGES_JSON: ${error.message}`);
  }
}

/**
 * Builds all configured scraper instances.
 * @param {import('better-sqlite3').Database} db Database connection.
 * @returns {Array<FirecrawlCareerScraper | GreenhouseScraper | LeverScraper | SwiggyScraper>} Configured scrapers.
 */
export function createScrapers(db) {
  const configuredScrapers = loadCareerPages().map((page) => new FirecrawlCareerScraper({ db, ...page }));
  const greenhouseConfigs = [
    { company: 'Postman', slug: 'postman' },
    { company: 'Razorpay', slug: 'razorpaysoftwareprivatelimited' },
    { company: 'Groww', slug: 'groww' },
    { company: 'PhonePe', slug: 'phonepe' },
  ];
  const leverConfigs = [
    { company: 'CRED', slug: 'cred' },
    { company: 'Meesho', slug: 'meesho' },
  ];
  const greenhouseScrapers = greenhouseConfigs.map((config) => new GreenhouseScraper({ db, ...config }));
  const leverScrapers = leverConfigs.map((config) => new LeverScraper({ db, ...config }));
  return [...configuredScrapers, new SwiggyScraper({ db }), ...greenhouseScrapers, ...leverScrapers];
}

/**
 * Runs every configured scraper and logs failures without stopping other sources.
 * @param {import('better-sqlite3').Database} db Database connection.
 * @returns {Promise<Array<{source: string, saved: number, error?: string}>>} Run results.
 */
export async function runAllScrapers(db) {
  const results = [];
  for (const scraper of createScrapers(db)) {
    try {
      results.push({ source: scraper.source, saved: await scraper.run() });
    } catch (error) {
      results.push({ source: scraper.source, saved: 0, error: error.message });
      console.error(`Scraper failed for ${scraper.source}:`, error.message);
    }
  }
  return results;
}
