import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { LlmError, isFatalLlmError, isTransientLlmError, resolveLlmSettings } from '../llm/index.js';
import { estimateCostUsd } from '../llm/pricing.js';
import { dailySpendUsd } from '../llm/usage.js';
import { acquireLock, releaseLock } from '../locks.js';
import { getRankConfig, RANK_LOCK_NAME, RANK_LOCK_TTL_MS, BREAKER_CONSECUTIVE_FAILURES, IN_RUN_RETRIES } from './config.js';
import { getConfig } from '../config/env.js';
import { deriveLocation } from '../jobs/fields.js';
import { ARCHETYPES, MAX_DESCRIPTION_CHARS, PROMPT_VERSION, RankOutputError, SYSTEM_PROMPT, buildUserMessage, rankJob } from './index.js';

const PENDING_OR_RETRYABLE = `COALESCE(prefilter_status, 'passed') != 'rejected' AND (
  rank_status = 'pending'
  OR (rank_status = 'failed' AND rank_attempts < @maxAttempts AND (rank_next_retry_at IS NULL OR rank_next_retry_at <= @now)))`;
const RERANK = `COALESCE(prefilter_status, 'passed') != 'rejected' AND source != 'manual'
  AND rank_status = 'ranked' AND COALESCE(rank_prompt_version, 0) < @rerankVersion`;
const TYPICAL_OUTPUT_TOKENS = 80;
const DRAIN_MS = 15_000;
const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };

const jitter = (ms) => ms + Math.random() * 500;
const backoffMs = (attempt) => jitter(Math.min(8000, 1000 * 2 ** attempt));

/**
 * Build the candidate WHERE clause and bind parameters. With a re-rank, the optional targeted filter keeps rows whose
 * stored score is >= minScore OR whose archetype is in the list (either condition alone when only one is given).
 */
function candidateQuery({ maxAttempts, rerankVersion, sourcePrefix, minScore, archetypes, manualOnly }) {
  const params = { maxAttempts, now: new Date().toISOString(), prefix: `${sourcePrefix ?? ''}%` };
  let where = rerankVersion ? RERANK : PENDING_OR_RETRYABLE;
  const filtered = Boolean(rerankVersion) && (minScore != null || archetypes?.length > 0);
  if (rerankVersion) params.rerankVersion = rerankVersion;
  if (filtered) {
    const conditions = [];
    if (minScore != null) {
      conditions.push('relevance_score >= @minScore');
      params.minScore = minScore;
    }
    if (archetypes?.length) {
      conditions.push(`rank_archetype IN (${archetypes.map((_, index) => `@archetype${index}`).join(', ')})`);
      archetypes.forEach((archetype, index) => { params[`archetype${index}`] = archetype; });
    }
    where += ` AND (${conditions.join(' OR ')})`;
  }
  // Manual jobs are ranked only on request (`npm run rank:manual`): every other selection excludes them.
  return { where: `${where} AND source LIKE @prefix AND ${manualOnly ? "source = 'manual'" : "source != 'manual'"}`, params, filtered };
}

function selectJobs(db, options) {
  const { where, params, filtered } = candidateQuery(options);
  // A filtered re-rank is ordered best-score-first so a budget or job-cap stop loses the least important jobs.
  const order = filtered ? 'relevance_score DESC, id' : "(rank_status = 'pending') DESC, found_at DESC, id";
  return db.prepare(`SELECT id, title, company, location, location_raw, description, source, rank_status FROM jobs
    WHERE ${where} ORDER BY ${order} LIMIT @limit`).all({ ...params, limit: options.limit });
}

/**
 * Rank one stored job with fresh independent requests. Never writes a fabricated score:
 * infrastructure failures leave the job untouched ('infra'); only unusable output after retries becomes 'failed'.
 * @param {import('better-sqlite3').Database} db Database connection.
 * @param {object} job Job row (id, title, description, company, location, location_raw, source). The model's location never
 *   overwrites a stored value with null; a NULL location falls back to deriveLocation(location_raw).
 * @param {object} [options] Options.
 * @param {string} [options.runId] Ledger run id.
 * @param {'rank'|'manual'} [options.kind] Ledger kind.
 * @param {boolean} [options.rerank] Allow overwriting an already ranked row.
 * @param {AbortSignal} [options.signal] Aborts an in-flight call (job stays untouched).
 * @param {() => boolean} [options.shouldStop] Checked before each attempt.
 * @param {(ms: number) => Promise<void>} [options.sleep] Backoff sleeper (injectable for tests).
 * @param {number} [options.retryBaseMinutes] Base for the persisted failed-retry backoff.
 * @returns {Promise<{outcome: 'ranked'|'failed'|'infra'|'stopped'|'aborted', fatal?: boolean, error?: string}>} Result.
 */
