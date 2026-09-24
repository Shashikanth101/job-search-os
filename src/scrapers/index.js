import { FirecrawlCareerScraper } from './firecrawl-scraper.js';
import { GreenhouseScraper } from './greenhouse.js';
import { LeverScraper } from './lever.js';
import { SmartRecruitersScraper } from './smartrecruiters.js';
import { AshbyScraper } from './ashby.js';
import { SwiggyScraper } from './swiggy.js';
import { WorkdayScraper } from './workday.js';
import { workdayConfigs } from '../config/workday.js';

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
  const greenhouseConfigs = [
    { company: 'Postman', slug: 'postman' },
    { company: 'Razorpay', slug: 'razorpaysoftwareprivatelimited' },
    { company: 'Groww', slug: 'groww' },
    { company: 'Glean', slug: 'gleanwork' },
    { company: 'HackerRank', slug: 'hackerrank' },
    { company: 'Cognite', slug: 'cognite' },
    { company: 'Komodo Health', slug: 'komodohealth' },
    { company: 'Druva', slug: 'druva' },
    { company: 'Zscaler', slug: 'zscaler' },
    { company: 'New Relic', slug: 'newrelic' },
    { company: 'Rubrik', slug: 'rubrik' },
    { company: 'Amplitude', slug: 'amplitude' },
    { company: 'LaunchDarkly', slug: 'launchdarkly' },
    { company: 'Observe.AI', slug: 'observeai' },
    { company: 'ZoomInfo', slug: 'zoominfo' },
    { company: 'Databricks', slug: 'databricks' },
    { company: 'Elastic', slug: 'elastic' },
    { company: 'Canonical', slug: 'canonical' },
    { company: 'Moniepoint Group', slug: 'moniepoint' },
    { company: 'YipitData', slug: 'yipitdata' },
    { company: 'EarnIn', slug: 'earnin' },
    { company: 'Coinbase', slug: 'coinbase' },
    { company: 'Blink Health', slug: 'blinkhealth' },
    { company: 'Instawork', slug: 'instawork' },
    { company: 'Airbnb', slug: 'airbnb' },
    { company: 'GitLab', slug: 'gitlab' },
    { company: 'Anthropic', slug: 'anthropic' },
    { company: 'xAI', slug: 'xai' },
    { company: 'Inflection AI', slug: 'inflectionai' },
    { company: 'Stability AI', slug: 'stabilityai' },
    { company: 'HeyGen', slug: 'heygen' },
    { company: 'Scale AI', slug: 'scaleai' },
    { company: 'CoreWeave', slug: 'coreweave' },
  ];
  const smartRecruitersConfigs = [
    { company: 'PhonePe', slug: 'PHONEPELIMITED' },
    { company: 'Zomato', slug: 'Zomato1' },
    { company: 'Freshworks', slug: 'freshworks' },
    { company: 'Swiggy', slug: 'swiggy' },
    { company: 'ServiceNow', slug: 'servicenow' },
    { company: 'Refyne', slug: 'refyne' },
    { company: 'Upstox', slug: 'upstox' },
  ];
  const leverConfigs = [
    { company: 'DexCare', slug: 'dexcarehealth' },
    { company: 'CRED', slug: 'cred' },
    { company: 'Meesho', slug: 'meesho' },
    { company: 'Acceldata', slug: 'acceldata' },
    { company: 'Palantir Technologies', slug: 'palantir' },
    { company: 'Paytm', slug: 'paytm' },
    { company: 'Spotify', slug: 'spotify' },
  ];
  const ashbyConfigs = [
    { company: 'Hebbia', slug: 'hebbia-ai' },
    { company: 'Gamma', slug: 'gamma', departmentId: '3e8c857e-1085-4c45-86f5-8d192d398ac2' },
    { company: 'UiPath', slug: 'uipath' },
    { company: 'Tekion', slug: 'tekion' },
    { company: 'Harvey', slug: 'harvey' },
    { company: 'Temporal', slug: 'temporal' },
    { company: 'Confluent', slug: 'confluent' },
    { company: 'SpotDraft', slug: 'spotdraft' },
    { company: 'Snowflake', slug: 'snowflake' },
    { company: 'Writer', slug: 'writer' },
    { company: 'Abridge', slug: 'abridge' },
    { company: 'Decagon', slug: 'decagon' },
    { company: 'Anysphere (Cursor)', slug: 'cursor' },
    { company: 'Cognition AI', slug: 'cognition' },
    { company: 'Poolside AI', slug: 'poolside' },
    { company: 'Replit', slug: 'replit' },
    { company: 'LangChain', slug: 'langchain' },
    { company: 'Fireworks AI', slug: 'fireworks' },
    { company: 'OpenAI', slug: 'openai' },
    { company: 'Cohere', slug: 'cohere' },
    { company: 'Moonshot AI', slug: 'moonshot-ai' },
    { company: 'Reka AI', slug: 'reka' },
    { company: 'Liquid AI', slug: 'liquid-ai' },
    { company: 'Runway', slug: 'runway' },
    { company: 'Midjourney', slug: 'midjourney' },
    { company: 'ElevenLabs', slug: 'elevenlabs' },
    { company: 'Black Forest Labs', slug: 'black-forest-labs' },
    { company: 'Luma AI', slug: 'lumaai' },
    { company: 'OpenRouter', slug: 'openrouter' },
    { company: 'Perplexity AI', slug: 'perplexity' },
  ];
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
