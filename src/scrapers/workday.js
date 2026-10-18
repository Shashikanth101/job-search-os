import { setTimeout as delay } from 'node:timers/promises';
import { BaseScraper } from './base-scraper.js';
import { classifyTitle, isLocationEligible, preFilterJobs } from './pre-filter.js';

/**
 * Resolve either public Workday career URL format to its CXS API and board URL.
 * @param {string} careerUrl Standard or /recruiting/ career board URL.
 * @returns {{tenant: string, wdNumber: string, siteName: string, apiBase: string, boardUrl: string, appliedFacets: Record<string, string[]>}}
 */
export function parseWorkdayUrl(careerUrl) {
  const url = new URL(careerUrl);
  const standard = url.hostname.match(/^([a-z0-9-]+)\.wd(\d+)\.myworkdayjobs\.com$/i);
  const alternate = url.hostname.match(/^wd(\d+)\.myworkdaysite\.com$/i);
  const parts = url.pathname.split('/').filter(Boolean);
  if (/^[a-z]{2}-[a-z]{2}$/i.test(parts[0])) parts.shift();
  const tenant = standard?.[1] ?? (alternate && parts[0] === 'recruiting' ? parts[1] : null);
  const siteName = standard ? parts[0] : parts[2];
  if (url.protocol !== 'https:' || !tenant || !siteName || !/^[\w-]+$/.test(siteName)
    || !/^[a-z0-9-]+$/i.test(tenant) || url.port || url.username || url.password) {
    throw new Error('Unsupported Workday career URL');
  }
  const wdNumber = standard?.[2] ?? alternate[1];
  const origin = `https://${tenant}.wd${wdNumber}.myworkdayjobs.com`;
  // Workday facets use opaque hexadecimal IDs. Preserve custom key casing and
  // repeated values; exclude search/navigation/tracking parameters explicitly.
  const excluded = /^(?:utm_.*|source|sourceId|ref|referrer|q|query|searchText|offset|limit|page|sort|sortBy|locale|language)$/i;
  const facetEntries = new Map();
  for (const [key, value] of url.searchParams) {
    if (excluded.test(key) || !/^[a-z][\w-]*$/i.test(key) || !/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(value)) continue;
    facetEntries.set(key, [...(facetEntries.get(key) ?? []), value]);
  }
  return {
    tenant, wdNumber, siteName, appliedFacets: Object.fromEntries(facetEntries),
    apiBase: `${origin}/wday/cxs/${tenant}/${siteName}`,
    boardUrl: standard ? `${origin}/${siteName}` : `${url.origin}/recruiting/${tenant}/${siteName}`,
  };
}

function cleanHtml(raw = '') {
  return raw.replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, (entity) => ({
      '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ',
    })[entity])
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, code) => {
      const value = /^x/i.test(code) ? parseInt(code.slice(1), 16) : Number(code);
      return value <= 0x10ffff ? String.fromCodePoint(value) : entity;
    }).replace(/\s+/g, ' ').trim();
}

/** Public Workday CXS scraper with URL-derived routing and optional facets. */
export class WorkdayScraper extends BaseScraper {
  /**
   * @param {object} options Configuration.
   * @param {import('better-sqlite3').Database} options.db Database connection.
   * @param {string} options.company Company name.
   * @param {string} options.url Career board URL in either supported format.
   * @param {Record<string, string[]>} [options.appliedFacets] Override URL facets; {} explicitly fetches all jobs.
   */
  constructor({ db, company, url, appliedFacets }) {
    const board = parseWorkdayUrl(url);
    super({ db, source: `workday-${board.tenant}-${board.siteName}` });
    Object.assign(this, board, { company, appliedFacets: appliedFacets ?? board.appliedFacets });
  }

