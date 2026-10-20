import express from 'express';
import { extractExperience } from './scrapers/pre-filter.js';
import { loadCompanyTiers } from './config/company-tiers.js';
import { COLUMNS, DEFAULT_MIN_SCORE, FROM, GROUP_SQL, LOCATION_GROUPS, MIN_SCORE_SQL, ORIGINS, REVIEW_STATUSES, STATUS_SQL, VISIBLE, orderCompanyGroups, parseFilters } from './review-query.js';

export { REVIEW_STATUSES, LOCATION_GROUPS } from './review-query.js';
const PAGE_SIZE_MAX = 100;
const GROUPINGS = ['none', 'score', 'company'];

const parseId = (value) => (Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null);
const positiveInt = (value, fallback) => (Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback);

/**
 * Move one job to a review status. applying/applied are written to the funnel (jobs.status in_process/applied), saved/skipped to
 * job_triage, new clears the triage row. A job that is already applied or closed cannot be moved back from here.
 * @param {import('better-sqlite3').Database} db Database connection.
 * @param {number} id Job id.
 * @param {string} status One of REVIEW_STATUSES.
 * @returns {{ok: true}|{error: string, code: number}} Outcome.
 */
export function setReviewStatus(db, id, status) {
  const job = db.prepare('SELECT status FROM jobs WHERE id = ?').get(id);
  if (!job) return { error: 'Job not found.', code: 404 };
  const now = new Date().toISOString();
  const funnel = (value) => db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(value, id);
  if (['applying', 'applied'].includes(status)) {
    if (job.status === 'closed' || (status === 'applying' && job.status === 'applied')) return { error: `This job is already ${job.status}; change it in the main dashboard.`, code: 409 };
    funnel(status === 'applying' ? 'in_process' : 'applied');
    if (status === 'applied' && !db.prepare('SELECT id FROM applications WHERE job_id = ?').get(id)) db.prepare('INSERT INTO applications (job_id, applied_at) VALUES (?, ?)').run(id, now);
    return { ok: true };
  }
  if (['applied', 'closed'].includes(job.status)) return { error: `This job is already ${job.status}; change it in the main dashboard.`, code: 409 };
  if (job.status === 'in_process') funnel('not_applied');
  if (status === 'new') db.prepare('DELETE FROM job_triage WHERE job_id = ?').run(id);
  else db.prepare('INSERT INTO job_triage (job_id, state, updated_at) VALUES (?, ?, ?) ON CONFLICT(job_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at').run(id, status, now);
  return { ok: true };
}

/**
 * Review API. It only reads the database and writes review statuses and manual job rows: it never scrapes, pre-filters or ranks.
 * @param {import('better-sqlite3').Database} db Database connection.
 * @param {{tiers?: (company: string) => 1|2|3}} [options] Company tier lookup (default: src/config/company-tiers.json, loaded once here, i.e. at server start).
 * @returns {import('express').Router} Router mounted at /api/review.
 */
