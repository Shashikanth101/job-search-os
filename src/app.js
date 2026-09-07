import express from 'express';
import manualLinks from './config/manual-links.js';
import { serializeJob } from './db.js';

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
   * Lists jobs with optional new and minimum-score filters.
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
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const jobs = db.prepare(`SELECT * FROM jobs ${where} ORDER BY relevance_score DESC NULLS LAST, found_at DESC`).all(params);
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
        COALESCE(AVG(relevance_score), 0) AS average_score
      FROM jobs
    `).get();
    return res.json({ ...stats, average_score: Number(stats.average_score) });
  });

  return app;
}
