# 0011 — Register Workday boards with URL-derived facets

Date: 2026-09-24

Status: Accepted. Supersedes the deferred-registration and explicit-facets-only
decisions in ADR 0010; the Step 1 validation remains historical evidence.

## Context

The user approved rollout of 19 supplied Workday career URLs after Step 1.
Those URLs intentionally restrict locations and departments. Re-entering their
opaque facet IDs separately risks transcription errors and unnecessarily broad
crawls.

## Decision

- Store the complete supplied URLs in `src/config/workday.js`. Register their
  WorkdayScraper instances alongside all existing sources in the active registry.
- Derive tenant, Workday number, site and facets programmatically with URL and
  URLSearchParams. Support locale prefixes and alternate recruiting URLs.
- Treat opaque 32-hex / UUID query values as facet IDs, preserving key casing
  and repeated values as arrays. Exclude search, paging, sorting and tracking
  parameters. This supports custom keys without a company-specific allowlist.
- URL facets are the default; an explicit `appliedFacets` object overrides them.
  A URL without useful facets, or explicit `{}`, fetches unfiltered postings.
- Retain the original total when a later nonempty page says `total: 0`, logging
  that condition. If listings disappear and pagination ends early or repeats,
  log and mark the incomplete crawl, then process already fetched postings.
  Individual detail errors (including 403/404) remain logged skips. Company-level
  failures remain isolated by the runner rather than stopping other companies.
  Incomplete listing objects are also logged and skipped: Morgan Stanley returned
  a `bulletFields`-only entry with no title or external path. Continue pagination
  by the full returned page length, including skipped entries.
- Expose fetched, accepted, detail-failure and pagination diagnostics in run
  results alongside the actual BaseScraper persistence count.
- Support `npm run scrape -- --source=workday` to run only these registrations
  through the existing live database/ranker pipeline. The default command and
  scheduler still run all sources. BaseScraper.run is unchanged.
- Provide `node src/scripts/retry-workday-ranking.js` for recovering only rows
  marked `Ranking failed`, four at a time with bounded retries. Re-fetch Workday
  detail location metadata because the existing ranker's failure fallback stores
  a null location. Update only score, reason and normalized location, conditional
  on the row still being failed; leave successful scores and user fields intact.

## Consequences

The supplied filters deliberately narrow coverage; we do not silently remove a
facet if its board returns zero results. All retained postings still pass the
existing pre-filter before ranking and storage. A saved count is the number of
insert/upsert operations reported by BaseScraper, not necessarily new rows.
An early pagination stop is visible as partial coverage, not presented as a
complete crawl. CLI company-level failures produce a nonzero exit code after
all selected companies have been attempted and the database has been closed.

PROJECT_STATE.md is excluded from this change by explicit user instruction.
