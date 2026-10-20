# job-search-os

A local-first job search tool with ATS scrapers, a ranked jobs feed, application tracking, resume generation, and LinkedIn outreach helpers.

## Requirement: Node 20 LTS

Use Node 20 LTS as pinned by [`.nvmrc`](.nvmrc). Run `nvm use 20` before installing dependencies or running the app. Node 24 can crash the `better-sqlite3` native module.

## Setup

```bash
nvm use 20
npm install
cd frontend && npm install && cd ..
cp .env.example .env
npm run dev
```

`npm run dev` starts the Express API and React/Vite frontend concurrently. Set LLM and Firecrawl credentials in `.env` as needed. Optional JavaScript-rendered career pages can be configured with `CAREER_PAGES_JSON`:

```dotenv
CAREER_PAGES_JSON=[{"company":"Example","url":"https://example.com/careers"}]
```

The SQLite database defaults to `data/jobs.db` and can be changed with `DATABASE_PATH`. Its base schema is in [`src/schema.sql`](src/schema.sql); [`src/db.js`](src/db.js) applies the schema and compatible migrations when opening the database.

## Data model

- `jobs` stores scraped and manually entered postings, score, location and job type, `jobs.resume_path`, and the coarse status (`not_applied`, `applied`, `in_process`, `closed`).
- `applications` stores applied date, follow-up date, and notes. Its `status` and `resume_path` columns are deprecated legacy fields; runtime funnel state and generated resume paths live on `jobs`.
- `interviews` stores job-linked interview outcome, comments, and contacts. It does not track interview rounds.
- `outreach` stores contact details, sent messages, and follow-up information.

## Scrapers

Generic ATS scrapers cover Greenhouse, Lever, SmartRecruiters, and Ashby. A shared pre-filter checks title and location eligibility before ranking.

**Automation is off by default.** The server only reads the database: starting it never scrapes, pre-filters or ranks. Refresh manually with `npm run scrape`. The in-process cron (scrapers at 09:00 and 18:00 Asia/Kolkata, plus a weekly job that closes `applied` jobs whose latest application date is over 75 days old) and the optional startup catch-up (`FETCH_CATCHUP_HOURS`) exist for production deploys: set `SCHEDULER_ENABLED=1` to turn them on.

Run one standalone pass (fetch, pre-filter, then rank pending jobs under the usual budget and job caps) with:

```bash
npm run scrape                     # fetch + pre-filter + rank
npm run scrape -- --no-rank        # fetch + pre-filter only (no LLM key needed)
npm run scrape -- --source=workday # limit to Workday sources
```

With `SCHEDULER_ENABLED=1` the server also runs one such cycle on startup if the last completed cycle is older than `FETCH_CATCHUP_HOURS` (default 0 = never).

## Review dashboard

Start the API and the frontend. The app has a left sidebar: Inbox (new), Saved, Applying, Applied, Skipped, All jobs (one list with min score >= 7 by default, server-side pagination, filters, a detail pane; Up/Down arrows move, `a` apply, `s` save, `x` skip, `/` search), Manual (jobs you saved by URL; the "Add job" button opens the form), Outreach and Ops (refresh status, commands, follow-ups). Review statuses are stored in the database; the review API never scrapes or ranks. Manual jobs are never ranked automatically; rank them on request with:

```bash
npm run rank:manual            # dry run: count and worst-case cost
npm run rank:manual -- --run   # rank never-ranked manual jobs under the usual budget caps
```

## API

The Express API listens on port 3001 by default (`PORT` can override it). Current routes:

- `GET /api/manual-links`
- `GET /api/linkedin-outreach`
- `GET /api/message-templates`
- `GET /api/jobs` — supports `new`, `minScore`, and `location` query filters
- `POST /api/jobs/manual`
- `GET /api/jobs/:id`
- `PATCH /api/jobs/:id/status`
- `PATCH /api/jobs/:id/seen`
- `POST /api/jobs/:id/application`
- `PATCH /api/applications/:id`
- `POST /api/resume/generate`
- `GET /api/jobs/:id/resume`
- `GET /api/stats`

## Frontend

The React + Vite dashboard is under `frontend/`. The jobs feed is a compact expandable table with inline Apply, status, and resume actions; expanding a row reveals the job description and application details. Resume generation is available from each row, and LinkedIn outreach links and message templates are also included.

## Testing

From the repository root, run the full Node test suite:

```bash
node --test tests/*.test.js
```

To validate the frontend production build:

```bash
cd frontend && npm run build
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/adr/`](docs/adr/) for architecture and design rationale.
