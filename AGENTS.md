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
- Never hardcode API keys — always use process.env

## File Structure Rules
- One scraper per file in src/scrapers/
- New ATS platforms get their own generic scraper (greenhouse.js, lever.js)
- Company-specific scrapers only when the company uses a custom career page

## Code Style
- JSDoc comments on all exported functions
- Async/await throughout — no raw promise chains
- Graceful error handling — scrapers should never crash the whole run
- Log prefix format: [ComponentName] message

## What Not To Touch
- src/db.js schema — any schema changes go through a migration
- .env.example — always keep in sync with any new env vars added
- BaseScraper.run() — only modify after discussion

## Testing
- Run `npm run scrape` to validate scraper changes
- Check saved row count in output before pushing

## Session Workflow
At the end of every Codex session:
1. Update PROJECT_STATE.md — move completed items to done, update in-progress
2. Suggest a commit message in this format: `feat|fix|chore: description [phase-N]`
3. Do not commit or push — that decision belongs to the developer
