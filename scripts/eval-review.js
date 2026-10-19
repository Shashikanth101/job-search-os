import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportReviewCsv, importReviewCsv } from '../src/eval/review.js';

/**
 * Entry point for `npm run eval:export` / `npm run eval:import`. No LLM calls.
 * @param {string[]} args Command-line arguments (first is `export` or `import`).
 * @returns {number} Process exit code.
 */
export function main(args) {
  const [command] = args;
  if (command === 'export') {
    const { count, file } = exportReviewCsv();
    console.log(`[EvalReview] Wrote ${count} rows to ${path.relative(process.cwd(), file)}.`);
    return 0;
  }
  if (command === 'import') {
    const { changes, unchanged } = importReviewCsv();
    for (const change of changes) {
      console.log(`  #${change.id}: ${change.fields.map(({ field, from, to }) => `${field} ${JSON.stringify(from)} -> ${JSON.stringify(to)}`).join('; ')}`);
    }
    console.log(`[EvalReview] ${changes.length} entr${changes.length === 1 ? 'y' : 'ies'} changed, ${unchanged} unchanged.`);
    return 0;
  }
  throw new Error('Usage: eval-review.js export|import');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`[EvalReview] ${error.message}`);
    process.exitCode = 1;
  }
}
