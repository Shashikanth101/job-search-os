import 'dotenv/config';
import { createDatabase } from '../db.js';
import { compileResume } from '../resume/compiler.js';
import { generateResume } from '../resume/generator.js';

function getJobId() {
  const argument = process.argv.find((value) => value.startsWith('--jobId='));
  return argument?.slice('--jobId='.length);
}

async function main() {
  const jobId = getJobId();
  if (!jobId) throw new Error('Usage: npm run generate-resume -- --jobId=JOB_ID');

  const database = createDatabase();
  try {
    const job = database.prepare('SELECT id, job_id, title, company, description FROM jobs WHERE id = ? OR job_id = ? LIMIT 1').get(jobId, jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    const texPath = await generateResume({
      jobId: job.job_id ?? job.id,
      jobTitle: job.title,
      company: job.company,
      jobDescription: job.description ?? '',
    });
    const pdfPath = await compileResume(texPath);
    console.log(`[Resume] LaTeX: ${texPath}`);
    console.log(`[Resume] PDF: ${pdfPath}`);
  } finally {
    database.close();
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(`[Resume] ${error.message}`);
  process.exit(1);
});