export async function rankOne(db, job, { runId, kind = 'rank', rerank = false, shouldStop = () => false, sleep = delay, retryBaseMinutes = 60, signal } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= IN_RUN_RETRIES; attempt += 1) {
    if (shouldStop()) return { outcome: 'stopped' };
    try {
      const result = await rankJob(job.title, job.description, job.company, job.location, { db, runId, jobId: job.id, kind, signal });
      const update = db.prepare(`UPDATE jobs SET relevance_score = @score, relevance_reason = @reason,
        ${job.source === 'manual' ? '' : 'location = COALESCE(@location, location, @fallbackLocation),'}
        rank_status = 'ranked', rank_model = @model, rank_prompt_version = @promptVersion, rank_input_hash = @inputHash,
        ranked_at = @rankedAt, rank_archetype = @archetype, rank_seniority_fit = @seniorityFit, rank_last_error = NULL, rank_next_retry_at = NULL
        WHERE id = @id AND (@rerank = 1 OR rank_status IN ('pending', 'failed'))`);
      update.run({ ...result, location: result.location, fallbackLocation: deriveLocation(job.location_raw), rankedAt: new Date().toISOString(), id: job.id, rerank: rerank ? 1 : 0 });
      return { outcome: 'ranked' };
    } catch (error) {
      // An aborted call (shutdown) leaves the job untouched: no attempt counted, no error recorded, no score.
      if (error instanceof LlmError && error.kind === 'aborted') return { outcome: 'aborted' };
      lastError = error;
      if (isFatalLlmError(error)) return { outcome: 'infra', fatal: true, error: error.message, kind: error.kind };
      if (error instanceof LlmError && !isTransientLlmError(error)) return { outcome: 'infra', fatal: true, error: error.message, kind: error.kind };
      if (error instanceof LlmError) {
        if (attempt < IN_RUN_RETRIES) await sleep(backoffMs(attempt));
        continue;
      }
      if (!(error instanceof RankOutputError)) throw error;
    }
  }
  if (lastError instanceof LlmError) {
    db.prepare('UPDATE jobs SET rank_last_error = ? WHERE id = ?').run(lastError.message.slice(0, 500), job.id);
    return { outcome: 'infra', fatal: false, error: lastError.message, kind: lastError.kind };
  }
  if (rerank) return { outcome: 'failed', error: lastError.message };
  const row = db.prepare('SELECT rank_attempts FROM jobs WHERE id = ?').get(job.id);
  const attempts = (row?.rank_attempts ?? 0) + 1;
  const nextRetry = new Date(Date.now() + retryBaseMinutes * 60_000 * 4 ** (attempts - 1)).toISOString();
  db.prepare(`UPDATE jobs SET rank_status = 'failed', rank_attempts = ?, rank_last_error = ?, rank_next_retry_at = ? WHERE id = ? AND rank_status != 'ranked'`)
    .run(attempts, lastError.message.slice(0, 500), nextRetry, job.id);
  return { outcome: 'failed', error: lastError.message };
}

function resolveModel(kind = 'ranker') {
  try {
    return resolveLlmSettings(kind).model;
  } catch {
    return 'unknown';
  }
}

/** Estimate tokens and cost for the rows that would be ranked. */
function estimate(jobs, model) {
  const inputTokens = jobs.reduce((sum, job) => sum + Math.ceil((SYSTEM_PROMPT.length + buildUserMessage(job.title, job.description, job.company, job.location).length) / 4), 0);
  const typicalOutput = jobs.length * TYPICAL_OUTPUT_TOKENS;
  const maxOutput = jobs.length * getConfig().rank.maxTokens;
  return {
    model,
    inputTokens,
    outputTokensTypical: typicalOutput,
    outputTokensMax: maxOutput,
    costTypicalUsd: estimateCostUsd(model, inputTokens, typicalOutput),
    costMaxUsd: estimateCostUsd(model, inputTokens, maxOutput),
  };
}

