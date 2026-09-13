/** Add the generated-resume path to older jobs tables without rebuilding rows. */
export function migrateJobResumePath(database) {
  const columns = database.prepare('PRAGMA table_info(jobs)').all().map((column) => column.name);
  if (!columns.includes('resume_path')) database.exec('ALTER TABLE jobs ADD COLUMN resume_path TEXT DEFAULT NULL');
}
