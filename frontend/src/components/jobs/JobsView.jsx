import { useEffect, useRef, useState } from 'react';
import { useAddManualJob } from '../../hooks/useAddManualJob';
import { prefetchJobDetails, useReviewJob } from '../../hooks/useReviewJob';
import { useReviewActions } from '../../hooks/useReviewActions';
import { useReviewFacets } from '../../hooks/useReviewFacets';
import { useReviewJobs } from '../../hooks/useReviewJobs';
import { useReviewMeta } from '../../hooks/useReviewMeta';
import { useReviewShortcuts } from '../../hooks/useReviewShortcuts';
import { usePersistentState } from '../../hooks/usePersistentState';
import { filterParams } from '../../utils/reviewQuery';
import { Drawer } from '../ui/Drawer';
import { ErrorBanner } from '../ui/ErrorBanner';
import { JobDetail } from './JobDetail';
import { JobsFilterBar } from './JobsFilterBar';
import { JobsList } from './JobsList';
import { ManualJobForm } from './ManualJobForm';
import { PagerBar } from './PagerBar';

const ASIDE_BASE = 'lg:sticky lg:inset-auto lg:top-4 lg:z-auto lg:block lg:h-[calc(100vh-2rem)] lg:overflow-y-auto lg:rounded-ui lg:border lg:border-slate-200 lg:bg-white';

/**
 * Jobs view for every status bucket (and the manual filter): filters, one list (optionally grouped), and a detail pane that is
 * always open on wide screens (a drawer below the `lg` breakpoint). The first job is selected on load; the selection lives in the
 * URL (?job=ID) so refresh keeps it.
 * @param {object} props
 * @param {{id: string, label: string, status: string, origin?: string}} props.route - The sidebar route; `status` and `origin` filter the list.
 * @param {string} props.pathname - Current path.
 * @param {string} props.search - Current query string (holds ?job=ID).
 * @param {(to: string, options?: {replace?: boolean}) => void} props.navigate
 * @param {{minScore: number, archetypes: string[]|null, locationGroup: string, company: string, q: string}} props.filters - Shared with the sidebar counts (lifted to the root).
 * @param {(patch: object) => void} props.onFiltersChange
 * @param {Record<string, any>|null} props.counts - Sidebar counts; `counts.totals` are the unfiltered bucket sizes.
 * @param {'none'|'company'|'score'} props.groupBy - Remembered across tabs by the parent.
 * @param {(groupBy: string) => void} props.onGroupByChange
 * @param {() => void} props.onChanged - Called after any change that can alter the sidebar counts.
 */
