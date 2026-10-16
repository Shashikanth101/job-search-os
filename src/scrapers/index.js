import { FirecrawlCareerScraper } from './firecrawl-scraper.js';
import { GreenhouseScraper } from './greenhouse.js';
import { LeverScraper } from './lever.js';
import { SmartRecruitersScraper } from './smartrecruiters.js';
import { AshbyScraper } from './ashby.js';
import { SwiggyScraper } from './swiggy.js';
import { WorkdayScraper } from './workday.js';
import { greenhouseConfigs, smartRecruitersConfigs, leverConfigs, ashbyConfigs, workdayConfigs } from '../config/scrappers.js';

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
 * @returns {Array<FirecrawlCareerScraper | GreenhouseScraper | LeverScraper | SmartRecruitersScraper | AshbyScraper | SwiggyScraper | WorkdayScraper>} Configured scrapers.
 */
export function createScrapers(db) {
  const configuredScrapers = loadCareerPages().map((page) => new FirecrawlCareerScraper({ db, ...page }));

  const greenhouseScrapers = greenhouseConfigs.map((config) => new GreenhouseScraper({ db, ...config }));
  const smartRecruitersScrapers = smartRecruitersConfigs.map((config) => new SmartRecruitersScraper({ db, ...config }));
  const leverScrapers = leverConfigs.map((config) => new LeverScraper({ db, ...config }));
  const ashbyScrapers = ashbyConfigs.map((config) => new AshbyScraper({ db, ...config }));
  const workdayScrapers = workdayConfigs.map((config) => new WorkdayScraper({ db, ...config }));

  return [...configuredScrapers, new SwiggyScraper({ db }), ...greenhouseScrapers, ...smartRecruitersScrapers, ...leverScrapers, ...ashbyScrapers, ...workdayScrapers];
}

/**
 * Runs every configured scraper and logs failures without stopping other sources.
 * @param {import('better-sqlite3').Database} db Database connection.
 * @param {object} [options] Optional source restriction for targeted live validation.
 * @param {string} [options.sourcePrefix] Run only sources starting with this prefix.
 * @returns {Promise<Array<{source: string, saved: number, error?: string}>>} Run results.
 */
export async function runAllScrapers(db, { sourcePrefix = '' } = {}) {
  const results = [];
  for (const scraper of createScrapers(db).filter((entry) => entry.source.startsWith(sourcePrefix))) {
    try {
      const saved = await scraper.run();
      const result = { company: scraper.company, source: scraper.source, ...scraper.lastRunStats, saved };
      results.push(result);
      console.log(`[Scrapers] ${JSON.stringify(result)}`);
    } catch (error) {
      const result = { company: scraper.company, source: scraper.source, ...scraper.lastRunStats, saved: 0, error: error.message };
      results.push(result);
      console.error(`[Scrapers] ${JSON.stringify(result)}`);
    }
  }
  return results;
}