/**
 * Rank pending (and retryable failed) jobs under strict guards: kill switch, run lock, job cap, daily USD budget,
 * bounded concurrency and a circuit breaker. A ranked job is never selected again unless rerankVersion is set.
 * @param {object} options Options.
 * @param {import('better-sqlite3').Database} options.db Database connection.
 * @param {number} [options.maxJobs] Max jobs this run (RANK_MAX_JOBS_PER_RUN).
 * @param {number} [options.maxUsd] Daily USD budget (LLM_DAILY_BUDGET_USD).
 * @param {number} [options.concurrency] Worker pool size (RANK_CONCURRENCY).
 * @param {string} [options.runId] Ledger run id.
 * @param {boolean} [options.dryRun] Count and estimate only; no lock, no LLM call.
 * @param {number} [options.rerankVersion] Re-rank ranked jobs whose rank_prompt_version is below this (must be <= PROMPT_VERSION).
 * @param {number} [options.minScore] With rerankVersion: keep rows whose score is >= this (OR-ed with archetypes).
 * @param {string[]} [options.archetypes] With rerankVersion: keep rows whose rank_archetype is in this list.
 * @param {string} [options.sourcePrefix] Restrict to sources starting with this prefix.
 * @param {boolean} [options.manualOnly] Rank only never-ranked manual jobs (with false, manual jobs are never selected). Not combinable with rerankVersion.
 * @param {(ms: number) => Promise<void>} [options.sleep] Backoff sleeper.
 * @param {number} [options.drainMs] After SIGINT/SIGTERM/SIGHUP, how long in-flight calls may finish before they are aborted.
 * @param {{on: Function, off: Function}} [options.processRef] Signal source (injectable for tests).
 * @param {(code: number) => void} [options.exit] Called with 130/143/129 after a signal-driven shutdown (injectable for tests).
 * @returns {Promise<object>} Run summary.
 */
