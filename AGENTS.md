# AGENTS.md

## Project Overview
Personal job search automation OS. Node.js + Express backend, React frontend.

## Environment
Always use Node 20 LTS. Run nvm use 20 before starting any session. Node 24 causes a native crash with better-sqlite3.

## Architecture Rules
- ES modules throughout (import/export, never require)
- Named exports preferred over default exports
- All scrapers extend BaseScraper from src/scrapers/base-scraper.js
- All LLM calls go through src/llm/index.js — never call provider APIs directly
- Never hardcode API keys. Read env vars only through `getConfig()` in src/config/env.js (loads `.env` by explicit path with override, so `.env` wins over the shell; no `.env` means real environment variables apply; never `.env.example`); `.env.example` is the canonical list (default + one-line comment per variable, placeholder `your-key-here` for secrets). Run `npm run env:check` / `npm run env:sync`; tests/env.test.js fails if a variable is read but not documented.
- Scrapers never call the LLM. They insert jobs with `rank_status = 'pending'`; ranking happens only in `rankPending()` (src/ranker/rank-pending.js) via the cron cycle or `npm run rank` (dry run unless `--run`), under the run lock, job/budget caps and circuit breaker (docs/adr/0016). Never reintroduce per-run re-ranking of existing jobs or write fake zero scores.
- The pre-filter (src/scrapers/pre-filter.js) enforces title allow/deny classification and location eligibility before any job reaches the ranker — changes to scraper output shape must stay compatible with what pre-filter expects.
- See docs/ARCHITECTURE.md and docs/adr/ for design rationale — this file covers conventions, not decisions.

## File Structure Rules
- One scraper per file in src/scrapers/
- New ATS platforms get their own generic scraper (greenhouse.js, lever.js)
- Company-specific scrapers only when the company uses a custom career page

## Code Style
- JSDoc comments on all exported functions
- Async/await throughout — no raw promise chains
- Graceful error handling — scrapers should never crash the whole run
- Log prefix format: [ComponentName] message

## Frontend
Frontend-specific architecture conventions (component structure, hooks,
props, file-size limits) are documented in frontend/AGENTS.md — always
read that file before making frontend changes.

## What Not To Touch
- src/db.js schema — any schema changes go through a migration
- .env.example — always keep in sync with any new env vars added (and add the default to ENV_DEFAULTS in src/config/env.js)
- BaseScraper.run() — only modify after discussion (it intentionally contains no LLM call; see ADR 0016)
- applications.status — deprecated as of ADR 0009, jobs.status is the sole funnel-state source. Do not read or write applications.status in new code.

## Testing
- Run `node --test tests/*.test.js` for the full test suite
- Run `npm run scrape` to validate scraper changes
- Check saved row count in output before pushing
- Run `cd frontend && npm run build` to validate frontend production builds

## Session Workflow
At the end of every Codex session:
1. When a design decision is made or changed, add or update an ADR in docs/adr/.
2. Update PROJECT_STATE.md — move completed items to done and update in-progress work.
3. Suggest a commit message in this format: `feat|fix|chore: description [phase-N]`.
4. Do not commit or push — that decision belongs to the developer.
