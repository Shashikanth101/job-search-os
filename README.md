# job-search-os

An ES-module Node.js/Express backend for collecting and reviewing job listings.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Configure JavaScript-rendered career pages in `.env` as JSON:

```dotenv
CAREER_PAGES_JSON=[{"company":"Example","url":"https://example.com/careers"}]
```

The SQLite schema, including `jobs`, `applications`, and `outreach`, is defined in [`src/schema.sql`](src/schema.sql) and created automatically at `data/jobs.db`. Existing databases from the first scaffold are migrated while preserving their job data. Scrapers run at 09:00 and 18:00 in `Asia/Kolkata`; use `npm run scrape` for a manual run.

API endpoints:

- `GET /api/jobs?new=true&minScore=7`
- `GET /api/jobs/:id`
- `PATCH /api/jobs/:id/seen`
- `GET /api/stats`