  /**
   * Fetch JSON with a timeout and bounded retries for transient HTTP failures.
   * @param {string} path CXS-relative endpoint.
   * @param {object} [options] Fetch options.
   * @returns {Promise<object>} JSON response.
   */
  async request(path, options = {}) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.apiBase}${path}`, {
        ...options, headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Language': 'en-US' },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return await response.json();
      if (attempt < 2 && (response.status === 429 || response.status >= 500)) {
        await response.body?.cancel();
        await delay(1000 * (attempt + 1));
        continue;
      }
      throw new Error(`Workday fetch failed for ${this.company}: ${response.status} (${path})`);
    }
  }

  /**
   * Paginate all listings, then resolve details before applying location eligibility.
   * @returns {Promise<object>} Listings, enriched details, facets and validation counts.
   */
  async scrape() {
    this.lastRunStats = { fetched: 0, afterPreFilter: 0, invalidListings: 0, detailFailures: 0, laterZeroTotals: 0, paginationStoppedEarly: false };
    const jobPostings = [];
    const seen = new Set();
    let total = 0;
    let facets = [];
    let offset = 0;
    do {
      const page = await this.request('/jobs', {
        method: 'POST', body: JSON.stringify({ appliedFacets: this.appliedFacets, limit: 20, offset, searchText: '' }),
      });
      if (!Array.isArray(page?.jobPostings) || !Number.isInteger(page.total) || page.total < 0) {
        throw new Error(`Workday response for ${this.company} is missing valid jobPostings/total`);
      }
      // Later pages can report total: 0 even while returning more postings.
      if (offset === 0) {
        total = page.total;
        facets = page.facets ?? [];
      } else if (page.total === 0 && page.jobPostings.length) {
        this.lastRunStats.laterZeroTotals += 1;
        console.log(`[Workday] ${this.company}: ignoring later-page total: 0 at offset ${offset}; retaining ${total}`);
      }
      let added = 0;
      let valid = 0;
      for (const posting of page.jobPostings) {
        if (typeof posting?.title !== 'string' || !/^\/job\/[^?#]+$/.test(posting?.externalPath)) {
          this.lastRunStats.invalidListings += 1;
          console.warn(`[Workday] ${this.company}: skipping incomplete/invalid listing at offset ${offset}: ${JSON.stringify(posting)}`);
          continue;
        }
        valid += 1;
        if (seen.has(posting.externalPath)) continue;
        seen.add(posting.externalPath);
        jobPostings.push(posting);
        added += 1;
      }
      this.lastRunStats.fetched = jobPostings.length;
      if (!added && (valid > 0 || page.jobPostings.length === 0) && offset < total) {
        this.lastRunStats.paginationStoppedEarly = true;
        console.warn(`[Workday] ${this.company}: pagination stopped at ${offset}/${total}; retaining ${jobPostings.length} listings (empty/repeated page)`);
        break;
      }
      offset += page.jobPostings.length;
    } while (offset < total);

    const candidates = jobPostings.filter((job) => classifyTitle(job.title, { company: this.company }) !== 'deny');
    const jobs = [];
    let detailFailures = 0;
    // Four requests at a time; ambiguous/multiple locations must be resolved, never guessed.
    for (let start = 0; start < candidates.length; start += 4) {
      const batch = await Promise.all(candidates.slice(start, start + 4).map(async (posting) => {
        try {
          const data = await this.request(posting.externalPath);
          if (!data?.jobPostingInfo || typeof data.jobPostingInfo.title !== 'string') {
            throw new Error('Missing jobPostingInfo/title');
          }
          return { ...posting, detail: data.jobPostingInfo };
        } catch (error) {
          detailFailures += 1;
          console.warn(`[Workday] ${this.company}: skipping ${posting.externalPath}: ${error.message}`);
          return null;
        }
      }));
      jobs.push(...batch.filter(Boolean));
      if ((start + 4) % 100 === 0) {
        console.log(`[Workday] ${this.company}: resolved ${start + 4}/${candidates.length} detail requests`);
      }
    }
    console.log(`[Workday] ${this.company}: ${jobPostings.length}/${total} listings, ${jobs.length} details, ${detailFailures} detail failures`);
    this.lastRunStats.detailFailures = detailFailures;
    return { total, jobPostings, jobs, facets, detailFailures };
  }

  /**
   * Normalize detailed postings and enforce the existing title/location pre-filter.
   * @param {object} response Enriched scrape response.
   * @returns {Array<object>} Jobs eligible for ranking and persistence.
   */
  parseJobs(response) {
    const jobs = (response?.jobs ?? []).filter(({ detail }) => detail.posted !== false && detail.canApply !== false)
      .map(({ externalPath, detail }) => {
        const locations = [
          [detail.location, detail.country?.descriptor].filter(Boolean).join(', '),
          ...(detail.additionalLocations ?? []),
        ].filter(Boolean);
        return {
          job_id: detail.jobReqId || detail.id || externalPath,
          title: detail.title,
          company: this.company,
          location: locations.join('; ') || null,
          eligibleLocation: locations.find((location) => isLocationEligible(location)) ?? null,
          job_type: detail.timeType ?? 'Full-time',
          description: cleanHtml(detail.jobDescription ?? ''),
          apply_url: detail.externalUrl || `${this.boardUrl}${externalPath}`,
          source: this.source,
          posted_at: /^\d{4}-\d{2}-\d{2}$/.test(detail.startDate ?? '') ? detail.startDate : null,
        };
      });
    // Evaluate each ATS location independently: a primary US country must not mask
    // an additional eligible city such as Bangalore. Preserve all locations for ranking.
    const accepted = preFilterJobs(jobs.map(({ location, eligibleLocation, ...job }) => ({
      ...job, location: eligibleLocation, originalLocation: location,
    })), this).map(({ originalLocation, ...job }) => ({ ...job, location: originalLocation }));
    if (this.lastRunStats) this.lastRunStats.afterPreFilter = accepted.length;
    return accepted;
  }
}
