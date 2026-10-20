import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_FILTERS } from './utils/reviewQuery.js';
import { AppShell } from './components/layout/AppShell.jsx';
import { NotFoundPage } from './components/layout/NotFoundPage.jsx';
import { JobsView } from './components/jobs/JobsView.jsx';
import { OpsPage } from './components/ops/OpsPage.jsx';
import { OutreachPage } from './components/outreach/OutreachPage.jsx';
import { usePathname } from './hooks/usePathname.js';
import { usePersistentState } from './hooks/usePersistentState.js';
import { useReviewCounts } from './hooks/useReviewCounts.js';
import { PAGE_TITLES, resolveRoute } from './utils/routes.js';
import './index.css';

// Path-based routing without a router dependency; the server serves index.html for every non-/api path.
function Root() {
  const { pathname, search, navigate } = usePathname();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [groupBy, setGroupBy] = usePersistentState('jobs.groupBy', 'score', (value) => ['none', 'company', 'score'].includes(value));
  const { counts, error: countsError, refetchCounts } = useReviewCounts(filters);
  const resolved = resolveRoute(pathname);
  useEffect(() => { if (resolved.page === 'redirect') navigate(resolved.to, { replace: true }); }, [resolved.page, resolved.to, navigate]);
  useEffect(() => { document.title = `${resolved.route?.label ?? PAGE_TITLES[resolved.page]} · Job Search OS`; }, [resolved.page, resolved.route]);
  const pages = {
    jobs: <JobsView route={resolved.route} pathname={pathname} search={search} navigate={navigate} filters={filters} onFiltersChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} counts={counts} groupBy={groupBy} onGroupByChange={setGroupBy} onChanged={refetchCounts} />,
    outreach: <OutreachPage />,
    ops: <OpsPage />,
    redirect: null,
    notfound: <NotFoundPage pathname={pathname} />,
  };
  return (
    <AppShell pathname={pathname} navigate={navigate} counts={counts}>
      {countsError ? <p className="m-4 rounded-ui border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{countsError}</p> : null}
      {pages[resolved.page]}
    </AppShell>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><Root /></StrictMode>);
