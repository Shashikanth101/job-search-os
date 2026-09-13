import express from 'express';
import fs from 'node:fs/promises';
import linkedinOutreach from './config/linkedin-outreach.js';
import manualLinks from './config/manual-links.js';
import messageTemplates from './config/message-templates.js';
import { rankJob } from './ranker/index.js';
import { JOB_TYPES } from './jobs/fields.js';
import { serializeJob } from './db.js';
import { compileResume } from './resume/compiler.js';
import { generateResume } from './resume/generator.js';

const JOB_STATUSES = ['not_applied', 'applied', 'in_process', 'closed'];

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getApplicationInput(body = {}) {
  return {
    applied_at: body.applied_at ?? null,
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
   * Returns LinkedIn recruiter and hiring-manager search links.
   * @param {import('express').Request} _req Express request.
   * @param {import('express').Response} res Express response.
   * @returns {import('express').Response} JSON response.
   */
  app.get('/api/linkedin-outreach', (_req, res) => res.json(linkedinOutreach));

  /**
   * Returns reusable outreach message templates.
   * @param {import('express').Request} _req Express request.
   * @param {import('express').Response} res Express response.
   * @returns {import('express').Response} JSON response.
   */
  app.get('/api/message-templates', (_req, res) => res.json(messageTemplates));

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
      clauses.push("(source = 'manual' OR relevance_score >= @minScore)");
      params.minScore = minScore;
    }
    if (req.query.location === 'india') {
      const includedLocations = ['Bangalore', 'Bengaluru', 'Mumbai', 'Pune', 'Hyderabad', 'Gurgaon', 'Gurugram', 'Delhi', 'Noida', 'Chennai', 'Remote'];
      const excludedLocations = ['United States', 'California', 'Texas', 'New York', 'Austin', 'Malaysia', 'Mountain View', 'San Francisco', 'Cupertino'];
      const locationClauses = [`(LOWER(location) = 'india' OR ${includedLocations.map((location, index) => {
        params[`includedLocation${index}`] = `%${location.toLowerCase()}%`;
        return `LOWER(location) LIKE @includedLocation${index}`;
      }).join(' OR ')})`];
      excludedLocations.forEach((location, index) => {
        params[`excludedLocation${index}`] = `%${location.toLowerCase()}%`;
        locationClauses.push(`LOWER(location) NOT LIKE @excludedLocation${index}`);
      });
      clauses.push(`(source = 'manual' OR (${locationClauses.join(' AND ')}))`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const jobs = db.prepare(`
      SELECT jobs.*,
        (SELECT id FROM applications WHERE applications.job_id = jobs.id ORDER BY applications.id DESC LIMIT 1) AS application_id,
        (SELECT applied_at FROM applications WHERE applications.job_id = jobs.id ORDER BY applications.id DESC LIMIT 1) AS application_applied_at,
        (SELECT follow_up_due FROM applications WHERE applications.job_id = jobs.id ORDER BY applications.id DESC LIMIT 1) AS application_follow_up_due,
        (SELECT notes FROM applications WHERE applications.job_id = jobs.id ORDER BY applications.id DESC LIMIT 1) AS application_notes
      FROM jobs ${where}
      ORDER BY relevance_score DESC NULLS LAST, found_at DESC
    `).all(params);
    return res.json(jobs.map(serializeJob));
  });

  /**
   * Creates and scores a manually entered job application.
   * @param {import('express').Request} req Express request.
   * @param {import('express').Response} res Express response.
   * @returns {Promise<import('express').Response>} JSON response.
   */
  app.post('/api/jobs/manual', async (req, res) => {
    const { company, title, jobDescription, applyUrl, location = 'India', job_type = 'full-time', status = 'not_applied' } = req.body ?? {};
    if (!company || !title || !jobDescription || !applyUrl) {
      return res.status(400).json({ error: 'company, title, jobDescription, and applyUrl are required.' });
    }
    if (location != null && typeof location !== 'string') {
      return res.status(400).json({ error: 'location must be a string.' });
    }
    if (!JOB_TYPES.includes(job_type)) return res.status(400).json({ error: 'Invalid job type.' });
    if (typeof applyUrl !== 'string') return res.status(400).json({ error: 'applyUrl must be a string.' });
    if (!JOB_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of: ${JOB_STATUSES.join(', ')}.` });
    if (db.prepare('SELECT id FROM jobs WHERE apply_url = ?').get(applyUrl)) {
      return res.status(409).json({ error: 'This job is already tracked' });
    }

    try {
      const jobId = `manual-${Date.now()}`;
      const result = db.prepare(`
        INSERT INTO jobs (job_id, title, company, description, apply_url, location, job_type, source, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?)
      `).run(jobId, title, company, jobDescription, applyUrl, location?.trim() || null, job_type, status);
      const { score, reason } = await rankJob(title, jobDescription, company, location);
      db.prepare('UPDATE jobs SET relevance_score = ?, relevance_reason = ? WHERE id = ?').run(score, reason, result.lastInsertRowid);
      const application = db.prepare(`
        INSERT INTO applications (job_id, applied_at)
        VALUES (?, ?)
      `).run(result.lastInsertRowid, ['applied', 'in_process'].includes(status) ? new Date().toISOString() : null);
      const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(result.lastInsertRowid);
      return res.status(201).json({ ...serializeJob(job), application_id: application.lastInsertRowid });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' && error.message.includes('jobs.apply_url')) {
        return res.status(409).json({ error: 'This job is already tracked' });
      }
      return res.status(500).json({ error: error.message });
    }
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

  /** Updates the coarse funnel status for one job. */
  app.patch('/api/jobs/:id/status', (req, res) => {
    const jobId = parseId(req.params.id);
    if (!jobId) return res.status(400).json({ error: 'Job id must be a positive integer.' });
    const { status } = req.body ?? {};
    if (!JOB_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of: ${JOB_STATUSES.join(', ')}.` });
    const result = db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, jobId);
    if (!result.changes) return res.status(404).json({ error: 'Job not found.' });
    return res.json(serializeJob(db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId)));
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
      INSERT INTO applications (job_id, applied_at, follow_up_due, notes)
      VALUES (@job_id, @applied_at, @follow_up_due, @notes)
    `).run({ job_id: jobId, ...input });
    return res.status(201).json(db.prepare(`SELECT id, job_id, applied_at, follow_up_due, notes, updated_at
      FROM applications WHERE id = ?`).get(result.lastInsertRowid));
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
    const existing = db.prepare(`SELECT id, job_id, applied_at, follow_up_due, notes
      FROM applications WHERE id = ?`).get(applicationId);
    if (!existing) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    const input = getApplicationInput({ ...existing, ...req.body });
    db.prepare(`
      UPDATE applications
      SET applied_at = @applied_at,
          follow_up_due = @follow_up_due,
          notes = @notes,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ id: applicationId, ...input });
    return res.json(db.prepare(`SELECT id, job_id, applied_at, follow_up_due, notes, updated_at
      FROM applications WHERE id = ?`).get(applicationId));
  });

  /**
   * Generates a tailored resume for a stored job and saves its absolute PDF path.
   * @param {import('express').Request} req Express request.
   * @param {import('express').Response} res Express response.
   * @returns {Promise<import('express').Response>} JSON response.
   */
  app.post('/api/resume/generate', async (req, res) => {
    const { jobId } = req.body ?? {};
    if (jobId === undefined || jobId === null || jobId === '' || !['string', 'number'].includes(typeof jobId)) {
      return res.status(400).json({ success: false, error: 'jobId is required.' });
    }

    const job = db.prepare('SELECT id, job_id, title, company, description FROM jobs WHERE id = ? OR job_id = ? LIMIT 1').get(jobId, String(jobId));
    if (!job) return res.status(404).json({ success: false, error: `Job not found: ${jobId}` });

    try {
      const texPath = await generateResume({
        jobId: job.job_id ?? job.id,
        jobTitle: job.title,
        company: job.company,
        jobDescription: job.description ?? '',
      });
      const pdfPath = await compileResume(texPath);
      const pdf = await fs.stat(pdfPath);
      if (!pdf.isFile()) throw new Error('Resume generation did not produce a PDF file.');
      db.prepare('UPDATE jobs SET resume_path = ? WHERE id = ?').run(pdfPath, job.id);
      return res.json({ success: true, resumePath: pdfPath });
    } catch (error) {
      return res.status(500).json({ success: false, error: `Resume generation failed: ${error.message}` });
    }
  });

  /** Serves only a PDF path recorded on the requested job. */
  app.get('/api/jobs/:id/resume', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid job ID.' });
    const job = db.prepare('SELECT resume_path FROM jobs WHERE id = ?').get(id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    if (!job.resume_path) return res.status(404).json({ error: 'No resume has been generated for this job.' });
    try {
      const pdf = await fs.stat(job.resume_path);
      if (!pdf.isFile()) return res.status(404).json({ error: 'The generated resume file is missing.' });
      return res.sendFile(job.resume_path, { headers: { 'Content-Type': 'application/pdf' } });
    } catch {
      return res.status(404).json({ error: 'The generated resume file is missing.' });
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
        (SELECT COUNT(*) FROM jobs WHERE status = 'not_applied') AS saved_applications,
        (SELECT COUNT(*) FROM jobs WHERE status IN ('applied', 'in_process')) AS applied_applications,
        (SELECT COUNT(*) FROM applications
          JOIN jobs ON jobs.id = applications.job_id
          WHERE jobs.status IN ('applied', 'in_process')
            AND applications.follow_up_due IS NOT NULL
            AND applications.id = (
              SELECT latest.id FROM applications AS latest
              WHERE latest.job_id = jobs.id ORDER BY latest.id DESC LIMIT 1
            )) AS pending_follow_ups
      FROM jobs
    `).get();
    const followUps = db.prepare(`
      SELECT
        applications.id AS application_id,
        jobs.id AS job_id,
        jobs.company,
        jobs.title,
        applications.applied_at,
        applications.follow_up_due,
        applications.updated_at,
        CAST(julianday('now') - julianday(COALESCE(applications.follow_up_due, applications.applied_at)) AS INTEGER) AS days_since_update
      FROM applications
      JOIN jobs ON jobs.id = applications.job_id
      WHERE jobs.status IN ('applied', 'in_process')
        AND applications.id = (
          SELECT latest.id FROM applications AS latest
          WHERE latest.job_id = jobs.id ORDER BY latest.id DESC LIMIT 1
        )
        AND (
          (applications.follow_up_due IS NOT NULL AND datetime(applications.follow_up_due) <= datetime('now'))
          OR (applications.follow_up_due IS NULL AND applications.applied_at IS NOT NULL
            AND datetime(applications.applied_at) < datetime('now', '-5 days'))
        )
      ORDER BY days_since_update DESC
    `).all();
    return res.json({
      ...stats,
      average_score: Number(stats.average_score),
      followUpsDue: followUps.length,
      followUps,
    });
  });

  return app;
}
