# 0017: Raw ATS location is kept, the model's null never erases a location, and the server catches up on startup

## Status
Accepted

## Context
The ranker wrote `location = @location` on every rank, so whenever the model returned null the stored location was
overwritten with NULL (and the original ATS string was gone): 2,011 of 3,256 jobs had a NULL location. Fetching ran
only from cron inside the server process (`0 9,18 * * *` Asia/Kolkata); a server that was off at those times simply
missed the cycle, and `npm run scrape` only scraped.

## Decision
- **`jobs.location_raw` (migration 009):** every scraper's ATS location string, stored untouched at insert
  (`BaseScraper.saveToDb`, `job.location_raw ?? job.location`). A re-scrape fills it only when it is NULL and never
  rewrites it. `location` remains the normalized value (ranker vocabulary: Indian cities, "India", country names).
- **Rank updates:** `location = COALESCE(@location, location, @fallbackLocation)`: the model's value wins, a stored value
  is never replaced by the model's null, and a NULL location falls back to `deriveLocation(location_raw)`.
- **`deriveLocation` (src/jobs/fields.js):** deterministic, no LLM. An Indian place wins (one known city gives that
  city, several or other Indian places give "India"); otherwise exactly one country (names, a few aliases such as UK/UAE/USA,
  US state codes) is required, several countries or none give NULL. "Georgia" and "New Mexico" are never read as countries.
- **Backfill (`npm run backfill:location`):** dry run by default. It re-fetches every public ATS source (scrape + parse, no
  writes, no Firecrawl/LLM scrapers), caches the result in `tmp/location-backfill-cache.json` (reused by `--run` for 6 hours),
  and reports counts. `--run` takes a `VACUUM INTO` backup, applies migrations, fills `location_raw` where NULL and sets
  `location` only where it is NULL.
- **Scheduling:** cron in the server process is unchanged. `cycle_runs` (migration 010) records each completed cycle
  (scrape finished; rank errors do not prevent the record). On startup `catchUpIfStale` runs one cycle when the newest
  completed cycle is older than `FETCH_CATCHUP_HOURS` (default 12, 0 disables, no recorded cycle counts as stale). Only one
  cycle runs at a time per process; the rank step keeps its cross-process lock, budget caps and circuit breaker.
- **`npm run scrape`** is now the standalone one-pass cycle (fetch, pre-filter, rank under all existing caps), recorded in
  `cycle_runs`. `--no-rank` keeps the old scrape-only behavior (used to validate scrapers); `--source=workday` limits the
  scrape and is not recorded as a full cycle.

## Consequences
- Locations are no longer lost to a model null; the raw string is always available for diagnosis and re-derivation.
- The first server start after this change has no recorded cycle and therefore runs one catch-up cycle.
- Ranked rows whose raw string was never saved keep a NULL location until the backfill (or a later cron run) supplies it.
