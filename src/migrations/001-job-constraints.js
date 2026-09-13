import { normalizeJobType } from '../jobs/fields.js';

/** Report exact duplicate posting URLs without changing any rows. */
export function findDuplicateUrls(db) {
  return db.prepare(`SELECT apply_url, COUNT(*) AS count, GROUP_CONCAT(id) AS ids
    FROM jobs WHERE apply_url IS NOT NULL GROUP BY apply_url HAVING COUNT(*) > 1`).all();
}

/** Apply URL uniqueness and employment-type constraints atomically, refusing unresolved data conflicts. */
export function migrateJobConstraints(db) {
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      const duplicates = findDuplicateUrls(db);
      if (duplicates.length) throw new Error(`Duplicate apply_url values require cleanup first: ${JSON.stringify(duplicates)}`);
      const brokenReferences = db.pragma('foreign_key_check');
      if (brokenReferences.length) throw new Error(`Existing orphan references require cleanup first: ${JSON.stringify(brokenReferences)}`);
      const rows = db.prepare('SELECT id, job_type FROM jobs').all();
      for (const row of rows) {
        if (!normalizeJobType(row.job_type)) throw new Error(`Unsupported job_type on job ${row.id}: ${row.job_type}`);
      }
      if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_jobs_apply_url_unique'").get()
        && db.prepare("SELECT sql FROM sqlite_master WHERE name='jobs'").get().sql.includes('CHECK (job_type IN')) return;
      const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='jobs' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
      const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='jobs'").get()?.seq ?? 0;
      db.exec(`CREATE TABLE jobs_constrained (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT, title TEXT NOT NULL, company TEXT NOT NULL,
        location TEXT,
        job_type TEXT NOT NULL DEFAULT 'full-time'
          CHECK (job_type IN ('full-time', 'part-time', 'contract', 'internship')),
        description TEXT, apply_url TEXT, source TEXT,
        found_at DATETIME DEFAULT CURRENT_TIMESTAMP, posted_at DATETIME,
        relevance_score INTEGER, relevance_reason TEXT, resume_path TEXT DEFAULT NULL, is_new BOOLEAN DEFAULT 1,
        UNIQUE(company, job_id)
      );
      INSERT INTO jobs_constrained SELECT id, job_id, title, company, location, 'full-time',
        description, apply_url, source, found_at, posted_at, relevance_score, relevance_reason, resume_path, is_new FROM jobs;`);
      const update = db.prepare('UPDATE jobs_constrained SET job_type=? WHERE id=?');
      for (const row of rows) update.run(normalizeJobType(row.job_type), row.id);
      db.exec('DROP TABLE jobs; ALTER TABLE jobs_constrained RENAME TO jobs;');
      for (const { sql } of indexes) db.exec(sql);
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_apply_url_unique ON jobs(apply_url)');
      db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq, ?) WHERE name='jobs'").run(sequence);
      if (db.pragma('foreign_key_check').length) throw new Error('Foreign-key validation failed; migration rolled back.');
    }).immediate();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
  }
}
