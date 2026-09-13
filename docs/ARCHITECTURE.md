# job-search-os — System Architecture (v1 Draft)

Personal job search automation system. Single-user, local-first tool to track, discover, score, and act on job opportunities at target companies.

---

## System Overview — 5 Components

1. **Database** — persistent storage for companies, jobs, interviews
2. **Cron Job + Scraper Service** — fetches job postings on a schedule, writes to DB
3. **Frontend UI** — dashboard for reviewing and acting on tracked jobs
4. **Backend API Service** — CRUD layer between frontend and DB
5. **Intelligence Layer** — relevancy scoring (company + job) and resume generation

---

## 1. Frontend

- **Dashboard** — simple stats on job application journey (see Stats section under API)
- **Manual Add Form** — for jobs the scraper couldn't reach; collects company, title, job description, apply URL, and location
- **Jobs Table** — primary daily-driver view; supports action per row (apply, request referral, mark status, etc.)

**Structural conventions** (see `frontend/AGENTS.md`, established during the App.jsx refactor):
- `App.jsx` is composition-only — no raw `fetch()`, no full section JSX
- One hook per data resource (`useJobs`, `useStats`, `useInterviews`, `useCompanies`)
- `components/ui/` for domain-agnostic primitives only
- No file over ~150–200 lines
- State lives at the lowest common ancestor that needs it

---

## 2. Database

### Table: COMPANIES

```
COMPANY: {
  ID: UUID
  NAME: string
  CAREER_SITES: { platform: 'greenhouse' | 'lever' | 'smartrecruiters' | 'custom', url: string, slug: string }[]
  LINKEDIN_SLUG: string              // company page, e.g. linkedin.com/company/{slug}
  LINKEDIN_PEOPLE_FILTER_ID: number  // numeric ID used in people-search currentCompany filter (for outreach)
  RELEVANCY_SCORE: number            // 1-10, LLM-computed once, stored permanently
  INDUSTRY: enum<fin-tech | saas | cyber-security-saas | ...>
  INDUSTRY_TYPE: enum<product | it-services>
  SCALE: enum<early-stage-startup | mid-sized-company | MNC>  // optional
  HIRES_REMOTE_IN_INDIA: boolean     // manually set, defaults to false — governs ambiguous "Remote" postings
}
```

Notes:
- `RELEVANT_JOBS_COUNT` is intentionally **not** a stored column — compute via `COUNT(*) FROM jobs WHERE company_id = X` at query time to avoid drift.
- `RELEVANCY_SCORE` computed once in a batch pass (see Intelligence Layer); recomputed only via explicit manual trigger, never automatically.

### Table: JOBS

```
JOB: {
  ID: UUID
  COMPANY_ID: UUID              // FK -> COMPANIES
  JOB_ID: string                // ID from the career site/ATS
  JOB_TITLE: string
  JOB_LINK: string
  LOCATION: string               // nullable
  SOURCE: enum<scraped | manual>
  POSTED_DATE: Date              // nullable — not all ATS platforms provide this
  FOUND_AT: DateTime             // when our scraper first saw it; primary sort key when POSTED_DATE is missing
  RELEVANCY_SCORE: number        // 1-10, job-fit only, independent of company score
  RELEVANCY_REASON: string       // LLM-generated explanation, persisted for review/debugging
  STATUS: enum<not_applied | applied | in_process | closed>
  APPLIED_AT: DateTime           // nullable — used for stale-job auto-close
}
```

Notes:
- `SOURCE = 'manual'` jobs **bypass** the relevancy-score and location filters in the read API — the user already made a deliberate choice to track them.
- Final relevancy score shown in UI = `(company.relevancy_score + job.relevancy_score) / 2`, **computed at read time**, never stored — keeps both signals independently correct and avoids sync issues if either is recomputed later.
- `STATUS` is a coarse funnel state only. Granular interview-stage detail lives in `INTERVIEWS`, not here, to avoid two sources of truth.

### Table: INTERVIEWS

```
INTERVIEW: {
  ID: UUID
  JOB_ID: UUID                   // FK -> JOBS
  COMPANY_NAME: string
  TITLE: string
  STATUS: enum<shortlisted | ongoing | rejected | offer-received | accepted>
  COMMENTS: string
  CONTACTS: string                // HR/recruiter contacts
}
```

Notes:
- One row per job, not per interview round — round-level detail is tracked manually (interview volume is low enough not to need structured sub-tracking).

---

## 3. Cron Job + Scraper Service