export function createReviewRouter(db, { tiers = loadCompanyTiers() } = {}) {
  const router = express.Router();
  const one = (id) => db.prepare(`SELECT ${COLUMNS} ${FROM} WHERE jobs.id = ?`).get(id);

  const tierOf = tiers;

  router.get('/jobs', (req, res) => {
    const filters = parseFilters(req.query, { withStatus: true, withOrigin: true });
    if (filters.error) return res.status(400).json({ error: filters.error });
    const groupBy = req.query.groupBy ?? 'none';
    if (!GROUPINGS.includes(groupBy)) return res.status(400).json({ error: `groupBy must be one of: ${GROUPINGS.join(', ')}.` });
    const pageSize = Math.min(PAGE_SIZE_MAX, positiveInt(req.query.pageSize, 25));
    const page = positiveInt(req.query.page, 1);
    const start = (page - 1) * pageSize;
    const { where, params } = filters;
    const total = db.prepare(`SELECT COUNT(*) AS n ${FROM} WHERE ${where}`).get(params).n;
    const select = `SELECT ${COLUMNS}, jobs.description AS description_text ${FROM}`;
    let rows;
    let groupCounts = null;
    let continued = false;
    if (groupBy === 'company') {
      const light = db.prepare(`SELECT jobs.id, jobs.company, jobs.relevance_score AS score, jobs.found_at ${FROM} WHERE ${where}`).all(params);
      const ordered = orderCompanyGroups(light, tierOf);
      const ids = ordered.ids.slice(start, start + pageSize);
      const company = new Map(light.map((row) => [row.id, row.company]));
      groupCounts = Object.fromEntries(ordered.groups.map((group) => [group.key, group.count]));
      continued = start > 0 && ids.length > 0 && company.get(ordered.ids[start - 1]) === company.get(ids[0]);
      const byId = new Map(ids.length ? db.prepare(`${select} WHERE jobs.id IN (${ids.map(() => '?').join(',')})`).all(...ids).map((row) => [row.id, row]) : []);
      rows = ids.map((id) => byId.get(id));
    } else {
      rows = db.prepare(`${select} WHERE ${where} ORDER BY jobs.relevance_score DESC, jobs.found_at DESC, jobs.id DESC LIMIT @limit OFFSET @offset`).all({ ...params, limit: pageSize, offset: start });
      if (groupBy === 'score') {
        groupCounts = Object.fromEntries(db.prepare(`SELECT COALESCE(CAST(jobs.relevance_score AS TEXT), 'unranked') AS key, COUNT(*) AS n ${FROM} WHERE ${where} GROUP BY 1`).all(params).map((row) => [row.key, row.n]));
        if (start > 0 && rows.length) {
          const previous = db.prepare(`SELECT jobs.relevance_score AS score ${FROM} WHERE ${where} ORDER BY jobs.relevance_score DESC, jobs.found_at DESC, jobs.id DESC LIMIT 1 OFFSET @offset`).get({ ...params, offset: start - 1 });
          continued = (previous?.score ?? null) === (rows[0].score ?? null);
        }
      }
    }
    const jobs = rows.map(({ description_text: description, ...job }) => ({ ...job, experience: extractExperience(description)?.label ?? null }));
    return res.json({ jobs, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), groupBy, groupCounts, continued });
  });

  router.get('/filters', (_req, res) => res.json({
    companies: db.prepare(`SELECT DISTINCT jobs.company FROM jobs WHERE ${VISIBLE} ORDER BY jobs.company COLLATE NOCASE`).all().map((row) => row.company),
    archetypes: db.prepare(`SELECT DISTINCT jobs.rank_archetype AS value FROM jobs WHERE ${VISIBLE} AND jobs.rank_archetype IS NOT NULL ORDER BY 1`).all().map((row) => row.value),
    seniority: db.prepare(`SELECT DISTINCT jobs.rank_seniority_fit AS value FROM jobs WHERE ${VISIBLE} AND jobs.rank_seniority_fit IS NOT NULL ORDER BY 1`).all().map((row) => row.value),
    statuses: [...REVIEW_STATUSES, 'closed'], locationGroups: LOCATION_GROUPS,
  }));

  // Sidebar counts: per status bucket under the same filters as the list (one shared builder, parseFilters), ignoring only the status
  // bucket and origin themselves. `totals` is the same tally with no filters at all (every score), for "of M in this bucket".
  const tally = (where, params) => {
    const counts = { new: 0, saved: 0, applying: 0, applied: 0, skipped: 0, closed: 0, all: 0, manual: 0 };
    for (const row of db.prepare(`SELECT ${STATUS_SQL} AS review_status, jobs.source = 'manual' AS is_manual, COUNT(*) AS n ${FROM} WHERE ${where} GROUP BY 1, 2`).all(params)) {
      counts[row.review_status] += row.n;
      counts.all += row.n;
      if (row.is_manual) counts.manual += row.n;
    }
    return counts;
  };
  router.get('/counts', (req, res) => {
    const filters = parseFilters(req.query);
    if (filters.error) return res.status(400).json({ error: filters.error });
    const unfiltered = parseFilters({ minScore: '0' });
    return res.json({ ...tally(filters.where, filters.params), totals: tally(unfiltered.where, unfiltered.params), minScore: filters.params.minScore });
  });

  // Archetypes that exist in a view (status bucket + origin, at the given min score), for the archetype multi-select.
  router.get('/facets', (req, res) => {
    const { status, origin } = req.query;
    const minScore = Number(req.query.minScore ?? DEFAULT_MIN_SCORE);
    if (!Number.isFinite(minScore)) return res.status(400).json({ error: 'minScore must be a number.' });
    const clauses = [VISIBLE, MIN_SCORE_SQL, 'jobs.rank_archetype IS NOT NULL'];
    const params = { minScore };
    if (status) {
      if (![...REVIEW_STATUSES, 'closed'].includes(status)) return res.status(400).json({ error: 'Unknown status.' });
      clauses.push(`${STATUS_SQL} = @status`);
      params.status = status;
    }
    if (origin) {
      if (!ORIGINS[origin]) return res.status(400).json({ error: 'Unknown origin.' });
      clauses.push(ORIGINS[origin]);
    }
    const archetypes = db.prepare(`SELECT jobs.rank_archetype AS value, COUNT(*) AS count ${FROM} WHERE ${clauses.join(' AND ')} GROUP BY 1 ORDER BY count DESC, value`).all(params);
    return res.json({ archetypes });
  });

  // One job with its full description and application details (for the detail pane).
  router.get('/jobs/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Job id must be a positive integer.' });
    const job = db.prepare(`SELECT ${COLUMNS}, jobs.description, jobs.job_type, jobs.posted_at,
      (SELECT id FROM applications WHERE applications.job_id = jobs.id ORDER BY applications.id DESC LIMIT 1) AS application_id,
      (SELECT applied_at FROM applications WHERE applications.job_id = jobs.id ORDER BY applications.id DESC LIMIT 1) AS application_applied_at,
      (SELECT follow_up_due FROM applications WHERE applications.job_id = jobs.id ORDER BY applications.id DESC LIMIT 1) AS application_follow_up_due,
      (SELECT notes FROM applications WHERE applications.job_id = jobs.id ORDER BY applications.id DESC LIMIT 1) AS application_notes
      ${FROM} WHERE jobs.id = ?`).get(id);
    return job ? res.json({ ...job, experience: extractExperience(job.description)?.label ?? null }) : res.status(404).json({ error: 'Job not found.' });
  });

  // How many companies there are: with at least one ranked job, and in the DB overall.
  router.get('/companies', (_req, res) => res.json(db.prepare(`SELECT
    (SELECT COUNT(DISTINCT company) FROM jobs WHERE rank_status = 'ranked' AND COALESCE(prefilter_status, 'passed') != 'rejected') AS withRankedJobs,
    (SELECT COUNT(DISTINCT company) FROM jobs) AS total`).get()));

  router.get('/refresh', (_req, res) => {
    const row = db.prepare('SELECT trigger, completed_at FROM cycle_runs ORDER BY completed_at DESC, id DESC LIMIT 1').get();
    res.json(row
      ? { lastRefreshAt: row.completed_at, daysAgo: Math.floor((Date.now() - Date.parse(row.completed_at)) / 86_400_000), trigger: row.trigger }
      : { lastRefreshAt: null, daysAgo: null, trigger: null });
  });

  router.patch('/jobs/:id/status', (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Job id must be a positive integer.' });
    const { status } = req.body ?? {};
    if (!REVIEW_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of: ${REVIEW_STATUSES.join(', ')}.` });
    const result = setReviewStatus(db, id, status);
    return result.error ? res.status(result.code).json({ error: result.error }) : res.json(one(id));
  });

  router.get('/manual', (_req, res) => res.json(db.prepare(`SELECT ${COLUMNS} ${FROM} WHERE jobs.source = 'manual' ORDER BY jobs.found_at DESC, jobs.id DESC`).all()));

  router.post('/manual', (req, res) => {
    const { url, company, title, location, description } = req.body ?? {};
    let parsed;
    try {
      parsed = new URL(String(url ?? '').trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    } catch {
      return res.status(400).json({ error: 'A valid http(s) URL is required.' });
    }
    const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
    const applyUrl = parsed.toString();
    if (db.prepare('SELECT id FROM jobs WHERE apply_url = ?').get(applyUrl)) return res.status(409).json({ error: 'This job is already tracked.' });
    // Saved only: no fetch, no LLM. rank_status 'pending' marks it as never ranked; only `npm run rank:manual` ranks it.
    const id = db.prepare(`INSERT INTO jobs (job_id, title, company, description, apply_url, location, location_raw, job_type, source, status, rank_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'full-time', 'manual', 'not_applied', 'pending')`)
      .run(`manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text(title) ?? 'Untitled role', text(company) ?? parsed.hostname, text(description) ?? '', applyUrl, text(location), text(location)).lastInsertRowid;
    return res.status(201).json(one(Number(id)));
  });

  return router;
}
