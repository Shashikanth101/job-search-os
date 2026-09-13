import { useState } from 'react';
import { ExpandedJobDetails } from './ExpandedJobDetails';
import { ScoreBadge } from '../ui/ScoreBadge';

/**
 * One compact job row and its inline expanded details.
 * @param {object} props
 * @param {object} props.job
 * @param {boolean} props.isUpdating
 * @param {string} props.statusError
 * @param {boolean} props.generatingResume
 * @param {string} props.resumeError
 * @param {string[]} props.jobStatuses
 * @param {(status: string) => void} props.onStatusChange
 * @param {(event: import('react').FormEvent<HTMLFormElement>) => void} props.onSaveDetails
 * @param {() => Promise<boolean>} props.onGenerateResume
 */
export function JobRow({ job, isUpdating, statusError, generatingResume, resumeError, jobStatuses, onStatusChange, onSaveDetails, onGenerateResume }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="border-b border-slate-200 bg-white align-middle hover:bg-slate-50">
        <td className="whitespace-nowrap px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${job.title}`}
              aria-expanded={expanded}
              aria-controls={`job-details-${job.id}`}
              onClick={() => setExpanded((current) => !current)}
            >
              <span aria-hidden="true" className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
            </button>
            <ScoreBadge score={job.relevance_score} compact />
          </div>
        </td>
        <td className="px-3 py-2 text-sm font-semibold text-slate-700">{job.company}</td>
        <th scope="row" className="min-w-64 px-3 py-2 text-left text-sm font-semibold text-slate-900">
          <span>{job.title}</span>
          {job.is_new && <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">New</span>}
        </th>
        <td className="whitespace-nowrap px-3 py-2 text-sm text-slate-600">
          {job.location || 'Location not listed'} <span className="text-slate-400">·</span> {job.job_type || 'Job type not listed'}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <a
              className={`inline-flex min-h-8 items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${job.apply_url ? 'bg-indigo-600 hover:bg-indigo-700' : 'pointer-events-none bg-slate-300'}`}
              href={job.apply_url || undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!job.apply_url}
            >Apply</a>
            <label className="sr-only" htmlFor={`status-${job.id}`}>Job status for {job.title}</label>
            <select
              id={`status-${job.id}`}
              className="h-8 max-w-36 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 disabled:opacity-60"
              value={job.status || 'not_applied'}
              onChange={(event) => onStatusChange(event.target.value)}
              disabled={isUpdating}
            >
              {jobStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            {job.resume_path ? (
              <a className="inline-flex min-h-8 items-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600" href={`/api/jobs/${job.id}/resume`} target="_blank" rel="noreferrer">View Resume</a>
            ) : (
              <button
                className="inline-flex min-h-8 items-center rounded-md border border-indigo-300 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:cursor-wait disabled:opacity-60"
                type="button"
                onClick={onGenerateResume}
                disabled={generatingResume}
                aria-busy={generatingResume}
              >{generatingResume ? 'Generating…' : 'Save Resume'}</button>
            )}
          </div>
          {statusError && <p className="mt-1 text-xs text-red-700" role="alert">{statusError}</p>}
          {resumeError && <p className="mt-1 text-xs text-red-700" role="alert">{resumeError}</p>}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-slate-200 bg-slate-50">
          <td colSpan={5} className="px-5 py-5">
            <ExpandedJobDetails job={job} isUpdating={isUpdating} onSave={onSaveDetails} />
          </td>
        </tr>
      )}
    </>
  );
}
