# 0010 — Workday CXS ingestion, validation before registration

Date: 2026-09-24

Status: Accepted for scraper implementation; company rollout pending review.

## Context

Workday career pages use POST `/wday/cxs/{tenant}/{site}/jobs`. Both standard
`{tenant}.wdN.myworkdayjobs.com/{site}` and alternate
`wdN.myworkdaysite.com/recruiting/{tenant}/{site}` URLs resolve to that API on
the standard tenant host. Adobe, Cisco, and a Wells Fargo alternate-URL probe
returned public JSON without authentication.

## Decision

- Implement a separate BaseScraper subclass without changing the registry yet.
- Paginate in batches of 20 using actual returned page lengths. Detect stalled
  pagination rather than silently saving an incomplete listing crawl. Retain the
  first page's total: Adobe returned `total: 0` on a subsequent nonempty page.
- Default to empty `appliedFacets` and empty search text. URL query parameters
  are not automatically applied. Explicit `appliedFacets` configuration accepts
  API facet keys and arrays of value IDs when narrower coverage is intentional.
- Reject denied titles before fetching details. Fetch remaining details with
  concurrency four, then apply the existing pre-filter to structured locations.
  This includes ambiguous titles and locations: listing summaries such as
  “14 Locations” cannot determine geographic eligibility. Country descriptors
  also resolve cities missing from the pre-filter's city list.
  Evaluate each location with the existing eligibility function independently,
  so a primary US country cannot mask an additional city such as Bangalore;
  retain the complete location text for ranking and storage.
- Use detail `jobReqId` as the job ID, `externalUrl` as the application entry
  page, and `startDate` as the absolute posted date. Do not derive dates from
  lossy labels such as “Posted 30+ Days Ago”. Preserve all listed locations.
- Bound HTTP requests with timeouts and retries for 429/5xx. Log and skip
  individual detail failures; expose failure counts to validation. Listing
  failures reject the company scrape for the existing runner to isolate.

## Consequences

Unfiltered ingestion preserves the existing eligibility policy across countries
and departments. Detail enrichment costs additional requests, but supplies full
descriptions, dates and locations before ranking. Facet IDs are board-specific;
Adobe's India + Engineering probe reduced 583 listings to 59, so optional facets
can reduce traffic when intentional coverage restrictions are approved.

Run `node src/scripts/validate-workday.js` under Node 20 for full Adobe/Cisco
listing, detail, pre-filter and in-memory persistence checks. Add `--rank-sample`
to exercise BaseScraper.run with one real ranking request per company, using
the existing LLM configuration. Detail failures produce a nonzero validation exit
status after reporting the saved rows. No production database or registry is changed.

## Validation evidence (2026-09-24)

The full validation command with `--rank-sample` exited successfully:

| Company | Listings fetched | Details fetched after title rejection | Eligible / saved rows | Detail failures |
| --- | ---: | ---: | ---: | ---: |
| Adobe | 583 | 427 | 103 | 0 |
| Cisco | 1,357 | 941 | 261 | 0 |

All eligible jobs were saved to in-memory SQLite without ranking the whole
batch. One job per company additionally traversed the unchanged BaseScraper.run
with a real configured LLM call and an upsert; row counts remained unchanged.
Adobe R171581 (Computer Scientist I (Frontend), Noida) scored 10;
Cisco 2014393 (Senior Software Engineer, London) scored 3.

The earlier Cisco crawl saw 1,358 listings and a repeatable 403 for job 2023738.
The final crawl no longer listed that posting and completed without failures.
Do not assume a board remains static while crawling it.

Cisco's Engineering + Bangalore facet probe reduced 1,357 listings to 194 using
`jobFamilyGroup` and `locations`. Adobe's probe used `jobFamilyGroup` and
`locationCountry`; facet availability and values must be checked per board.
The Wells Fargo alternate URL was tested through the scraper's URL parser and
CXS request method (1,791 listings reported), with a separate successful detail
probe confirming its alternate-format `externalUrl`. It was not fully crawled.

`node --test tests/*.test.js` passed all six test files, including the new
Workday coverage for POST pagination, later zero totals, URLs, multi-location
filtering, malformed responses, detail failures, retries, ranking and upserts.
