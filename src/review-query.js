export const REVIEW_STATUSES = ['new', 'saved', 'applying', 'applied', 'skipped'];
export const LOCATION_GROUPS = ['india', 'remote', 'other', 'unknown'];
/** Default min-score filter, shared by the list and the counts (they use one filter builder). */
export const DEFAULT_MIN_SCORE = 7;
const INDIA_PATTERNS = ['india', 'bengaluru', 'bangalore', 'mumbai', 'pune', 'hyderabad', 'chennai', 'noida', 'gurgaon', 'gurugram', 'delhi'];

// The review status is derived: the funnel (jobs.status) wins for applying/applied/closed, then the triage row, else 'new'.
export const STATUS_SQL = `CASE jobs.status WHEN 'applied' THEN 'applied' WHEN 'in_process' THEN 'applying' WHEN 'closed' THEN 'closed'
  ELSE COALESCE(job_triage.state, 'new') END`;
export const GROUP_SQL = `CASE WHEN COALESCE(jobs.location, '') = '' THEN 'unknown'
  WHEN ${INDIA_PATTERNS.map((pattern) => `LOWER(jobs.location) LIKE '%${pattern}%'`).join(' OR ')} THEN 'india'
  WHEN LOWER(COALESCE(jobs.location_raw, '') || ' ' || jobs.location) LIKE '%remote%' THEN 'remote'
  ELSE 'other' END`;
export const COLUMNS = `jobs.id, jobs.relevance_score AS score, jobs.company, jobs.title, jobs.location, jobs.location_raw, jobs.rank_archetype AS archetype,
  jobs.rank_seniority_fit AS seniority_fit, jobs.relevance_reason AS reason, jobs.found_at, jobs.apply_url, jobs.source, jobs.rank_status, (jobs.source = 'manual') AS is_manual,
  CAST(julianday('now') - julianday(jobs.found_at) AS INTEGER) AS scraped_days_ago, ${STATUS_SQL} AS review_status, ${GROUP_SQL} AS location_group`;
export const FROM = 'FROM jobs LEFT JOIN job_triage ON job_triage.job_id = jobs.id';
// The jobs the review views can show: scraped jobs the model ranked, plus every manual job (ranked or not), minus pre-filter rejects.
const SCRAPED_RANKED = "jobs.rank_status = 'ranked' AND jobs.relevance_score IS NOT NULL AND jobs.source != 'manual'";
export const VISIBLE = `COALESCE(jobs.prefilter_status, 'passed') != 'rejected' AND (${SCRAPED_RANKED} OR jobs.source = 'manual')`;
export const MIN_SCORE_SQL = "(jobs.source = 'manual' OR jobs.relevance_score >= @minScore)";
export const ORIGINS = { manual: "jobs.source = 'manual'", scraped: "jobs.source != 'manual'" };


/**
 * The one filter builder behind both the list and the counts, so they can never disagree about which jobs a filter set means.
 * Always applies the visible population and the min-score rule; optionally the status bucket and origin (the list uses them, the counts
 * deliberately do not: counts are per bucket under the same filters).
 * @param {Record<string, string>} query Request query: minScore, archetype (comma list), seniority, locationGroup, company, q, status, origin.
 * @param {{withStatus?: boolean, withOrigin?: boolean}} [options] Which route-level filters to apply.
 * @returns {{error: string}|{where: string, params: object}} SQL conditions (joined with AND) and named parameters, or a 400 message.
 */
export function parseFilters(query, { withStatus = false, withOrigin = false } = {}) {
  const minScore = query.minScore === undefined || query.minScore === '' ? DEFAULT_MIN_SCORE : Number(query.minScore);
  if (!Number.isFinite(minScore)) return { error: 'minScore must be a number.' };
  const clauses = [VISIBLE, MIN_SCORE_SQL];
  const params = { minScore };
  if (withOrigin && query.origin) {
    if (!ORIGINS[query.origin]) return { error: `origin must be one of: ${Object.keys(ORIGINS).join(', ')}.` };
    clauses.push(ORIGINS[query.origin]);
  }
  if (withStatus && query.status) {
    if (![...REVIEW_STATUSES, 'closed'].includes(query.status)) return { error: `status must be one of: ${[...REVIEW_STATUSES, 'closed'].join(', ')}.` };
    clauses.push(`${STATUS_SQL} = @status`);
    params.status = query.status;
  }
  const archetypes = String(query.archetype ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (archetypes.length) {
    clauses.push(`jobs.rank_archetype IN (${archetypes.map((_, index) => `@archetype${index}`).join(', ')})`);
    archetypes.forEach((value, index) => { params[`archetype${index}`] = value; });
  }
  if (query.seniority) { clauses.push('jobs.rank_seniority_fit = @seniority'); params.seniority = String(query.seniority); }
  if (query.company) { clauses.push('jobs.company = @company'); params.company = String(query.company); }
  if (query.locationGroup) {
    if (!LOCATION_GROUPS.includes(query.locationGroup)) return { error: `locationGroup must be one of: ${LOCATION_GROUPS.join(', ')}.` };
    clauses.push(`${GROUP_SQL} = @locationGroup`);
    params.locationGroup = query.locationGroup;
  }
  if (query.q && String(query.q).trim()) {
    clauses.push("(LOWER(jobs.title) LIKE @q OR LOWER(jobs.company) LIKE @q OR LOWER(COALESCE(jobs.relevance_reason, '')) LIKE @q)");
    params.q = `%${String(query.q).trim().toLowerCase()}%`;
  }
  return { where: clauses.join(' AND '), params };
}

const byScoreDesc = (a, b) => (b.score ?? -1) - (a.score ?? -1) || String(b.found_at).localeCompare(String(a.found_at)) || b.id - a.id;

/**
 * Order jobs for "group by company": company groups by tier ascending, then the group's best score descending, then its job count
 * descending, then name; inside a group by score descending, newest first. Never alphabetical-first.
 * @param {Array<{id: number, company: string, score: number|null, found_at: string}>} rows The filtered jobs (light columns).
 * @param {(company: string) => 1|2|3} tierOf Company tier lookup.
 * @returns {{ids: number[], groups: Array<{key: string, count: number, bestScore: number|null, tier: number}>}} Job ids in display order and the groups in order.
 */
export function orderCompanyGroups(rows, tierOf) {
  const byCompany = new Map();
  for (const row of rows) {
    if (!byCompany.has(row.company)) byCompany.set(row.company, []);
    byCompany.get(row.company).push(row);
  }
  const groups = [...byCompany.entries()].map(([key, members]) => ({
    key, count: members.length, tier: tierOf(key), bestScore: members.reduce((best, row) => Math.max(best, row.score ?? -1), -1), members,
  })).sort((a, b) => a.tier - b.tier || b.bestScore - a.bestScore || b.count - a.count || a.key.localeCompare(b.key, undefined, { sensitivity: 'base' }));
  return {
    ids: groups.flatMap((group) => [...group.members].sort(byScoreDesc).map((row) => row.id)),
    groups: groups.map(({ members, bestScore, ...group }) => ({ ...group, bestScore: bestScore < 0 ? null : bestScore })),
  };
}