export async function rankPending({ db, maxJobs, maxUsd, concurrency, runId = randomUUID(), dryRun = false, rerankVersion, minScore, archetypes, sourcePrefix, manualOnly = false, sleep, drainMs = DRAIN_MS, processRef = process, exit = (code) => process.exit(code) } = {}) {
  const config = getRankConfig();
  const caps = {
    maxJobs: maxJobs ?? config.maxJobs,
    dailyBudgetUsd: maxUsd ?? config.dailyBudgetUsd,
    concurrency: Math.max(1, concurrency ?? config.concurrency),
    maxAttempts: config.maxAttempts,
  };
  if (manualOnly && rerankVersion) throw new Error('--manual-only cannot be combined with --rerank-version (manual jobs are never re-ranked in bulk).');
  const hasFilter = minScore != null || archetypes?.length > 0;
  if (hasFilter && !rerankVersion) throw new Error('--min-score and --include-archetype only apply together with --rerank-version.');
  if (minScore != null && !Number.isFinite(minScore)) throw new Error('--min-score must be a number.');
  const unknown = (archetypes ?? []).filter((archetype) => !ARCHETYPES.includes(archetype));
  if (unknown.length) throw new Error(`Unknown archetype(s): ${unknown.join(', ')}. Valid: ${ARCHETYPES.join(', ')}.`);
  if (rerankVersion && rerankVersion > PROMPT_VERSION) throw new Error(`--rerank-version ${rerankVersion} exceeds the current PROMPT_VERSION ${PROMPT_VERSION}.`);
  const summary = { runId, dryRun, caps, selected: 0, ranked: 0, failed: 0, infra: 0, calls: 0, interrupted: 0, aborted: false, abortReason: null, skipped: null, maxConcurrent: 0 };
  const model = resolveModel();
  const now = new Date().toISOString();

  if (dryRun) {
    const counts = db.prepare(`SELECT
      SUM(rank_status = 'pending' AND COALESCE(prefilter_status,'passed') != 'rejected') AS pending,
      SUM(rank_status = 'failed' AND rank_attempts < @maxAttempts AND (rank_next_retry_at IS NULL OR rank_next_retry_at <= @now)) AS failedRetryable,
      SUM(rank_status = 'failed' AND rank_attempts < @maxAttempts AND rank_next_retry_at > @now) AS failedWaiting,
      SUM(rank_status = 'failed' AND rank_attempts >= @maxAttempts) AS failedExhausted,
      SUM(rank_status IS NULL) AS notBackfilled
      FROM jobs WHERE source LIKE @prefix AND ${manualOnly ? "source = 'manual'" : "source != 'manual'"}`).get({ maxAttempts: caps.maxAttempts, now, prefix: `${sourcePrefix ?? ''}%` });
    const jobs = selectJobs(db, { ...caps, rerankVersion, minScore, archetypes, sourcePrefix, manualOnly, limit: caps.maxJobs });
    const { where, params } = candidateQuery({ ...caps, rerankVersion, minScore, archetypes, sourcePrefix, manualOnly });
    const eligible = db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE ${where}`).get(params).n;
    const spentToday = dailySpendUsd(db);
    const forRun = estimate(jobs, model);
    const perJob = jobs.length ? forRun.costMaxUsd / jobs.length : 0;
    return { ...summary, counts, eligible, selected: jobs.length, spentTodayUsd: spentToday, budgetRemainingUsd: Math.max(0, caps.dailyBudgetUsd - spentToday),
      budgetAffordableJobs: perJob ? Math.floor(Math.max(0, caps.dailyBudgetUsd - spentToday) / perJob) : null,
      filter: hasFilter ? { minScore: minScore ?? null, archetypes: archetypes ?? [] } : null, estimateThisRun: forRun, estimateAllEligible: estimate(selectJobs(db, { ...caps, rerankVersion, minScore, archetypes, sourcePrefix, manualOnly, limit: 1_000_000 }), model),
      disabled: config.disabled };
  }

  if (config.disabled) {
    console.log('[Ranker] LLM_DISABLED=1; skipping ranking.');
    return { ...summary, skipped: 'disabled' };
  }
  if (!acquireLock(db, RANK_LOCK_NAME, runId, RANK_LOCK_TTL_MS)) {
    console.log('[Ranker] Another ranking run holds the lock; skipping.');
    return { ...summary, skipped: 'locked' };
  }

  // Graceful shutdown: first signal stops claiming jobs and lets in-flight calls finish (then aborts them after
  // drainMs); a second signal releases the lock and exits immediately. The lock is also released in `finally`.
  const controller = new AbortController();
  const sleeper = sleep ?? ((ms) => delay(ms, undefined, { signal: controller.signal }).catch(() => {}));
  let signalName = null;
  let signalCount = 0;
  let drainTimer;
  const onSignal = (name) => {
    signalCount += 1;
    if (signalCount === 1) {
      signalName = name;
      summary.aborted = true;
      summary.abortReason = `signal:${name}`;
      console.error(`[Ranker] ${name} received: finishing in-flight calls (up to ${drainMs}ms), then exiting.`);
      drainTimer = setTimeout(() => controller.abort(), drainMs);
      return;
    }
    console.error(`[Ranker] ${name} received again: releasing the lock and exiting now.`);
    try { releaseLock(db, RANK_LOCK_NAME, runId); } catch { /* best effort */ }
    exit(SIGNAL_EXIT_CODES[name] ?? 1);
  };
  const handlers = Object.keys(SIGNAL_EXIT_CODES).map((name) => [name, () => onSignal(name)]);
  for (const [name, handler] of handlers) processRef.on(name, handler);

  try {
    const jobs = selectJobs(db, { ...caps, rerankVersion, minScore, archetypes, sourcePrefix, manualOnly, limit: caps.maxJobs });
    summary.selected = jobs.length;
    const perCall = estimateCostUsd(model, Math.ceil((SYSTEM_PROMPT.length + MAX_DESCRIPTION_CHARS) / 4), getConfig().rank.maxTokens);
    let next = 0;
    let active = 0;
    let consecutiveFailures = 0;
    const abort = (reason) => {
      if (!summary.aborted) {
        summary.aborted = true;
        summary.abortReason = reason;
        console.error(`[Ranker] Aborting run ${runId}: ${reason}`);
      }
    };
    const worker = async () => {
      while (!summary.aborted) {
        const index = next;
        if (index >= jobs.length) return;
        if (dailySpendUsd(db) + active * perCall >= caps.dailyBudgetUsd) return abort('daily_budget_reached');
        next += 1;
        active += 1;
        summary.maxConcurrent = Math.max(summary.maxConcurrent, active);
        try {
          const result = await rankOne(db, jobs[index], {
            runId, rerank: Boolean(rerankVersion), shouldStop: () => summary.aborted, sleep: sleeper, retryBaseMinutes: config.retryBaseMinutes, signal: controller.signal,
          });
          if (result.outcome === 'stopped' || result.outcome === 'aborted') {
            summary.interrupted += 1;
            continue;
          }
          if (result.outcome === 'ranked') {
            summary.ranked += 1;
            consecutiveFailures = 0;
          } else {
            summary[result.outcome] += 1;
            consecutiveFailures += 1;
            if (result.fatal) abort(`fatal_llm_error:${result.kind}`);
            else if (consecutiveFailures >= BREAKER_CONSECUTIVE_FAILURES) abort('circuit_breaker_consecutive_failures');
          }
        } finally {
          active -= 1;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(caps.concurrency, Math.max(jobs.length, 1)) }, worker));
    summary.calls = db.prepare('SELECT COUNT(*) AS n FROM llm_usage WHERE run_id = ?').get(runId).n;
    summary.spentTodayUsd = dailySpendUsd(db);
    console.log(`[Ranker] ${JSON.stringify(summary)}`);
    return summary;
  } finally {
    clearTimeout(drainTimer);
    for (const [name, handler] of handlers) processRef.off(name, handler);
    releaseLock(db, RANK_LOCK_NAME, runId);
    if (signalName) exit(SIGNAL_EXIT_CODES[signalName]);
  }
}
