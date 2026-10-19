import '../src/config/load-env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertEnv, getConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db.js';
import { GOLDEN_PATH, estimateEval, loadGolden, runEval } from '../src/eval/golden.js';
import { dailySpendUsd } from '../src/llm/usage.js';
import { PROMPT_VERSION } from '../src/ranker/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usd = (value) => `$${value.toFixed(4)}`;
const pct = (value) => `${(value * 100).toFixed(1)}%`;

function printSummary(summary) {
  console.log(`\nmodel ${summary.model}: ${summary.passed}/${summary.total} pass (${pct(summary.passRate)}; ${summary.knownMisses.length} known miss(es) excluded); ${summary.parseFailures} parse failure(s), ${summary.errors} error(s); `
    + `cost ${usd(summary.costUsd)} (avg ${usd(summary.avgCostUsd)}/job), ${summary.inputTokens} in / ${summary.outputTokens} out tokens${summary.aborted ? `; ABORTED (${summary.abortReason})` : ''}`);
}

function printResults({ results, summary }) {
  for (const result of results) {
    const range = `[${result.expected_min ?? '?'}-${result.expected_max ?? '?'}]`;
    const verdict = result.known_miss ? `KNOWN-MISS ${result.pass ? 'ok' : 'miss'}` : result.pass ? 'PASS' : result.status === 'scored' ? 'FAIL' : result.status.toUpperCase();
    console.log(`${verdict.padEnd(13)} #${result.id} ${result.status === 'scored' ? `score ${result.score}` : '-'} expected ${range}  ${result.company} | ${result.title}${result.error ? `  (${result.error.slice(0, 120)})` : ''}`);
  }
  const failed = results.filter((result) => !result.pass && !result.known_miss);
  if (failed.length) {
    console.log('\nFailed rows:');
    for (const result of failed) {
      console.log(`  #${result.id} ${result.company} | ${result.title} | expected ${result.expected_min ?? '?'}-${result.expected_max ?? '?'} | got ${result.status === 'scored' ? result.score : result.status} | `
        + `${result.archetype ?? '-'} | seniority_fit ${result.seniority_fit ?? '-'}\n    ${result.reason ?? result.error ?? ''}`);
    }
  }
  const known = results.filter((result) => result.known_miss);
  if (known.length) {
    console.log('\nKnown misses (printed every run, excluded from the pass-rate gate):');
    for (const result of known) {
      console.log(`  #${result.id} ${result.company} | ${result.title} | expected ${result.expected_min}-${result.expected_max} | got ${result.status === 'scored' ? result.score : result.status} | ${result.pass ? 'now within range' : 'still missing'} | `
        + `${result.archetype ?? '-'} | seniority_fit ${result.seniority_fit ?? '-'}\n    ${result.reason ?? result.error ?? ''}`);
    }
  }
  printSummary(summary);
}

/**
 * Entry point for `npm run eval`. Dry run (job count and cost estimate) unless --run is passed.
 * @param {string[]} args Command-line arguments.
 * @returns {Promise<number>} Process exit code.
 */
export async function main(args) {
  const valueOf = (flag) => args.find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1) ?? (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const run = args.includes('--run');
  const overrides = { model: valueOf('--model'), provider: valueOf('--provider') };
  const minPassRate = valueOf('--min-pass-rate') === undefined ? 0.9 : Number(valueOf('--min-pass-rate'));
  const limit = valueOf('--limit') === undefined ? undefined : Number(valueOf('--limit'));
  if (!Number.isFinite(minPassRate) || minPassRate < 0 || minPassRate > 1) throw new Error('--min-pass-rate must be between 0 and 1.');
  if (limit !== undefined && !(limit > 0)) throw new Error('--limit must be a positive number.');

  let entries = loadGolden(valueOf('--golden') ?? GOLDEN_PATH);
  if (limit) entries = entries.slice(0, limit);

  if (!run) {
    console.log(`[Eval] DRY RUN (no LLM calls). Pass --run to score. Prompt version ${PROMPT_VERSION}, ${entries.length} golden jobs.`);
    const estimate = estimateEval(entries, { overrides });
    console.log(`  model ${estimate.model}; ~${estimate.inputTokens} input tokens, ~${estimate.outputTokensTypical} output (typical) / ${estimate.outputTokensMax} (max); `
      + `est cost ${usd(estimate.costTypicalUsd)} typical, ${usd(estimate.costMaxUsd)} worst case`);
    return 0;
  }

  assertEnv({ requireLlm: true });
  const db = createDatabase();
  try {
    console.log(`[Eval] Running ${entries.length} golden jobs; prompt version ${PROMPT_VERSION}; spent today ${usd(dailySpendUsd(db))} (budget ${getConfig().llm.dailyBudgetUsd}).`);
    const report = await runEval({ entries, db, overrides, concurrency: getConfig().rank.concurrency });
    printResults(report);
    const reports = [report];
    fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
    const out = path.join(ROOT, 'tmp', `eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(out, JSON.stringify({ promptVersion: PROMPT_VERSION, reports }, null, 2));
    console.log(`\nSaved ${path.relative(ROOT, out)}`);
    const { summary } = report;
    const failed = summary.passRate < minPassRate || summary.parseFailures || summary.errors || summary.aborted;
    if (failed) console.error(`[Eval] FAILED gate (min pass rate ${pct(minPassRate)}, no parse failures/errors): ${pct(summary.passRate)}.`);
    return failed ? 1 : 0;
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`[Eval] ${error.message}`);
    process.exitCode = 1;
  });
}
