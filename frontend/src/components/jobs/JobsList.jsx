import { useState } from 'react';
import { JobRow } from './JobRow';

const keyOf = (job, groupBy) => (groupBy === 'company' ? job.company : String(job.score ?? 'unranked'));
const labelOf = (key, groupBy) => (groupBy === 'company' ? key : key === 'unranked' ? 'Not ranked yet' : `Score ${key}`);

/** Split the page into runs of consecutive rows with the same group key (the server already orders rows by group). */
function segments(jobs, groupBy) {
  if (groupBy === 'none') return [{ key: 'all', jobs }];
  const runs = [];
  for (const job of jobs) {
    const key = keyOf(job, groupBy);
    if (runs[runs.length - 1]?.key === key) runs[runs.length - 1].jobs.push(job); else runs.push({ key, jobs: [job] });
  }
  return runs;
}

/**
 * The page of jobs. When grouped, a header is shown whenever the group changes, with the group's full size (not the page slice) and
 * "(continued)" when the first group began on the previous page. Groups are collapsible.
 * @param {object} props
 * @param {object[]} props.jobs - Rows of the current page, in server order.
 * @param {'none'|'company'|'score'} props.groupBy
 * @param {Record<string, number>|null} props.groupCounts - Full group sizes by group key (from the server).
 * @param {boolean} props.continued - The first group started on the previous page.
 * @param {number|null} props.selectedId
 * @param {(id: number) => void} props.onSelect
 */
export function JobsList({ jobs, groupBy, groupCounts, continued, selectedId, onSelect }) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggle = (id) => setCollapsed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return (
    <div>
      {segments(jobs, groupBy).map((run, index) => {
        const id = `${groupBy}:${run.key}`;
        const closed = groupBy !== 'none' && collapsed.has(id);
        return (
          <section key={`${id}:${index}`} className={index > 0 ? 'mt-5' : ''} aria-label={groupBy === 'none' ? 'Jobs' : labelOf(run.key, groupBy)}>
            {groupBy !== 'none' && (
              <h3 className="m-0">
                <button type="button" aria-expanded={!closed} onClick={() => toggle(id)}
                  className="flex w-full items-center justify-between gap-3 border-y border-slate-300 bg-slate-100 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-700 hover:bg-slate-200">
                  <span><span aria-hidden="true">{closed ? '▸' : '▾'}</span> {labelOf(run.key, groupBy)}{index === 0 && continued ? <span className="ml-1 font-medium normal-case text-slate-500">(continued)</span> : null}</span>
                  <span className="chip" title="Jobs in this group (all pages)">{groupCounts?.[run.key] ?? run.jobs.length}</span>
                </button>
              </h3>
            )}
            {closed ? null : <ul>{run.jobs.map((job) => <JobRow key={job.id} job={job} selected={job.id === selectedId} onSelect={() => onSelect(job.id)} />)}</ul>}
          </section>
        );
      })}
    </div>
  );
}
