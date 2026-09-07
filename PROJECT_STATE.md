# PROJECT_STATE.md

## Current Phase
Phase 1 — Job Discovery Pipeline

## What's Built and Working
- [x] SQLite DB with jobs/applications/outreach schema
- [x] BaseScraper with rank-on-save pipeline
- [x] LLM client (model-agnostic, supports anthropic/openai/groq/ollama)
- [x] Ranker (scores 1-10 against Shashikanth's profile)
- [x] SwiggyScraper (Firecrawl-based, currently no jobs listed)
- [x] GreenhouseScraper (generic, config-driven)
- [x] LeverScraper (generic, config-driven)
- [x] node-cron scheduler (9am + 6pm IST)
- [x] Express API (/api/jobs, /api/jobs/:id, /api/stats)

## What's In Progress
- [ ] Verify Greenhouse/Lever scrapers return real jobs
- [ ] Remove Swiggy debug logs once confirmed working

## What's Next (Phase 1 Remaining)
- [ ] AshbyScraper (generic)
- [ ] Workday scraper (Firecrawl-based)
- [ ] /api/jobs filter by minScore, company, isNew
- [ ] npm run scrape output improvements

## Phase 2 (Resume Factory) — Not Started
- [ ] src/resume/ module
- [ ] JD → tailored .tex via LLM
- [ ] pdflatex compile via child_process
- [ ] Organised file storage /resumes/[company]/[job-id]/

## Phase 3 (Outreach) — Not Started
- [ ] LinkedIn URL generator per company
- [ ] Message template store
- [ ] Follow-up reminder system

## Known Issues
- gpt-5.6-luna: switch to gpt-4o-mini for stability
- Swiggy careers page currently shows no jobs
- Node 24 incompatible with better-sqlite3 — use Node 20 LTS via nvm.

## Architecture Decisions (Don't Revisit)
- Model-agnostic LLM client — no provider SDKs
- Generic ATS scrapers over per-company scrapers
- SQLite over Postgres — local tool, no infra needed
- pdflatex over JS PDF libs — reliability over portability

## How To Start a New Codex Session
1. Read AGENTS.md
2. Read PROJECT_STATE.md  
3. Read the specific file(s) you'll be modifying
4. Then make changes
