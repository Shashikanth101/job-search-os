import '../config/load-env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { getConfig } from '../config/env.js';
import { createDatabase } from '../db.js';
import { deriveLocation } from '../jobs/fields.js';
import { createScrapers } from '../scrapers/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CACHE_PATH = path.join(ROOT, 'tmp', 'location-backfill-cache.json');
const CACHE_MAX_AGE_MS = 6 * 3_600_000;
// These two call Firecrawl / the LLM, so the backfill never runs them.
const SKIPPED_SCRAPERS = new Set(['FirecrawlCareerScraper', 'SwiggyScraper']);
const keyOf = (company, jobId) => `${company ?? ''}\u0000${jobId ?? ''}`;

/**
 * Fetch every public ATS source once (scrape + parse only, no database writes, no LLM) and return the raw location
 * string by posting. Sources that fail are reported and skipped.
 * @param {import('better-sqlite3').Database} db Database connection (never written).
 * @param {{sourcePrefix?: string, log?: (line: string) => void}} [options] Options.
 * @returns {Promise<{raw: Map<string, string|null>, errors: Array<{source: string, error: string}>, sources: number}>} Locations by posting key.
 */
export async function fetchRawLocations(db, { sourcePrefix = '', log = console.log } = {}) {
  const raw = new Map();
  const errors = [];
  const scrapers = createScrapers(db).filter((scraper) => !SKIPPED_SCRAPERS.has(scraper.constructor.name) && scraper.source.startsWith(sourcePrefix));
  for (const scraper of scrapers) {
    try {
      const jobs = await scraper.parseJobs(await scraper.scrape());
      for (const job of jobs) {
        const value = String(job.location_raw ?? job.location ?? '').trim();
        raw.set(keyOf(job.company, job.job_id ?? job.apply_url), value || null);
      }
      log(`[Backfill] ${scraper.source}: ${jobs.length} postings`);
    } catch (error) {
      errors.push({ source: scraper.source, error: error.message });
      log(`[Backfill] ${scraper.source}: FAILED ${error.message}`);
    }
  }
  return { raw, errors, sources: scrapers.length };
}

/**
 * Work out what the backfill would write: location_raw from the fetched ATS strings, then the deterministic fallback for
 * rows whose normalized location is NULL. Pure; does not touch the database.
 * @param {Array<{id: number, company: string, job_id: string, source: string, location: string|null, location_raw: string|null}>} rows Stored jobs.
 * @param {Map<string, string|null>} raw Raw ATS location by posting key.
 * @returns {{rawUpdates: Array<{id: number, location_raw: string}>, locationUpdates: Array<{id: number, location: string, from: string}>, counts: object, underivable: Map<string, number>}} Plan and counts.
 */
export function planBackfill(rows, raw) {
  const rawUpdates = [];
  const locationUpdates = [];
  const underivable = new Map();
  const counts = { rows: rows.length, nullLocation: 0, nullLocationSeenInScrape: 0, nullLocationWithRaw: 0, nullLocationNotSeen: 0, nullLocationEmptyRaw: 0, locationRawToFill: 0, locationDerivable: 0, locationUnderivable: 0 };
  for (const row of rows) {
    const key = keyOf(row.company, row.job_id);
    const seen = raw.has(key);
    const fetched = seen ? raw.get(key) : null;
    const effectiveRaw = row.location_raw ?? fetched;
    if (!row.location_raw && fetched) {
      rawUpdates.push({ id: row.id, location_raw: fetched });
      counts.locationRawToFill += 1;
    }
    if (row.location != null && row.location !== '') continue;
    counts.nullLocation += 1;
    if (seen) counts.nullLocationSeenInScrape += 1; else counts.nullLocationNotSeen += 1;
    if (!effectiveRaw) {
      if (seen) counts.nullLocationEmptyRaw += 1;
      continue;
    }
    counts.nullLocationWithRaw += 1;
    const derived = deriveLocation(effectiveRaw);
    if (derived) {
      locationUpdates.push({ id: row.id, location: derived, from: effectiveRaw });
      counts.locationDerivable += 1;
    } else {
      counts.locationUnderivable += 1;
      underivable.set(effectiveRaw, (underivable.get(effectiveRaw) ?? 0) + 1);
    }
  }
  return { rawUpdates, locationUpdates, counts, underivable };
}

