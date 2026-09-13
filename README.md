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

Generic ATS scrapers cover Greenhouse, Lever, SmartRecruiters, and Ashby. A shared pre-filter checks title and location eligibility before ranking. Scrapers run at 09:00 and 18:00 Asia/Kolkata; a weekly scheduler closes `applied` jobs whose latest application date is over 75 days old.

Run a scrape manually with:

```bash
npm run scrape
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
