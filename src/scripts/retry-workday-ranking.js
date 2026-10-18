import { runRankCli } from './rank.js';

// Thin wrapper: rank/retry only Workday jobs through the shared guarded pipeline (dry run unless --run).
runRankCli(process.argv.slice(2), { sourcePrefix: 'workday-' }).catch((error) => {
  console.error(`[WorkdayRetry] ${error.message}`);
  process.exitCode = 1;
});
