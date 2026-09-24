# Workday rollout validation — 2026-09-24

All 19 supplied URLs are registered. Routing and facet arrays are parsed from
the full URL strings, including repeated and custom parameter names.

Executed `npm run scrape -- --source=workday` against `./data/jobs.db`, followed
by a targeted Morgan Stanley rerun after fixing incomplete listing handling.
These are final per-company counts, not sums of repeated attempts:

| Company | Valid listings fetched | After pre-filter | Saved |
| --- | ---: | ---: | ---: |
| Adobe | 59 | 57 | 57 |
| Arctic Wolf | 40 | 36 | 36 |
| Barclays | 8 | 8 | 8 |
| BrowserStack | 6 | 6 | 6 |
| Cisco | 202 | 150 | 150 |
| Cloudera | 19 | 2 | 2 |
| Cohesity | 11 | 9 | 9 |
| eBay | 121 | 64 | 64 |
| JioStar | 104 | 77 | 77 |
| Morgan Stanley | 185 | 148 | 148 |
| Netflix | 155 | 0 | 0 |
| NVIDIA | 201 | 184 | 184 |
| PayPal | 36 | 5 | 5 |
| PTC | 4 | 0 | 0 |
| Salesforce | 3 | 1 | 1 |
| Sprinklr | 9 | 8 | 8 |
| Visa | 97 | 77 | 77 |
| Walmart | 643 | 156 | 156 |
| Wells Fargo | 58 | 48 | 48 |
| Total | 1,961 | 1,036 | 1,036 |

Database verification: 1,435 rows before, 2,471 after; exactly 1,036 distinct
Workday rows persisted. No in-memory database was used for this rollout.
Netflix and PTC's non-denied-title candidates all failed location eligibility.
Supplied facets were not broadened to manufacture results.

## Failure handling and recovery

- Morgan Stanley's API reported 186 entries, including one incomplete
  `{"bulletFields":["PT-JR041624"]}` entry. It is excluded from the 185 valid
  listings above. The initial company attempt failed validation; the corrected
  scraper logged/skipped the entry, continued pagination, and saved 148 jobs.
- The successful company attempts logged 71 later nonempty pages with
  `total: 0`; those pages were processed using the first page's total. No company
  ended with `paginationStoppedEarly` set.
- Regression tests verify logging/skipping failed details (403), continued
  pagination after incomplete records, early empty/repeated page handling,
  and runner isolation of a company-level failure.
- The existing ranker encountered transient `fetch failed` errors for 266 jobs
  across the initial run and Morgan Stanley rerun. The Workday-only recovery
  script repaired 265 scores with bounded concurrency, using refreshed ATS
  location metadata and leaving successful scores/user fields untouched.
- The remaining saved job is Morgan Stanley `JR033436`, Investment Banking
  Division - Global Power & Energy Group - Associate. Its detail endpoint returned
  HTTP 403 during recovery. It was logged/skipped without stopping the other
  retries; its existing failed score (0), `Ranking failed` reason and null
  location remain. Thus 1,035 saved jobs are ranked and one remains unranked.
  No listing was deleted or given an invented score/location.
- `BaseScraper.run()` remains unchanged; the recovery helper is an explicit
  command, not an automatic change to the shared ranker's concurrency policy.

## Five saved-job spot checks

Each saved title, requisition ID and apply URL matched a fresh Workday detail
response. Each application page returned HTTP 200. Normalized saved locations
matched the ATS location metadata:

| Company | Saved title / apply URL | Job ID | Saved location | ATS location |
| --- | --- | --- | --- | --- |
| Adobe | [Computer Scientist I (Frontend)](https://adobe.wd5.myworkdayjobs.com/external_experienced/job/Noida/Computer-Scientist-I--Frontend-_R171581) | R171581 | Noida | Noida, India |
| Arctic Wolf | [Senior Developer -Front End](https://arcticwolf.wd1.myworkdayjobs.com/External/job/Bengaluru-IND/Senior-Developer-2_R26_595-1) | R26_595 | Bengaluru | Bengaluru, IND; India |
| Barclays | [Software Engineer](https://barclays.wd3.myworkdayjobs.com/External_Career_Site_Barclays/job/Bengaluru-Maruthi-Onyx---TESCO-TSA/Software-Engineer_JR-0000121832-4) | JR-0000121832 | Bengaluru | Bengaluru, Maruthi Onyx - TESCO TSA; India |
| Cisco | [Software Engineer - 6+yrs - React.js/Angular/Java](https://cisco.wd5.myworkdayjobs.com/Cisco_Careers/job/Bangalore-India/Software-Engineer---6-yrs---Reactjs-Angular-Java_2022870-1) | 2022870 | Bengaluru | Bangalore, India |
| Cohesity | [Front End Engineer](https://cohesity.wd5.myworkdayjobs.com/Cohesity_Careers/job/Bangalore---India-Office/Front-End-Engineer_R04350) | R04350 | Bengaluru | Bangalore - India (Office); India |

## Reproduction and checks

- Normal registered Workday run: `npm run scrape -- --source=workday`.
- Recover failed Workday rankings only: `node src/scripts/retry-workday-ranking.js`.
- Backend regression suite: `node --test tests/*.test.js` (passed).
- Runtime: Node 20.20.2.
- Local run logs: `/tmp/workday-rollout.log`, `/tmp/workday-morgan-retry.log`,
  `/tmp/workday-ranking-retry.log` (temporary evidence; may not persist).
- PROJECT_STATE.md was not modified. No commit was made.
