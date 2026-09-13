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
  resume_path TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'not_applied'
    CHECK (status IN ('not_applied', 'applied', 'in_process', 'closed')),
  is_new BOOLEAN DEFAULT 1,
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
