const JOB_STATUSES = ['not_applied', 'applied', 'in_process', 'closed'];

/** Migrate legacy application statuses into the coarse job funnel and create interview records.
 * @param {import('better-sqlite3').Database} database Database connection.
 * @returns {void}
 */
export function migrateCoarseJobStatus(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  if (database.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get('003-coarse-job-status')) return;

  database.transaction(() => {
    const columns = database.prepare('PRAGMA table_info(jobs)').all().map((column) => column.name);
    if (!columns.includes('status')) {
      database.exec(`ALTER TABLE jobs ADD COLUMN status TEXT NOT NULL DEFAULT 'not_applied'
        CHECK (status IN ('not_applied', 'applied', 'in_process', 'closed'))`);
    }

    database.exec(`
      CREATE TABLE IF NOT EXISTS interviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL REFERENCES jobs(id),
        company_name TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('shortlisted', 'ongoing', 'rejected', 'offer-received', 'accepted')),
        comments TEXT NOT NULL DEFAULT '',
        contacts TEXT NOT NULL DEFAULT ''
      );

      UPDATE jobs
      SET status = CASE (
        SELECT applications.status FROM applications
        WHERE applications.job_id = jobs.id
        ORDER BY applications.id DESC LIMIT 1
      )
        WHEN 'saved' THEN 'not_applied'
        WHEN 'applied' THEN 'applied'
        WHEN 'followed_up' THEN 'applied'
        WHEN 'interviewing' THEN 'in_process'
        WHEN 'offer' THEN 'closed'
        WHEN 'rejected' THEN 'closed'
        ELSE status
      END
      WHERE EXISTS (SELECT 1 FROM applications WHERE applications.job_id = jobs.id);

      INSERT INTO interviews (job_id, company_name, title, status, comments, contacts)
      SELECT jobs.id, jobs.company, jobs.title,
        CASE latest.status WHEN 'interviewing' THEN 'ongoing' ELSE 'offer-received' END,
        '', ''
      FROM jobs
      JOIN applications AS latest ON latest.job_id = jobs.id
      WHERE latest.status IN ('interviewing', 'offer')
        AND NOT EXISTS (
          SELECT 1 FROM applications AS newer
          WHERE newer.job_id = latest.job_id AND newer.id > latest.id
        );

      INSERT INTO schema_migrations (name) VALUES ('003-coarse-job-status');
    `);

    const invalidStatuses = database.prepare(`SELECT id, status FROM jobs WHERE status NOT IN (${JOB_STATUSES.map(() => '?').join(', ')})`).all(...JOB_STATUSES);
    if (invalidStatuses.length) throw new Error(`Invalid jobs.status values after migration: ${JSON.stringify(invalidStatuses)}`);
    if (database.pragma('foreign_key_check').length) throw new Error('Foreign-key validation failed after coarse status migration.');
  }).immediate();
}
