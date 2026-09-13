# PROJECT_STATE.md

## Phase Status

- **Phase 1 — Job discovery and scoring: COMPLETE.** Scrapers ingest postings, the pre-filter classifies title and location eligibility, and the LLM ranker scores retained jobs.
- **Phase 2 — Dashboard: COMPLETE.** The React dashboard supports the ranked jobs feed, filters, application tracking, manual job entry, and resume actions.
- **Phase 3 — Outreach and workflow: COMPLETE.** LinkedIn search links, message templates, follow-up reminders, and manual application tracking are wired into the dashboard. Numeric LinkedIn people-filter IDs remain a manual research gap (see below).

Phase 3's final scope also includes duplicate-job prevention, manual location and job-type fields, LLM location normalization, end-to-end resume generation and serving through `jobs.resume_path`, and removal of resume debug logs.

## Current Implementation

### Scrapers and filtering

- Active ATS platforms: Greenhouse, Lever, SmartRecruiters, and Ashby (newly added). Ashby uses the generic scraper in `src/scrapers/ashby.js`.
- The registry currently has **74 ATS company configurations** (33 Greenhouse, 6 Lever, 7 SmartRecruiters, 28 Ashby), plus the Swiggy career-page scraper: **75 built-in scrapers**. Optional Firecrawl scrapers can be added through `CAREER_PAGES_JSON`.
- The shared pre-filter in `src/scrapers/pre-filter.js` applies title allow/deny classification and location eligibility for India, Singapore, UAE, Netherlands, UK, and known target cities. Ambiguous remote postings require `hiresRemoteInIndia`; the flag defaults to false because there is no companies table.
- The last recorded local database snapshot contains 1,435 jobs across 66 companies.

### Data model and scheduled work

- `jobs.status` is the coarse funnel state: `not_applied`, `applied`, `in_process`, or `closed`. Dashboard status changes, stats, and follow-up eligibility use this field.
- `applications.status` remains in the schema as a deprecated legacy column. Runtime application logic no longer reads or sets it; the column retains its legacy `saved` default, and the historical migration reads old values once to translate them. Application rows continue to hold applied dates, follow-up dates, and notes.
- `interviews` stores one row per job with a granular interview outcome. It does not track interview rounds, and there is no dedicated interview UI yet.
- `jobs.resume_path` is the source of generated resume file paths and the Express-served PDF route. The application-details form no longer edits a duplicate resume path.
- `src/scheduler.js` registers the scraper twice daily and a weekly Monday stale-job close at 09:00 Asia/Kolkata. Jobs still `applied` more than 75 days after their latest application `applied_at` are changed to `closed`.
- SQLite is local and single-user. The live database schema is managed through migrations; see the migration files under `src/migrations/`.

### Frontend

- The jobs feed is a compact expandable table, replacing the earlier card list.
- Score, company, title, location/job type, Apply, coarse status, and resume actions appear in each row. Expanding a row shows the description and application details inline.
- Save Resume generates a PDF and persists its path to `jobs.resume_path`; View Resume uses the Express PDF route. Status and resume loading/errors are scoped to the row.

## Known Gaps / Deferred Work

- **LinkedIn people-filter IDs — NOT DONE.** All 158 currently configured companies in `src/config/linkedin-outreach.js` have `linkedinCompanyId: null`; numeric IDs require manual research.
- **Companies table and remote-hiring flag — NOT DONE.** No `COMPANIES` table exists. The designed `HIRES_REMOTE_IN_INDIA` flag therefore defaults to false; see ADR 0005.
- **Workday scraper — NOT DONE.** Deferred because many enterprise and banking targets likely use Workday and its setup cost is higher than the current ATS integrations.
- **Interview management UI — NOT DONE.** Interview records can be created by the status migration, but there is no dedicated interface to view or edit them.
- **ATS discovery follow-up — NOT DONE.** The discovery report found 80 companies with no Greenhouse, Lever, SmartRecruiters, or Ashby matches. These may use Workday or custom systems, or need further verification and Firecrawl-based scrapers.

## Recent Fixes / Changelog

- Fixed LLM configuration resolution, including ranker environment-prefix handling and provider base-URL selection.
- Fixed manual-job visibility and URL deduplication; added location and job-type fields and normalized scraped locations through the LLM ranking call.
- Expanded ATS coverage with 67 entries across Greenhouse, Lever, SmartRecruiters, and Ashby. The failing Greenhouse Perplexity entry was removed after repeated 404s, leaving 66 active additions.
- Expanded the title allowlist for applied AI, AI application/product, agentic, and reversed AI engineering title variants; Machine Learning Engineer remains ambiguous.
- Wired resume generation from the dashboard through PDF compilation and `jobs.resume_path` persistence; removed `[Resume Debug]` logs.
- Replaced the large job cards with the compact expandable table and inline Apply, status, and resume actions.
- Migrated the job funnel to the four-state `jobs.status`, created the `interviews` table, and retired `applications.status` from runtime status handling. Stats and reminders now follow `jobs.status`; reminder completion schedules a new follow-up date without changing funnel status.
- Implemented the weekly stale-job-close cron from ADR 0008.

## Canonical Design References

`docs/ARCHITECTURE.md` and `docs/adr/` (ADRs 0001–0009) are the canonical sources for architecture and design rationale. This file records implementation state and open work rather than restating those decisions.

## New Session Workflow

1. Read `AGENTS.md` and this file.
2. Read the specific source files relevant to the task.
3. Use Node 20 LTS (`nvm use 20`).
