import 'dotenv/config';
import Database from 'better-sqlite3';
import { findDuplicateUrls, migrateJobConstraints } from '../migrations/001-job-constraints.js';

const db = new Database(process.env.DATABASE_PATH || './data/jobs.db', { fileMustExist: true });
try {
  const duplicates = findDuplicateUrls(db);
  console.log('[Migration] Duplicate URLs:', JSON.stringify(duplicates, null, 2));
  console.log('[Migration] Orphan references:', JSON.stringify(db.pragma('foreign_key_check'), null, 2));
  if (!process.argv.includes('--check')) {
    migrateJobConstraints(db);
    console.log('[Migration] Job constraints applied successfully.');
  }
} catch (error) {
  console.error('[Migration]', error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