- Runs **twice daily** (existing `node-cron` schedule) to fetch new postings via:
  - Greenhouse / Lever / SmartRecruiters JSON APIs (existing scrapers)
  - Firecrawl MCP for custom/non-standard career sites
- Writes directly to DB (no HTTP round-trip through the API layer — internal service, not frontend-facing)
- New: **weekly** `node-cron` job to auto-close stale applications — `JOBS.STATUS = 'applied'` for more than 2–3 months → `STATUS = 'closed'`. Runs once a week rather than daily since staleness doesn't need same-day precision.
- New company onboarding: one-time CSV import of target companies' career site URLs → bulk-loaded via script, not the manual-add UI path.
- If a manually added job references a company not yet in `COMPANIES`, the backend auto-creates a minimal company record (name only; relevancy score, industry, etc. backfilled later via rescan).

---

## 4. Backend API Service

Internal services (scraper, intelligence layer) write directly to the DB. This API layer exists **only** to serve the frontend.

### Companies
- `GET /api/companies` — list, filterable by industry, scale, relevancy score range
- `POST /api/companies` — add manually
- `PATCH /api/companies/:id` — update fields (e.g. `HIRES_REMOTE_IN_INDIA`, scale)
- `POST /api/companies/rescan-relevancy` — manual trigger to recompute company scores in batch
- *(CSV bulk import handled via script, not this API)*

### Jobs
- `GET /api/jobs` — main feed; filters: `minScore`, `location`, `status`, `source`, `companyId`
  - `source = 'manual'` rows bypass `minScore` and `location` filters
- `POST /api/jobs/manual` — manual add; includes `location`; auto-creates company if missing
- `PATCH /api/jobs/:id/status` — update funnel status (`applied`, `in_process`, `closed`) — expected to be the most frequently hit write endpoint
- `GET /api/jobs/:id` — single job detail (JD, score, reason, company info)

### Interviews
- `GET /api/interviews` — list (small dataset, likely unfiltered)
- `POST /api/interviews` — create when a job moves to shortlisted
- `PATCH /api/interviews/:id` — update status/comments/contacts

### Stats
- `GET /api/stats` — dashboard numbers: total tracked, applied this week/month, interviews in progress, avg relevancy of active pipeline, etc. *(exact stat set to be finalized when dashboard UI is built)*

### Resume
- `POST /api/resume/generate` — generates tailored resume via bullet-pool selection (existing Intelligence Layer capability)

---

## 5. Intelligence Layer

**Step 1 — Department/Relevance Pre-Filter (pure code, no LLM)**
- Title-based allowlist (Frontend Engineer, Full Stack, SDE 2/3, AI Engineer, AI Agents Engineer, Harness Engineer, Forward Deployed Engineer, etc.) → auto-accept
- Title-based denylist (Sales, Customer Success, Data Engineer, DevOps, SRE, Cloud Infra, Mobile-only, QA, Marketing, Recruiter, etc.) → auto-reject
- Location hard-filter: must be in India or {Singapore, UAE, Netherlands, UK}; ambiguous "Remote" postings included **only if** parent company's `HIRES_REMOTE_IN_INDIA = true`
- Titles matching neither list fall through to Step 3 for LLM judgment

**Step 2 — Company Relevancy Scorer (LLM, one-time batch)**
- Runs once per company on creation (batched ~100 companies per call)
- Input: company name, industry, scale, career-goals/target-profile context
- Output: `RELEVANCY_SCORE (1–10)`, stored permanently; recomputed only via manual `rescan-relevancy` trigger

**Step 3 — Job Relevancy Scorer (LLM, batched by ambiguity + company)**
- Runs on: (a) jobs that passed the allowlist but still need a frontend-fit score, and (b) ambiguous jobs that didn't clearly match allow/deny in Step 1
- Batched per company per scraper run, not per individual job
- **Computed fully independently of company score** — no cross-contamination, to avoid halo effects biasing job-level fit judgments
- Output: `RELEVANCY_SCORE (1–10)` + `RELEVANCY_REASON`, persisted on the job row

**Step 4 — Resume Generator** (existing, `job-search-os`)
- Input: job description + curated bullet pool
- LLM selects bullet IDs only — never free-writes bullet text
- Compiled to PDF via `pdflatex`

**Combining scores for display:**
Final relevancy shown in UI = `(company.relevancy_score + job.relevancy_score) / 2`, computed at read time in the `GET /api/jobs` query — never stored.

---

## Open Items / Not Yet Decided
- Exact `GET /api/stats` field set (deferred until dashboard UI design)
- Whether industry/scale enums need to be finalized/expanded before CSV import
- Auth/deployment model (currently assumed single-user, local-first — revisit if that changes)