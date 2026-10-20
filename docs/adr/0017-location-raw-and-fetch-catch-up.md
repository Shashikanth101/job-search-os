# 0017: Raw ATS location is kept, the model's null never erases a location, automation is paused, and review is a read-mostly dashboard

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

## Amendment: automation paused, review dashboard, manual jobs
The startup catch-up ran on the first server start (1,284 new postings scraped, ranking spent budget) and was not wanted.
- **Paused by default:** `SCHEDULER_ENABLED` (default 0) gates `startScheduler` and the catch-up; `FETCH_CATCHUP_HOURS` now
  defaults to 0. The code paths stay for production deploys (`SCHEDULER_ENABLED=1`). Starting the server only reads the DB.
  `npm run scrape` remains the one manual refresh (`--no-rank` for scrape only). Both variables are in `.env.example` and `.env`.
- **`saveToDb` location rule:** `location = COALESCE(NULLIF(existing, ''), deriveLocation(location_raw))` on re-scrape and
  `COALESCE(@location, derived)` on insert: a NULL location is derived, a non-null one is never overwritten.
  `npm run backfill:location -- --no-network [--run]` applies the same rule to stored rows without any fetch.
- **Review dashboard (`/review`, `/review/manual`; API `src/review.js`):** server-side pagination, default view ranked,
  non-rejected, non-manual, score >= 7, ordered by score then newest. Review status is derived: `jobs.status` stays the sole
  funnel source (applying = `in_process`, applied = `applied`; marking applied also creates an `applications` row like the
  manual flow), and `job_triage` (migration 011) holds only `saved` / `skipped`, the two choices the funnel has no value
  for (its CHECK constraint is not widened); `new` is no row. An applied or closed job cannot be moved back from the review
  view (409). "Last refresh" reads the newest `cycle_runs` row; location groups are India / Remote / Other / Unknown (NULL).
  The API never scrapes, pre-filters or ranks.
- **Manual jobs:** `POST /api/review/manual` stores URL, company, title, location and pasted description with
  `rank_status='pending'`, no fetch and no LLM. Every ranking selection now excludes `source='manual'` (cron cycle,
  `npm run rank`, `npm run scrape`); `npm run rank:manual` (`rankPending({manualOnly: true})`, dry run by default) ranks
  never-ranked manual jobs under the same budget caps, lock and circuit breaker. The older `POST /api/jobs/manual`
  (main dashboard form) still ranks on save, as an explicit user action.
