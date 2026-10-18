import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFatalLlmError, resolveLlmSettings, LlmError } from '../llm/index.js';
import { estimateCostUsd } from '../llm/pricing.js';
import { dailySpendUsd } from '../llm/usage.js';
import { RankOutputError, SYSTEM_PROMPT, buildUserMessage, rankJob } from '../ranker/index.js';
import { getConfig } from '../config/env.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const GOLDEN_PATH = path.join(ROOT, 'evals', 'golden.jsonl');
const TYPICAL_OUTPUT_TOKENS = 80;

/**
 * Load and validate the golden set (one JSON object per line).
 * @param {string} [file] Path to golden.jsonl.
 * @returns {Array<object>} Entries.
 * @throws {Error} When a line is malformed or an expectation is invalid.
 */
export function loadGolden(file = GOLDEN_PATH) {
  const entries = fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim()).map((line, index) => {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      throw new Error(`${path.basename(file)} line ${index + 1} is not valid JSON.`);
    }
    for (const field of ['id', 'title', 'company', 'description', 'expected_min', 'expected_max']) {
      if (entry[field] === undefined || entry[field] === null || entry[field] === '') throw new Error(`${path.basename(file)} line ${index + 1}: missing ${field}.`);
    }
    if (!(entry.expected_min >= 1 && entry.expected_max <= 10 && entry.expected_min <= entry.expected_max)) {
      throw new Error(`${path.basename(file)} line ${index + 1} (id ${entry.id}): expected_min/expected_max must satisfy 1 <= min <= max <= 10.`);
    }
    return entry;
  });
  const ids = new Set(entries.map((entry) => entry.id));
  if (ids.size !== entries.length) throw new Error(`${path.basename(file)} contains duplicate ids.`);
  return entries;
}

/** The description text a mode sends: the stored production copy (off) or the full text, trimmed by the ranker (on). */
const inputFor = (entry, trim) => (trim ? entry.description_full ?? entry.description : entry.description);

/**
 * Estimate tokens and cost for one pass over the golden set (no LLM call).
 * @param {Array<object>} entries Golden entries.
 * @param {object} [options] Options.
 * @param {boolean} [options.trim] Estimate with description trimming.
 * @param {{model?: string, provider?: string}} [options.overrides] Model/provider overrides.
 * @returns {{jobs: number, model: string, inputTokens: number, outputTokensTypical: number, outputTokensMax: number, costTypicalUsd: number, costMaxUsd: number}} Estimate.
 */
export function estimateEval(entries, { trim = false, overrides = {} } = {}) {
  const model = resolveLlmSettings('ranker', overrides).model;
  const inputTokens = entries.reduce((sum, entry) => sum + Math.ceil((SYSTEM_PROMPT.length
    + buildUserMessage(entry.title, inputFor(entry, trim), entry.company, entry.location, { trim }).length) / 4), 0);
  const outputTokensTypical = entries.length * TYPICAL_OUTPUT_TOKENS;
  const outputTokensMax = entries.length * getConfig().rank.maxTokens;
  return {
    jobs: entries.length, model, inputTokens, outputTokensTypical, outputTokensMax,
    costTypicalUsd: estimateCostUsd(model, inputTokens, outputTokensTypical),
    costMaxUsd: estimateCostUsd(model, inputTokens, outputTokensMax),
  };
}

/**
 * Score every golden entry through the production rankJob path and compare with its expected range.
 * Never writes to the jobs table; the only database writes are llm_usage ledger rows marked purpose='eval'.
 * @param {object} options Options.
 * @param {Array<object>} options.entries Golden entries.
 * @param {import('better-sqlite3').Database} [options.db] Ledger database (omit to skip the ledger and the budget guard).
 * @param {boolean} [options.trim] Send trimmed descriptions.
 * @param {{model?: string, provider?: string}} [options.overrides] Model/provider overrides.
 * @param {number} [options.concurrency] Parallel requests.
 * @param {number} [options.maxUsd] Stop when today's ledger spend reaches this (defaults to LLM_DAILY_BUDGET_USD).
 * @param {string} [options.runId] Ledger run id.
 * @returns {Promise<{summary: object, results: Array<object>}>} Per-job results and aggregate numbers.
 */
export async function runEval({ entries, db, trim = false, overrides = {}, concurrency = 4, maxUsd = getConfig().llm.dailyBudgetUsd, runId = `eval-${Date.now()}` }) {
  const results = new Array(entries.length);
  const state = { next: 0, aborted: false, abortReason: null };
  const worker = async () => {
    while (!state.aborted) {
      const index = state.next;
      if (index >= entries.length) return;
      if (db && dailySpendUsd(db) >= maxUsd) {
        state.aborted = true;
        state.abortReason = 'daily_budget_reached';
        return;
      }
      state.next += 1;
      const entry = entries[index];
      const base = { id: entry.id, category: entry.category ?? null, title: entry.title, company: entry.company, expected_min: entry.expected_min, expected_max: entry.expected_max };
      try {
        const ranked = await rankJob(entry.title, inputFor(entry, trim), entry.company, entry.location ?? null, {
          db, runId, jobId: entry.id, kind: 'rank', purpose: 'eval', trim, overrides,
        });
        results[index] = {
          ...base, status: 'scored', score: ranked.score, pass: ranked.score >= entry.expected_min && ranked.score <= entry.expected_max,
          archetype: ranked.archetype, reason: ranked.reason, costUsd: ranked.estCostUsd, inputTokens: ranked.usage.input_tokens, outputTokens: ranked.usage.output_tokens,
        };
      } catch (error) {
        if (error instanceof RankOutputError) {
          results[index] = { ...base, status: 'parse_failure', pass: false, error: error.message };
        } else if (error instanceof LlmError) {
          results[index] = { ...base, status: 'error', pass: false, error: error.message };
          if (isFatalLlmError(error)) {
            state.aborted = true;
            state.abortReason = `fatal_llm_error:${error.kind}`;
          }
        } else {
          throw error;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, entries.length)) }, worker));

  const done = results.filter(Boolean);
  const scored = done.filter((result) => result.status === 'scored');
  const passed = done.filter((result) => result.pass).length;
  const costUsd = scored.reduce((sum, result) => sum + result.costUsd, 0);
  return {
    results: entries.map((entry, index) => results[index] ?? { id: entry.id, title: entry.title, company: entry.company, status: 'not_run', pass: false }),
    summary: {
      mode: trim ? 'trim_on' : 'trim_off',
      model: resolveLlmSettings('ranker', overrides).model,
      total: entries.length,
      attempted: done.length,
      passed,
      failed: entries.length - passed,
      passRate: entries.length ? passed / entries.length : 0,
      parseFailures: done.filter((result) => result.status === 'parse_failure').length,
      errors: done.filter((result) => result.status === 'error').length,
      costUsd,
      avgCostUsd: scored.length ? costUsd / scored.length : 0,
      inputTokens: scored.reduce((sum, result) => sum + result.inputTokens, 0),
      outputTokens: scored.reduce((sum, result) => sum + result.outputTokens, 0),
      aborted: state.aborted,
      abortReason: state.abortReason,
    },
  };
}
