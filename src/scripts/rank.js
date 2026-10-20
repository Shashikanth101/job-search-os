import '../config/load-env.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertEnv } from '../config/env.js';
import { createDatabase } from '../db.js';
import { rankPending } from '../ranker/rank-pending.js';
import { PROMPT_VERSION } from '../ranker/index.js';

const usd = (value) => `$${value.toFixed(4)}`;

function printDryRun(result) {
  const { counts, caps: rawCaps, estimateThisRun: run, estimateAllEligible: all } = result;
  const caps = { ...rawCaps, maxJobsSource: process.env.RANK_MAX_JOBS_PER_RUN ? 'from .env/environment' : 'code default' };
  console.log(`[Rank] DRY RUN (no LLM calls). Pass --run to rank. Prompt version ${PROMPT_VERSION}, model ${run.model}, RANK_MAX_JOBS_PER_RUN=${caps.maxJobs} (${caps.maxJobsSource}).`);
  if (result.filter) {
    const parts = [result.filter.minScore != null && `score >= ${result.filter.minScore}`, result.filter.archetypes.length && `archetype in [${result.filter.archetypes.join(', ')}]`].filter(Boolean);
    console.log(`  FILTER (targeted re-rank, ordered by score desc): ${parts.join(' OR ')} -> ${result.eligible} candidates; est cost ${usd(all.costTypicalUsd)} typical / ${usd(all.costMaxUsd)} worst case (all candidates)`);
  }
  console.log(`  rank_status pending=${counts.pending ?? 0}  failed(retryable now)=${counts.failedRetryable ?? 0}  failed(waiting backoff)=${counts.failedWaiting ?? 0}  failed(exhausted)=${counts.failedExhausted ?? 0}  not backfilled=${counts.notBackfilled ?? 0}`);
  console.log(`  eligible now: ${result.eligible}; this run would rank ${result.selected} (cap RANK_MAX_JOBS_PER_RUN=${caps.maxJobs})`);
  console.log(`  this run: ~${run.inputTokens} input tokens, ~${run.outputTokensTypical} output (typical) / ${run.outputTokensMax} (max); est cost ${usd(run.costTypicalUsd)} typical, ${usd(run.costMaxUsd)} worst case`);
  console.log(`  all eligible: ~${all.inputTokens} input tokens; est cost ${usd(all.costTypicalUsd)} typical, ${usd(all.costMaxUsd)} worst case`);
  console.log(`  daily budget LLM_DAILY_BUDGET_USD=${caps.dailyBudgetUsd}: spent today ${usd(result.spentTodayUsd)}, remaining ${usd(result.budgetRemainingUsd)}${result.budgetAffordableJobs == null ? '' : ` (~${result.budgetAffordableJobs} jobs at worst-case cost)`}`);
  console.log(`  concurrency RANK_CONCURRENCY=${caps.concurrency}, RANK_MAX_ATTEMPTS=${caps.maxAttempts}${result.disabled ? '  ** LLM_DISABLED=1: --run would do nothing **' : ''}`);
}

/**
 * CLI entry shared by rank.js, rank:manual, rerank.js and retry-workday-ranking.js. Dry run unless --run is passed.
 * `--manual-only` ranks only never-ranked manual jobs (and nothing else); without it manual jobs are never selected.
 * @param {string[]} args Command-line arguments.
 * @param {{sourcePrefix?: string}} [defaults] Fixed options for wrapper scripts.
 * @returns {Promise<object>} Run or dry-run summary.
 */
export async function runRankCli(args, { sourcePrefix } = {}) {
  const valueOf = (flag) => args.find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1)
    ?? (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const limit = valueOf('--limit');
  const rerankVersion = valueOf('--rerank-version');
  const minScoreArg = valueOf('--min-score');
  const archetypeArg = valueOf('--include-archetype');
  if (limit !== undefined && !(Number(limit) > 0)) throw new Error('--limit must be a positive number.');
  if (rerankVersion !== undefined && !(Number(rerankVersion) > 0)) throw new Error('--rerank-version must be a positive number.');
  if (minScoreArg !== undefined && !Number.isFinite(Number(minScoreArg))) throw new Error('--min-score must be a number.');
  assertEnv({ requireLlm: args.includes('--run') });
  const db = createDatabase();
  try {
    const result = await rankPending({
      db,
      dryRun: !args.includes('--run'),
      maxJobs: limit === undefined ? undefined : Number(limit),
      rerankVersion: rerankVersion === undefined ? undefined : Number(rerankVersion),
      minScore: minScoreArg === undefined ? undefined : Number(minScoreArg),
      archetypes: archetypeArg === undefined ? undefined : archetypeArg.split(',').map((value) => value.trim()).filter(Boolean),
      sourcePrefix,
      manualOnly: args.includes('--manual-only'),
    });
    if (result.dryRun) printDryRun(result);
    else console.log(`[Rank] ${JSON.stringify(result)}`);
    return result;
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRankCli(process.argv.slice(2)).catch((error) => {
    console.error(`[Rank] ${error.message}`);
    process.exitCode = 1;
  });
}
