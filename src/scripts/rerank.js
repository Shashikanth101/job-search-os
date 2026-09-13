import 'dotenv/config';
import { createDatabase } from '../db.js';
import { rankJob } from '../ranker/index.js';

async function main() {
  const database = createDatabase();
  try {
    const jobs = database.prepare(`
      SELECT id, title, description, company, location, source
      FROM jobs
      WHERE relevance_score = 0 OR relevance_score IS NULL OR (@all = 1 AND source != 'manual')
    `).all({ all: process.argv.includes('--all') ? 1 : 0 });
    const updateJob = database.prepare(`
      UPDATE jobs
      SET relevance_score = ?, relevance_reason = ?, location = ?
      WHERE id = ?
    `);

    for (const job of jobs) {
      const { score, reason, location } = await rankJob(job.title, job.description, job.company, job.location);
      updateJob.run(score, reason, job.source === 'manual' ? job.location : location, job.id);
      console.log(`[Rerank] ${job.company}: ${job.title} → ${score}`);
    }
  } finally {
    database.close();
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