export function JobsView({ route, pathname, search, navigate, filters, onFiltersChange, counts, groupBy, onGroupByChange, onChanged }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePersistentState('jobs.pageSize', 50, (value) => [25, 50, 100].includes(value));
  const [addOpen, setAddOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const justAdded = useRef(null);
  const searchRef = useRef(null);
  const { filters: options } = useReviewMeta();
  const archetypeOptions = useReviewFacets({ status: route.status, origin: route.origin, minScore: filters.minScore });
  const selectedId = Number(new URLSearchParams(search).get('job')) || null;
  const list = useReviewJobs({ ...filterParams(filters), status: route.status, origin: route.origin, groupBy, page, pageSize });
  const detail = useReviewJob(selectedId);
  const adder = useAddManualJob();
  const jobs = list.data.jobs;
  const bucketTotal = counts?.totals?.[route.countKey] ?? null;
  const index = jobs.findIndex((job) => job.id === selectedId);
  const select = (id) => navigate(id ? `${pathname}?job=${id}` : pathname, { replace: true });

  useEffect(() => { setPage(1); setDrawerOpen(false); }, [route.id, filters, groupBy, pageSize]);
  useEffect(() => { document.querySelector('[data-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }); }, [selectedId, jobs]);
  useEffect(() => {
    if (list.loading) return;
    if (!jobs.length) { if (selectedId) select(null); return; }
    if (index === -1 && justAdded.current !== selectedId) select(jobs[0].id);
  }, [list.loading, jobs, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { prefetchJobDetails([jobs[index]?.id ?? jobs[0]?.id, jobs[index + 1]?.id, jobs[index - 1]?.id, jobs[index + 2]?.id]); }, [jobs, index]);

  function applyUpdate(updated) {
    if (!route.status || updated.review_status === route.status) list.replaceJob(updated);
    else {
      list.removeJob(updated.id);
      if (updated.id === selectedId) select((jobs[index + 1] ?? jobs[index - 1])?.id ?? null);
    }
    detail.setJob((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
    if (updated.review_status === 'applied') detail.reload();
    onChanged();
  }
  const { setStatus, error: actionError, pendingIds } = useReviewActions(applyUpdate);

  function change(job, status, openPosting) {
    if (!job) return;
    if (openPosting && job.apply_url) window.open(job.apply_url, '_blank', 'noopener,noreferrer');
    setStatus(job.id, status);
  }
  const current = jobs[index] ?? (detail.job?.id === selectedId ? detail.job : null);
  useReviewShortcuts({
    onNext: () => select(jobs[Math.min(jobs.length - 1, index + 1)]?.id),
    onPrevious: () => select(jobs[Math.max(0, index - 1)]?.id),
    onApply: () => change(current, 'applying', true),
    onSave: () => change(current, 'saved'),
    onSkip: () => change(current, 'skipped'),
    onSearch: () => searchRef.current?.focus(),
    onClose: () => setDrawerOpen(false),
  });

  async function addJob(fields) {
    const saved = await adder.addJob(fields);
    if (saved) { setAddOpen(false); justAdded.current = saved.id; list.reload(); onChanged(); select(saved.id); }
    return Boolean(saved);
  }

  return (
    <div className="flex flex-col gap-3 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-900">{route.label} <span className="text-sm font-medium text-slate-500" aria-live="polite">{list.loading ? '' : `${list.data.total} ${list.data.total === 1 ? 'job' : 'jobs'}`}{!list.loading && bucketTotal != null && list.data.total < bucketTotal ? ` of ${bucketTotal} in this bucket` : ''}</span></h1>
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>Add job</button>
      </header>
      <JobsFilterBar values={filters} groupBy={groupBy} onChange={onFiltersChange}
        onGroupByChange={onGroupByChange} options={options} archetypeOptions={archetypeOptions} searchRef={searchRef} />
      <ErrorBanner message={list.error || actionError} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="panel overflow-hidden" aria-label="Jobs">
          {list.loading ? <p className="p-4 text-sm text-slate-500">Loading...</p>
            : jobs.length ? <JobsList jobs={jobs} groupBy={list.data.groupBy ?? groupBy} groupCounts={list.data.groupCounts} continued={Boolean(list.data.continued)} selectedId={selectedId} onSelect={(id) => { select(id); setDrawerOpen(true); }} />
              : <p className="p-6 text-center text-sm text-slate-500">No jobs here for these filters.</p>}
          <PagerBar page={list.data.page} pages={list.data.pages} pageSize={pageSize} total={list.data.total} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </section>
        <aside className={`${drawerOpen ? 'fixed inset-0 z-30 overflow-y-auto bg-white' : 'hidden'} ${ASIDE_BASE}`} aria-label="Detail">
          <JobDetail job={detail.job} loading={detail.loading} error={detail.error} busy={pendingIds.has(selectedId)}
            onStatus={(status, openPosting) => change(current, status, openPosting)} onReload={detail.reload} onClose={() => setDrawerOpen(false)} />
        </aside>
      </div>
      <Drawer open={addOpen} title="Add job" onClose={() => setAddOpen(false)}>
        <ManualJobForm onSubmit={addJob} saving={adder.saving} error={adder.error} />
      </Drawer>
    </div>
  );
}
