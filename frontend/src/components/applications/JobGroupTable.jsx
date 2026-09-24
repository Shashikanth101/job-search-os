import { useId, useState } from 'react';
import { JobsTable } from './JobsTable';
import { Pagination } from '../ui/Pagination';

/**
 * One group with full-group stats and independently paginated rows.
 * @param {{jobs: object[], label: string, stats: {applied: number, pending: number, closed: number}, pageSize: number, tableProps: object}} props
 */
export function JobGroupTable({ jobs, label, stats, pageSize, tableProps }) {
  const headingId = useId();
  const [requestedPage, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(jobs.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  // Clamp the stored page when filtering removes the last page; it must not
  // jump back to an old page if more jobs subsequently arrive.
  if (requestedPage !== page) setPage(page);
  const visibleJobs = jobs.slice((page - 1) * pageSize, page * pageSize);
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <h2 id={headingId} className="mr-2 text-lg font-bold text-slate-900">{label}</h2>
        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">{stats.applied} applied</span>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{stats.pending} pending</span>
        {stats.closed > 0 && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">{stats.closed} closed</span>}
      </header>
      <JobsTable {...tableProps} jobs={visibleJobs} headingId={`${headingId}-table`} headingLabel={`${label} jobs`} />
      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} label={label} />
    </section>
  );
}
