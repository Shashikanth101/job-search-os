# PROJECT_STATE.md

## Current Phase
Phase 1 COMPLETE — Moving to Phase 2 (Dashboard)

## What's Built and Working
- [x] SQLite DB with jobs/applications/outreach schema
- [x] BaseScraper with rank-on-save pipeline
- [x] LLM client (model-agnostic, supports anthropic/openai/groq/ollama)
- [x] Ranker verified working correctly — scores 1-10 with accurate reasoning
- [x] SwiggyScraper (Firecrawl-based, currently no jobs listed)
- [x] GreenhouseScraper — working, saving jobs for Postman (11), Razorpay (2)
- [x] LeverScraper — working, saving jobs for Meesho (3)
- [x] node-cron scheduler (9am + 6pm IST)
- [x] Express API (/api/jobs, /api/jobs/:id, /api/stats)
- [x] Node 20 LTS pinned via .nvmrc and package.json engines field
- [x] Swiggy debug logs removed
- [x] HTML entity decoding fixed in GreenhouseScraper
- [x] Keyword filter broadened to catch SDE/Software Engineer titles
- [x] CRED confirmed active on Lever (slug: cred)
- [x] SmartRecruitersScraper — working, saving jobs for PhonePe (2), Zomato (1)
- [x] Glean added via Greenhouse (slug: gleanwork) — 16 jobs saved
- [x] Rerank script updated to catch all unscored jobs regardless of company
- [x] manual-links.js config created for custom-platform companies
- [x] GET /api/manual-links endpoint added
- [x] 35 total jobs in DB across 6 companies

## What's Known — ATS Platform Map
- Greenhouse: Postman, Razorpay, Groww, Glean
- Lever: Meesho, CRED
- SmartRecruiters: PhonePe, Zomato
- Workday: BrowserStack (not yet supported)
- Custom platform: Zerodha, Flipkart, Swiggy

## Known Issues for Phase 1B (fix later)
- HTML entity ' not decoded in SmartRecruiters descriptions
- SRE/Rust roles slipping through broad Software Engineer filter
- Swiggy, CRED, Groww currently have no open frontend roles

## Phase 2 (Dashboard) — Current Focus
- [ ] Build React dashboard (Vite) showing ranked job feed
- [ ] Job cards with title, company, score, reason, apply link
- [ ] Filter by score, company, new/seen
- [ ] Manual links section showing custom-platform companies
- [ ] Application status tracking (saved/applied/followed up)

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
