# PROJECT_STATE.md

## Phase Status

- **Phase 1 — Job discovery and scoring: COMPLETE.** Scrapers ingest postings, the pre-filter classifies title and location eligibility, and the LLM ranker scores retained jobs.
- **Phase 2 — Dashboard: COMPLETE.** The React dashboard supports the ranked jobs feed, filters, application tracking, manual job entry, and resume actions.
- **Phase 3 — Outreach and workflow: COMPLETE.** LinkedIn search links, message templates, follow-up reminders, and manual application tracking are wired into the dashboard. Numeric LinkedIn people-filter IDs remain a manual research gap (see below).

Phase 3's final scope also includes duplicate-job prevention, manual location and job-type fields, LLM location normalization, end-to-end resume generation and serving through `jobs.resume_path`, and removal of resume debug logs.

## Current Implementation

### Scrapers and filtering

- Active ATS platforms: Greenhouse, Lever, SmartRecruiters, Ashby, and Workday. Ashby uses the generic scraper in `src/scrapers/ashby.js`; Workday uses `src/scrapers/workday.js` and supports both standard tenant URLs and the `myworkdaysite.com/recruiting` variant.
- The registry currently has **96 ATS company configurations** (33 Greenhouse, 7 Lever, 7 SmartRecruiters, 30 Ashby, 19 Workday), plus the Swiggy career-page scraper: **97 built-in scrapers**. Optional Firecrawl scrapers can be added through `CAREER_PAGES_JSON`.
- The Workday rollout registered Adobe, Arctic Wolf, Barclays, BrowserStack, Cisco, Cloudera, Cohesity, eBay, JioStar, Morgan Stanley, Netflix, NVIDIA, PayPal, PTC, Salesforce, Sprinklr, Visa, Walmart, and Wells Fargo, adding **1,036 jobs** in the initial live run.
- DexCare (`lever-dexcarehealth`), Hebbia (`ashby-hebbia-ai`), and Gamma (`ashby-gamma`) close gaps from the earlier ATS discovery pass. Gamma retains its supplied Ashby `departmentId`, but the public endpoint currently returns the same unfiltered results with or without that parameter.
- `src/config/manual-links.js` includes the Lightspeed Venture Partners portfolio board at `https://jobs.lsvp.com` as a discovery-only source. The dashboard also has the completed “Other Companies” section in `uncovered-companies.js` for targets without scraper coverage.
- The shared pre-filter in `src/scrapers/pre-filter.js` applies title allow/deny classification and location eligibility for India, Singapore, UAE, Netherlands, UK, and known target cities. Ambiguous remote postings require `hiresRemoteInIndia`; the flag defaults to false because there is no companies table.
- The last recorded local database snapshot contains 2,472 jobs across 84 companies, including the 1,036 jobs from the initial Workday rollout.

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
- **Interview management UI — NOT DONE.** Interview records can be created by the status migration, but there is no dedicated interface to view or edit them.
- **Other Companies section — COMPLETE.** `src/config/uncovered-companies.js`, `GET /api/uncovered-companies`, and `UncoveredCompaniesSection` with Google career-search links are implemented.
- **ATS discovery follow-up — IN PROGRESS.** Workday coverage is live, and DexCare, Hebbia, and Gamma were added. The remaining companies from the earlier gap-list check still need individual manual triage using `uncovered-companies.js` under “Other Companies” or into a future scraper.

## Recent Fixes / Changelog

- Fixed LLM configuration resolution, including ranker environment-prefix handling and provider base-URL selection.
- Fixed manual-job visibility and URL deduplication; added location and job-type fields and normalized scraped locations through the LLM ranking call.
- Expanded ATS coverage with 67 entries across Greenhouse, Lever, SmartRecruiters, and Ashby. The failing Greenhouse Perplexity entry was removed after repeated 404s, leaving 66 active additions.
- Added the validated Workday scraper and registered 19 companies across both Workday URL formats; the initial rollout added 1,036 jobs. Added DexCare on Lever and Hebbia/Gamma on Ashby to close ATS discovery gaps.
- Added `jobs.lsvp.com` to the manual discovery links as a discovery-only Lightspeed Venture Partners portfolio board; implemented the “Other Companies” section in `uncovered-companies.js` with its API route and Google career-search links.
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
