# PROJECT_STATE.md

## Current Phase
Phase 1 — Job Discovery Pipeline

## What's Built and Working
- [x] SQLite DB with jobs/applications/outreach schema
- [x] BaseScraper with rank-on-save pipeline
- [x] LLM client (model-agnostic, supports anthropic/openai/groq/ollama)
- [x] Ranker — working, scoring 1-10 with detailed reasoning verified against real data
- [x] SwiggyScraper (Firecrawl-based, currently no jobs listed)
- [x] GreenhouseScraper — working, saving jobs for Postman (11), Razorpay (2)
- [x] LeverScraper — working, saving jobs for Meesho (3)
- [x] node-cron scheduler (9am + 6pm IST)
- [x] Express API (/api/jobs, /api/jobs/:id, /api/stats)
- [x] Node 20 LTS pinned via .nvmrc and package.json engines field
- [x] Swiggy debug logs removed

## What's In Progress
- [ ] Groww returning 0 — EU Greenhouse endpoint fallback not triggering
- [ ] CRED returning 0 — slug unverified
- [ ] Razorpay descriptions may be truncated — affecting ranker score accuracy

## What's Next (Phase 1 Remaining)
- [ ] Fix Groww and CRED scrapers
- [ ] Fix full description fetching for Greenhouse scraper
- [ ] Remove Swiggy from registry until they're actively hiring
- [ ] Add Express API filtering by minScore, company, isNew
- [ ] Build minimal React dashboard to view ranked jobs

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
