import { FirecrawlCareerScraper } from './firecrawl-scraper.js';

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
 * @returns {Array<FirecrawlCareerScraper>} Configured scrapers.
 */
export function createScrapers(db) {
  return loadCareerPages().map((page) => new FirecrawlCareerScraper({ db, ...page }));
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