/**
 * One-time location backfill. Dry run (default) fetches and reports without writing; `run` takes a VACUUM INTO backup and
 * then writes location_raw (only where it is NULL) and the deterministic fallback location (only where location is NULL).
 * @param {object} [options] Options.
 * @param {string} [options.databasePath] Database file.
 * @param {boolean} [options.run] Apply the plan.
 * @param {boolean} [options.refresh] Ignore the fetch cache.
 * @param {string} [options.sourcePrefix] Only fetch sources starting with this prefix.
 * @param {boolean} [options.network] false (CLI --no-network) skips every fetch and only derives location from the stored location_raw.
 * @param {string} [options.cachePath] Fetch cache file (a dry run's fetch is reused by --run within 6 hours).
 * @param {(line: string) => void} [options.log] Logger.
 * @returns {Promise<object>} Counts, source errors, backup path and whether the cache was used.
 */
export async function backfillLocations({ databasePath = getConfig().databasePath, run = false, refresh = false, sourcePrefix = '', cachePath = CACHE_PATH, network = true, log = console.log } = {}) {
  const file = path.resolve(databasePath);
  // --run opens through createDatabase so migrations 009/010 are applied; a dry run opens read-only and tolerates the column not existing yet.
  const db = run ? createDatabase(file) : new Database(file, { readonly: true, fileMustExist: true });
  try {
    let raw;
    let errors = [];
    let usedCache = false;
    const cached = network && !refresh && !sourcePrefix && fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : null;
    if (!network) {
      raw = new Map();
      log('[Backfill] --no-network: no fetch; deriving location from the stored location_raw only.');
    } else if (cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_MAX_AGE_MS) {
      raw = new Map(cached.entries);
      errors = cached.errors;
      usedCache = true;
      log(`[Backfill] Reusing the fetch from ${cached.fetchedAt} (${raw.size} postings); pass --refresh to fetch again.`);
    } else {
      const fetched = await fetchRawLocations(db, { sourcePrefix, log });
      raw = fetched.raw;
      errors = fetched.errors;
      if (!sourcePrefix) {
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify({ fetchedAt: new Date().toISOString(), entries: [...raw], errors }));
      }
    }
    const hasRawColumn = db.prepare('PRAGMA table_info(jobs)').all().some((column) => column.name === 'location_raw');
    const rows = db.prepare(`SELECT id, company, job_id, source, location, ${hasRawColumn ? 'location_raw' : 'NULL AS location_raw'} FROM jobs`).all();
    const plan = planBackfill(rows, raw);
    let backup = null;
    if (run && (plan.rawUpdates.length || plan.locationUpdates.length)) {
      backup = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}-pre-location-backfill`;
      db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
      const setRaw = db.prepare('UPDATE jobs SET location_raw = ? WHERE id = ? AND location_raw IS NULL');
      const setLocation = db.prepare("UPDATE jobs SET location = ? WHERE id = ? AND (location IS NULL OR location = '')");
      db.transaction(() => {
        for (const update of plan.rawUpdates) setRaw.run(update.location_raw, update.id);
        for (const update of plan.locationUpdates) setLocation.run(update.location, update.id);
      })();
    }
    return { ...plan, errors, backup, usedCache, applied: run };
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const run = args.includes('--run');
  const sourcePrefix = args.find((arg) => arg.startsWith('--source='))?.slice('--source='.length) ?? '';
  backfillLocations({ run, refresh: args.includes('--refresh'), sourcePrefix, network: !args.includes('--no-network') }).then((result) => {
    console.log(`\n[Backfill] ${run ? 'APPLIED' : 'DRY RUN (no database writes; pass --run to apply)'}`);
    console.log(JSON.stringify(result.counts, null, 2));
    const top = [...result.underivable].sort((a, b) => b[1] - a[1]).slice(0, 15);
    if (top.length) console.log(`Most common raw locations the fallback cannot decide (left NULL):\n${top.map(([value, count]) => `  ${count} x ${JSON.stringify(value)}`).join('\n')}`);
    if (result.errors.length) console.log(`Sources that failed to fetch (${result.errors.length}): ${result.errors.map((entry) => entry.source).join(', ')}`);
    if (result.backup) console.log(`Backup: ${path.relative(process.cwd(), result.backup)}`);
  }).catch((error) => {
    console.error(`[Backfill] ${error.message}`);
    process.exitCode = 1;
  });
}
