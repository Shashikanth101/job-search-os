import { runRankCli } from './rank.js';

// Thin wrapper kept for `npm run rerank`: same guards and dry-run default as `npm run rank`.
// The old --all flag is replaced by an explicit versioned re-rank: npm run rank -- --rerank-version <N> --run
if (process.argv.includes('--all')) {
  console.error('[Rerank] --all was removed. Use: npm run rank -- --rerank-version <N> --run');
  process.exit(1);
}
runRankCli(process.argv.slice(2)).catch((error) => {
  console.error(`[Rerank] ${error.message}`);
  process.exitCode = 1;
});
