import { getConfig } from '../config/env.js';

/**
 * Ranking guard configuration (values come from the central env config; defaults match .env.example).
 * @param {NodeJS.ProcessEnv} [env] Environment.
 * @returns {{maxJobs: number, dailyBudgetUsd: number, concurrency: number, maxAttempts: number, disabled: boolean, retryBaseMinutes: number}} Settings.
 */
export function getRankConfig(env = process.env) {
  const config = getConfig(env);
  return {
    maxJobs: config.rank.maxJobs,
    dailyBudgetUsd: config.llm.dailyBudgetUsd,
    concurrency: config.rank.concurrency,
    maxAttempts: config.rank.maxAttempts,
    disabled: config.llm.disabled,
    retryBaseMinutes: config.rank.retryBaseMinutes,
  };
}

export const RANK_LOCK_NAME = 'rank';
export const RANK_LOCK_TTL_MS = 2 * 60 * 60 * 1000;
export const BREAKER_CONSECUTIVE_FAILURES = 5;
export const IN_RUN_RETRIES = 2;
