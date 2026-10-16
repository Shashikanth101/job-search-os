# 0012: Pre-filter denies senior titles and 10+ year requirements, and persists its verdict

## Status
Accepted

## Context
The pre-filter (title allow/deny plus location) let through leadership and very senior roles
(principal, director, head of, engineering manager) and roles that state 10+ years of required
experience. Those jobs still reached the LLM ranker and the dashboard. A live audit also showed that
2,583 of 3,256 stored jobs carried a failed ranking (score 0), so every wasted ranker call mattered.
Rejected jobs were previously dropped without any record, so earlier rows could not be re-evaluated
or explained.

## Decision
- **Seniority title deny:** case-insensitive, word-boundary match on principal, distinguished, fellow,
  head of, director, vp / vice president, chief, "engineering manager" and "manager, engineering".
  "Staff" and "lead" are deliberately **not** denied. Reason: `seniority_title`.
- **Years required:** `extractMinYears(description)` returns the largest stated minimum years where
  "experience" appears within ~60 characters, ignoring sentences with preferred / bonus / plus /
  nice to have. A job is rejected when that value is >= `MAX_MIN_YEARS_REJECT` (10). Reason:
  `years_required_N`. No description means no years rule. Tunables live in the constants block at the
  top of `src/scrapers/pre-filter.js`; `PREFILTER_VERSION` is bumped whenever any rule changes.
- **Manual jobs are never rejected** (unchanged; ADR 0003 "manual jobs bypass filters").
- **Persisted verdict:** `jobs.prefilter_status` (`passed`/`rejected`), `prefilter_reason`,
  `prefilter_version`, `prefilter_checked_at` (migration 004, also in `schema.sql` for fresh databases).
  `NULL` means "never evaluated" and is treated as passed. Newly scraped jobs that pass are stamped at
  insert; scraper-time rejects are still dropped before insert.
- **Re-scrape invariant:** the `ON CONFLICT` update in `BaseScraper.saveToDb` only refreshes title,
  job_type, description, apply_url and posted_at. It never changes prefilter_*, relevance_*, location,
  source, status, is_new or resume_path.
- **Rejected jobs are hidden, not deleted:** `GET /api/jobs` excludes them unless `?include_rejected=1`;
  `rerank.js` and `retry-workday-ranking.js` skip them.
- **Reclassification:** `src/scripts/reclassify-prefilter.js` (dry run by default, `--apply` takes a
  backup first) re-evaluates stored jobs against the title and years rules. It never rejects manual jobs,
  jobs with `status != 'not_applied'`, or jobs with interviews or outreach rows, and never deletes rows.
  Location is not re-evaluated because stored locations are LLM-normalized and may be NULL.

## Consequences
- Fewer ranker calls and a cleaner feed; every rejection is auditable (reason + version).
- Regex-based years extraction can misfire on unusual phrasing (e.g. "10 years in software, experience
  in React" counts as 10). Rejected rows are recoverable with the rollback SQL in the reclassify report.
- A re-scrape no longer overwrites relevance fields, so a failed ranking is no longer healed
  implicitly by the next cron run; `npm run rerank` is the retry path. `BaseScraper.run()` still ranks
  every parsed job on each run (unchanged here) — skipping already-ranked jobs is follow-up work.
- Scrapers without their own pre-filter (Firecrawl, Swiggy) now have rejected jobs dropped in `saveToDb`.
