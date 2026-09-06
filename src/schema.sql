-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  job_type TEXT,
  description TEXT,
  apply_url TEXT,
  source TEXT,
  found_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  posted_at DATETIME,
  relevance_score INTEGER,
  relevance_reason TEXT,
  is_new BOOLEAN DEFAULT 1,
  UNIQUE(company, job_id)
);

-- Applications table
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER REFERENCES jobs(id),
  applied_at DATETIME,
  resume_path TEXT,
  status TEXT DEFAULT 'saved',
  follow_up_due DATETIME,
  notes TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
