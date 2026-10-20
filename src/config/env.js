import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { SECRET_NAME, isPlaceholder } from './env-file.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Absolute path of the only env file the app reads (never .env.example). */
export const ENV_FILE_PATH = path.join(PROJECT_ROOT, '.env');

/**
 * Defaults for every variable; must match .env.example (enforced by tests/env.test.js).
 * Secrets default to '' (unset): placeholder values are treated as unset too.
 */
export const ENV_DEFAULTS = {
  DATABASE_PATH: './data/jobs.db',
  PORT: '3001',
  NODE_ENV: 'development',
  CAREER_PAGES_JSON: '[]',
  FIRECRAWL_API_KEY: '',
  LLM_PROVIDER: 'anthropic',
  LLM_API_KEY: '',
  LLM_MODEL: '',
  LLM_BASE_URL: '',
  LLM_DISABLED: '',
  LLM_TIMEOUT_MS: '60000',
  LLM_ANTHROPIC_DISABLE_THINKING: '',
  LLM_DAILY_BUDGET_USD: '0.50',
  RESUME_LLM_PROVIDER: '',
  RESUME_LLM_API_KEY: '',
  RESUME_LLM_MODEL: '',
  RESUME_LLM_BASE_URL: '',
  RANK_MAX_JOBS_PER_RUN: '200',
  RANK_CONCURRENCY: '4',
  RANK_MAX_ATTEMPTS: '3',
  RANK_RETRY_BASE_MINUTES: '60',
  RANK_MAX_TOKENS: '600',
  FETCH_CATCHUP_HOURS: '0',
  SCHEDULER_ENABLED: '0',
};

/**
 * Load .env so that it is authoritative: its values override variables already set in the shell. A missing .env
 * (for example in a hosted deployment) changes nothing, so real environment variables apply. The real project
 * .env is never loaded under tests; tests may pass an explicit temp `path` to exercise the loader.
 * @param {object} [options] Options.
 * @param {string} [options.path] Env file to load (defaults to the project .env).
 * @param {NodeJS.ProcessEnv} [options.env] Environment to update (defaults to process.env).
 * @param {(message: string) => void} [options.log] Logger for the one-line override notice.
 * @returns {{loaded: boolean, overridden: string[], skipped?: string}} Names (never values) of variables whose shell value was overridden.
 */
export function loadEnvFile({ path: envPath, env = process.env, log = console.log } = {}) {
  if (envPath === undefined && (process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT)) {
    return { loaded: false, overridden: [], skipped: 'test' };
  }
  const file = envPath ?? ENV_FILE_PATH;
  if (!fs.existsSync(file)) return { loaded: false, overridden: [] };
  const values = dotenv.parse(fs.readFileSync(file));
  const overridden = Object.keys(values).filter((name) => env[name] !== undefined && env[name] !== values[name]);
  Object.assign(env, values);
  if (overridden.length) log(`[Config] .env overrides ${overridden.length} shell variable(s): ${overridden.join(', ')}`);
  return { loaded: true, overridden };
}

function read(env, name) {
  const value = env[name];
  if (value === undefined || value === '') return ENV_DEFAULTS[name];
  return SECRET_NAME.test(name) && isPlaceholder(value) ? ENV_DEFAULTS[name] : value;
}

function number(env, name) {
  const value = Number(read(env, name));
  return Number.isFinite(value) ? value : Number(ENV_DEFAULTS[name]);
}

/**
 * Typed configuration with defaults matching .env.example. Reads the environment on every call so
 * tests and scripts can change it at runtime. Never log the returned secrets.
 * @param {NodeJS.ProcessEnv} [env] Environment to read.
 * @returns {object} Configuration.
 */
export function getConfig(env = process.env) {
  const resumeProvider = read(env, 'RESUME_LLM_PROVIDER');
  return {
    databasePath: read(env, 'DATABASE_PATH'),
    port: number(env, 'PORT'),
    nodeEnv: read(env, 'NODE_ENV'),
    careerPagesJson: read(env, 'CAREER_PAGES_JSON'),
    firecrawlApiKey: read(env, 'FIRECRAWL_API_KEY'),
    llm: {
      provider: read(env, 'LLM_PROVIDER'),
      apiKey: read(env, 'LLM_API_KEY'),
      model: read(env, 'LLM_MODEL'),
      baseUrl: read(env, 'LLM_BASE_URL'),
      disabled: read(env, 'LLM_DISABLED') === '1',
      timeoutMs: number(env, 'LLM_TIMEOUT_MS'),
      disableThinking: read(env, 'LLM_ANTHROPIC_DISABLE_THINKING') === '1',
      dailyBudgetUsd: number(env, 'LLM_DAILY_BUDGET_USD'),
    },
    resumeLlm: {
      provider: resumeProvider || read(env, 'LLM_PROVIDER'),
      apiKey: read(env, 'RESUME_LLM_API_KEY') || read(env, 'LLM_API_KEY'),
      model: read(env, 'RESUME_LLM_MODEL') || read(env, 'LLM_MODEL'),
      baseUrl: resumeProvider === 'ollama' ? read(env, 'RESUME_LLM_BASE_URL') : '',
    },
    fetch: {
      catchupHours: number(env, 'FETCH_CATCHUP_HOURS'),
    },
    scheduler: {
      enabled: read(env, 'SCHEDULER_ENABLED') === '1',
    },
    rank: {
      maxJobs: number(env, 'RANK_MAX_JOBS_PER_RUN'),
      concurrency: Math.max(1, Math.floor(number(env, 'RANK_CONCURRENCY'))),
      maxAttempts: number(env, 'RANK_MAX_ATTEMPTS'),
      retryBaseMinutes: number(env, 'RANK_RETRY_BASE_MINUTES'),
      maxTokens: Math.max(1, Math.floor(number(env, 'RANK_MAX_TOKENS'))),
    },
  };
}

/**
 * Check required and optional variables. Reports variable names only, never values.
 * @param {object} [options] Options.
 * @param {boolean} [options.requireLlm] Whether this entry point needs a working LLM configuration.
 * @param {NodeJS.ProcessEnv} [options.env] Environment to read.
 * @returns {{errors: string[], warnings: string[]}} Problems found.
 */
export function validateEnv({ requireLlm = false, env = process.env } = {}) {
  const config = getConfig(env);
  const errors = [];
  const warnings = [];
  if (requireLlm && !config.llm.disabled && config.llm.provider !== 'ollama' && !config.llm.apiKey) {
    errors.push(`LLM_API_KEY is required for provider "${config.llm.provider}" (set it in .env, or set LLM_DISABLED=1 to run without the LLM).`);
  }
  if (!config.firecrawlApiKey) warnings.push('FIRECRAWL_API_KEY is not set: the Swiggy scraper and CAREER_PAGES_JSON pages will fail.');
  const unset = Object.keys(ENV_DEFAULTS).filter((name) => (env[name] === undefined || env[name] === '')
    && !SECRET_NAME.test(name) && ENV_DEFAULTS[name] !== '' && name !== 'NODE_ENV');
  if (unset.length) warnings.push(`Optional variables not set, using defaults: ${unset.join(', ')}.`);
  return { errors, warnings };
}

/**
 * Log startup warnings and throw a clear error when a required variable is missing.
 * @param {object} [options] See validateEnv.
 * @returns {void}
 */
export function assertEnv(options = {}) {
  const { errors, warnings } = validateEnv(options);
  for (const warning of warnings) console.warn(`[Config] ${warning}`);
  if (errors.length) throw new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`);
}
