# PROJECT_STATE.md

## Current Phase
Phase 2 COMPLETE — Moving to Phase 3 (Outreach Engine)

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
- [x] Resume generator with LLM bullet selection from pre-approved pool
- [x] Fixed skills section (SKILLS_FIXED — no LLM involvement)
- [x] Bullet pool: 9 Livspace, 9 StartUs (inc. 3 combined core bullets), 5 Project bullets
- [x] Role-adaptive selection: 8+3 for frontend roles, 7+4 for full-stack/B2B roles
- [x] Role-specific summary tagline in heading (10 words max)
- [x] pdflatex compiler with PDF existence check
- [x] Output: resumes/[company]/[role--id]/Shashikanth_Resume.pdf
- [x] POST /api/resume/generate endpoint
- [x] npm run generate-resume CLI script
- [x] RESUME_LLM_MODEL env var separate from ranker LLM

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

## Phase 2 (Dashboard) — Complete
- [x] Build React dashboard (Vite) showing ranked job feed
- [x] Job cards with title, company, score, reason, apply link
- [x] Filter by score, company, new/seen
- [x] India-first location scoring and API filtering; dashboard defaults to India Only with an All Locations toggle
- [x] Manual links section showing custom-platform companies
- [x] Application status tracking (saved/applied/followed up)
- [x] Resume generation and pdflatex compilation pipeline

## Phase 3 (Outreach Engine) — Current Focus
- [x] LinkedIn URL generator per company
- [x] Message template store
- [x] Follow-up reminder system
- [x] Manual application entry form in dashboard
- [ ] Google Sheets sync (optional)

## Known Issues
- Swiggy careers page currently shows no jobs
- Node 24 incompatible with better-sqlite3 — use Node 20 LTS via nvm.
- Remove Resume Debug logs before production use
- Dashboard Save Resume button still shows Coming Soon — needs wiring to POST /api/resume/generate

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
