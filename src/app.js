import express from 'express';
import manualLinks from './config/manual-links.js';
import { serializeJob } from './db.js';
import { compileResume } from './resume/compiler.js';
import { generateResume } from './resume/generator.js';

const APPLICATION_STATUSES = ['saved', 'applied', 'interviewing', 'rejected', 'offer'];

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getApplicationInput(body = {}, fallbackStatus = 'saved') {
  const status = body.status ?? fallbackStatus;
  if (!APPLICATION_STATUSES.includes(status)) return { error: `status must be one of: ${APPLICATION_STATUSES.join(', ')}.` };
  return {
    status,
    applied_at: body.applied_at ?? null,
    resume_path: body.resume_path ?? null,
    follow_up_due: body.follow_up_due ?? null,
    notes: body.notes ?? null,
  };
}

/**
 * Creates the Express application and mounts the API routes.
 * @param {import('better-sqlite3').Database} db Database connection.
 * @returns {import('express').Express} Configured Express app.
 */
export function createApp(db) {
  const app = express();
  app.use(express.json());

  /**
   * Returns manually maintained career-page links.
   * @param {import('express').Request} _req Express request.
   * @param {import('express').Response} res Express response.
   * @returns {import('express').Response} JSON response.
   */
  app.get('/api/manual-links', (_req, res) => res.json(manualLinks));

  /**
   * Lists jobs with optional new, minimum-score, and location filters.
   * @param {import('express').Request} req Express request.
   * @param {import('express').Response} res Express response.
   * @returns {import('express').Response} JSON response.
   */
  app.get('/api/jobs', (req, res) => {
    const clauses = [];
    const params = {};
    if (req.query.new === 'true') clauses.push('is_new = 1');
    if (req.query.minScore !== undefined) {
      const minScore = Number(req.query.minScore);
      if (!Number.isFinite(minScore)) return res.status(400).json({ error: 'minScore must be a number.' });
      clauses.push('relevance_score >= @minScore');
      params.minScore = minScore;
    }
    if (req.query.location === 'india') {
      const includedLocations = ['Bangalore', 'Bengaluru', 'Mumbai', 'Pune', 'Hyderabad', 'Gurgaon', 'Gurugram', 'Delhi', 'Noida', 'Chennai', 'Remote'];
      const excludedLocations = ['United States', 'California', 'Texas', 'New York', 'Austin', 'Malaysia', 'Mountain View', 'San Francisco', 'Cupertino'];
      clauses.push(`(${includedLocations.map((location, index) => {
        params[`includedLocation${index}`] = `%${location.toLowerCase()}%`;
        return `LOWER(location) LIKE @includedLocation${index}`;
      }).join(' OR ')})`);
      excludedLocations.forEach((location, index) => {
        params[`excludedLocation${index}`] = `%${location.toLowerCase()}%`;
        clauses.push(`LOWER(location) NOT LIKE @excludedLocation${index}`);
      });
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const jobs = db.prepare(`
      SELECT jobs.*,
        (SELECT id FROM applications WHERE applications.job_id = jobs.id ORDER BY applications.id DESC LIMIT 1) AS application_id,
        (SELECT status FROM applications WHERE applications.job_id = jobs.id ORDER BY applications.id DESC LIMIT 1) AS application_status,
        (SELECT applied_at FROM applications WHERE applications.job_id = jobs.id ORDER BY applications.id DESC LIMIT 1) AS application_applied_at,
        (SELECT resume_path FROM applications WHERE applications.job_id = jobs.id ORDER BY applications.id DESC LIMIT 1) AS application_resume_path,
        (SELECT follow_up_due FROM applications WHERE applications.job_id = jobs.id ORDER BY applications.id DESC LIMIT 1) AS application_follow_up_due,
        (SELECT notes FROM applications WHERE applications.job_id = jobs.id ORDER BY applications.id DESC LIMIT 1) AS application_notes
      FROM jobs ${where}
      ORDER BY relevance_score DESC NULLS LAST, found_at DESC
    `).all(params);
    return res.json(jobs.map(serializeJob));
  });

  /**
   * Returns one job, including its full description.
   * @param {import('express').Request} req Express request.
   * @param {import('express').Response} res Express response.
   * @returns {import('express').Response} JSON response.
   */
  app.get('/api/jobs/:id', (req, res) => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(Number(req.params.id));
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    return res.json(serializeJob(job));
  });

  /**
   * Marks one job as no longer new.
   * @param {import('express').Request} req Express request.
   * @param {import('express').Response} res Express response.
   * @returns {import('express').Response} JSON response.
   */
  app.patch('/api/jobs/:id/seen', (req, res) => {
    const result = db.prepare('UPDATE jobs SET is_new = 0 WHERE id = ?').run(Number(req.params.id));
    if (!result.changes) return res.status(404).json({ error: 'Job not found.' });
    return res.json(serializeJob(db.prepare('SELECT * FROM jobs WHERE id = ?').get(Number(req.params.id))));
  });

  /**
   * Creates an application record for a job.
   * @param {import('express').Request} req Express request.
   * @param {import('express').Response} res Express response.
   * @returns {import('express').Response} JSON response.
   */
  app.post('/api/jobs/:id/application', (req, res) => {
    const jobId = parseId(req.params.id);
    if (!jobId) return res.status(400).json({ error: 'Job id must be a positive integer.' });
    if (!db.prepare('SELECT id FROM jobs WHERE id = ?').get(jobId)) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const input = getApplicationInput(req.body);
    if (input.error) return res.status(400).json({ error: input.error });

    const result = db.prepare(`
      INSERT INTO applications (job_id, applied_at, resume_path, status, follow_up_due, notes)
      VALUES (@job_id, @applied_at, @resume_path, @status, @follow_up_due, @notes)
    `).run({ job_id: jobId, ...input });
    return res.status(201).json(db.prepare('SELECT * FROM applications WHERE id = ?').get(result.lastInsertRowid));
  });

  /**
   * Updates an existing application record.
   * @param {import('express').Request} req Express request.
   * @param {import('express').Response} res Express response.
   * @returns {import('express').Response} JSON response.
   */
  app.patch('/api/applications/:id', (req, res) => {
    const applicationId = parseId(req.params.id);
    if (!applicationId) return res.status(400).json({ error: 'Application id must be a positive integer.' });
    const existing = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
    if (!existing) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    const input = getApplicationInput({ ...existing, ...req.body }, existing.status);
    if (input.error) return res.status(400).json({ error: input.error });
    db.prepare(`
      UPDATE applications
      SET applied_at = @applied_at,
          resume_path = @resume_path,
          status = @status,
          follow_up_due = @follow_up_due,
          notes = @notes,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ id: applicationId, ...input });
    return res.json(db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId));
  });

  /**
   * Generates and compiles a tailored resume for a job.
   * @param {import('express').Request} req Express request.
   * @param {import('express').Response} res Express response.
   * @returns {Promise<import('express').Response>} JSON response.
   */
  app.post('/api/resume/generate', async (req, res) => {
    const { jobId, jobTitle, company, jobDescription } = req.body ?? {};
    if (jobId === undefined || jobId === null || jobId === '' || !jobTitle || !company || !jobDescription) {
      return res.status(400).json({ success: false, error: 'jobId, jobTitle, company, and jobDescription are required.' });
    }

    try {
      const texPath = await generateResume({ jobId, jobTitle, company, jobDescription });
      const pdfPath = await compileResume(texPath);
      const job = db.prepare('SELECT id FROM jobs WHERE id = ? OR job_id = ? LIMIT 1').get(jobId, String(jobId));

      if (job) {
        const application = db.prepare('SELECT id FROM applications WHERE job_id = ? ORDER BY id DESC LIMIT 1').get(job.id);
        if (application) {
          db.prepare('UPDATE applications SET resume_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(pdfPath, application.id);
        } else {
          db.prepare('INSERT INTO applications (job_id, resume_path, status) VALUES (?, ?, ?)').run(job.id, pdfPath, 'saved');
        }
      }

      return res.json({ success: true, pdfPath, texPath });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Returns aggregate job-search statistics.
   * @param {import('express').Request} _req Express request.
   * @param {import('express').Response} res Express response.
   * @returns {import('express').Response} JSON response.
   */
  app.get('/api/stats', (_req, res) => {
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM jobs WHERE is_new = 1 AND date(found_at, 'localtime') = date('now', 'localtime')) AS new_jobs_today,
        COUNT(*) AS total_jobs,
        COALESCE(AVG(relevance_score), 0) AS average_score,
        (SELECT COUNT(*) FROM applications WHERE status = 'saved') AS saved_applications,
        (SELECT COUNT(*) FROM applications WHERE status = 'applied') AS applied_applications,
        (SELECT COUNT(*) FROM applications WHERE follow_up_due IS NOT NULL) AS pending_follow_ups
      FROM jobs
    `).get();
    return res.json({ ...stats, average_score: Number(stats.average_score) });
  });

  return app;
}
