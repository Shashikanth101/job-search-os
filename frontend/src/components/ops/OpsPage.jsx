import { useCompanyCounts } from '../../hooks/useCompanyCounts';
import { useFollowUps } from '../../hooks/useFollowUps';
import { useRefreshStatus } from '../../hooks/useRefreshStatus';
import { useStats } from '../../hooks/useStats';
import { refreshLabel } from '../../utils/reviewFormat';
import { RemindersSection } from '../applications/RemindersSection';
import { StatsSummary } from '../applications/StatsSummary';
import { ErrorBanner } from '../ui/ErrorBanner';

const COMMANDS = [
  ['npm run scrape', 'Refresh: fetch every source, pre-filter, then rank pending jobs under the budget caps.'],
  ['npm run scrape -- --no-rank', 'Fetch and pre-filter only (no LLM).'],
  ['npm run rank', 'Dry run of ranking pending jobs (add -- --run to rank).'],
  ['npm run rank:manual', 'Dry run for never-ranked manual jobs (add -- --run to rank).'],
];

/** Ops page (/ops): data freshness and refresh commands, plus the application stats and follow-up reminders. The server never scrapes or ranks on its own. */
export function OpsPage() {
  const { refresh, error } = useRefreshStatus();
  const { stats, error: statsError, refetchStats } = useStats();
  const followUps = useFollowUps(refetchStats);
  const { companies } = useCompanyCounts();
  return (
    <main className="mx-auto max-w-5xl p-4 lg:p-6">
      <h1 className="mb-4 text-lg font-bold text-slate-900">Ops</h1>
      <ErrorBanner message={error || statsError || followUps.error} />
      <section aria-labelledby="refresh-heading" className="panel p-4">
        <h2 id="refresh-heading" className="text-base font-bold text-slate-900">Data freshness</h2>
        <p className="mt-2 text-sm text-slate-700" data-testid="refresh-line">
          {refreshLabel(refresh)}{refresh?.trigger ? ` (${refresh.trigger})` : ''}. Run <code className="rounded-ui bg-slate-100 px-1.5 py-0.5 font-mono text-xs">npm run scrape</code> to refresh.
        </p>
      </section>
      <section aria-labelledby="companies-heading" className="panel mt-4 p-4">
        <h2 id="companies-heading" className="text-base font-bold text-slate-900">Companies</h2>
        <p className="mt-2 text-sm text-slate-700" data-testid="company-counts">
          {companies ? <><strong>{companies.withRankedJobs}</strong> with at least one ranked job, <strong>{companies.total}</strong> in the database overall.</> : 'Loading...'}
        </p>
      </section>
      <section aria-labelledby="commands-heading" className="panel mt-4 p-4">
        <h2 id="commands-heading" className="text-base font-bold text-slate-900">Commands</h2>
        <dl className="mt-3 grid gap-3 text-sm">
          {COMMANDS.map(([command, description]) => (
            <div key={command}>
              <dt><code className="rounded-ui bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{command}</code></dt>
              <dd className="mt-1 text-slate-600">{description}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="mt-6"><StatsSummary stats={stats} /></div>
      <RemindersSection followUps={stats?.followUps} followUpsDue={stats?.followUpsDue ?? 0} updatingApplicationId={followUps.updatingApplicationId} onMarkFollowedUp={followUps.markFollowedUp} />
    </main>
  );
}
