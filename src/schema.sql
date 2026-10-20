-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  -- ATS location string exactly as scraped (migration 009); `location` is the normalized value.
  location_raw TEXT,
  job_type TEXT,
  description TEXT,
  apply_url TEXT,
  source TEXT,
  found_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  posted_at DATETIME,
  relevance_score INTEGER,
  relevance_reason TEXT,
  resume_path TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'not_applied'
    CHECK (status IN ('not_applied', 'applied', 'in_process', 'closed')),
  is_new BOOLEAN DEFAULT 1,
  -- Persisted pre-filter verdict (migration 004); NULL means not yet evaluated.
  prefilter_status TEXT CHECK (prefilter_status IS NULL OR prefilter_status IN ('passed', 'rejected')),
  prefilter_reason TEXT,
  prefilter_version INTEGER,
  prefilter_checked_at DATETIME,
  -- Ranking state machine (migration 005); NULL means not yet backfilled.
  rank_status TEXT CHECK (rank_status IS NULL OR rank_status IN ('pending', 'ranked', 'failed', 'skipped')),
  rank_attempts INTEGER DEFAULT 0,
  rank_last_error TEXT,
  rank_next_retry_at TEXT,
  rank_model TEXT,
  rank_prompt_version INTEGER,
  rank_input_hash TEXT,
  ranked_at TEXT,
  rank_archetype TEXT,
  rank_seniority_fit TEXT,
  UNIQUE(company, job_id)
);

-- Applications table
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER REFERENCES jobs(id),
  applied_at DATETIME,
  resume_path TEXT,
  -- Deprecated legacy field; the application funnel state lives in jobs.status.
  status TEXT DEFAULT 'saved',
  follow_up_due DATETIME,
  notes TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Granular interview outcomes are tracked independently from the job funnel.
CREATE TABLE IF NOT EXISTS interviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('shortlisted', 'ongoing', 'rejected', 'offer-received', 'accepted')),
  comments TEXT NOT NULL DEFAULT '',
  contacts TEXT NOT NULL DEFAULT ''
);

-- Outreach table
CREATE TABLE IF NOT EXISTS outreach (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER REFERENCES jobs(id),
  contact_name TEXT,
  contact_role TEXT,
  linkedin_url TEXT,
  message_sent TEXT,
  sent_at DATETIME,
  follow_up_due DATETIME,
  response_received BOOLEAN DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_jobs_relevance_score ON jobs (relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_is_new ON jobs (is_new);
CREATE INDEX IF NOT EXISTS idx_jobs_found_at ON jobs (found_at);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications (job_id);
CREATE INDEX IF NOT EXISTS idx_outreach_job_id ON outreach (job_id);

-- LLM call ledger used for the daily budget cap.
CREATE TABLE IF NOT EXISTS llm_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  run_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('rank', 'resume', 'extract', 'manual')),
  job_id INTEGER,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  est_cost_usd REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  error TEXT,
  purpose TEXT
);
CREATE INDEX IF NOT EXISTS idx_llm_usage_ts ON llm_usage (ts);

-- Cross-process run locks (e.g. the 'rank' lock shared by cron and CLI).
CREATE TABLE IF NOT EXISTS app_locks (
  name TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  pid INTEGER,
  hostname TEXT
);

-- Completed fetch cycles (migration 010); the startup catch-up compares the latest against FETCH_CATCHUP_HOURS.
CREATE TABLE IF NOT EXISTS cycle_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  scrape_errors INTEGER NOT NULL DEFAULT 0
);

-- Review-dashboard triage for choices jobs.status has no value for (migration 011): 'new' is no row.
CREATE TABLE IF NOT EXISTS job_triage (
  job_id INTEGER PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('saved', 'skipped')),
  updated_at TEXT NOT NULL
);
