import { ScoreBadge } from '../ui/ScoreBadge';
import { ApplicationDetailsForm } from './ApplicationDetailsForm';

/**
 * A single ranked job: score, summary, apply link, status control, and details form.
 * @param {object} props
 * @param {object} props.job
 * @param {(string|number|null)} props.updatingApplicationId
 * @param {string[]} props.applicationStatuses
 * @param {(status: string) => void} props.onStatusChange
 * @param {(event: import('react').FormEvent<HTMLFormElement>) => void} props.onSaveDetails
 * @param {boolean} props.generatingResume
 * @param {string} props.resumeError
 * @param {() => Promise<boolean>} props.onGenerateResume
 */
export function JobCard({ job, updatingApplicationId, applicationStatuses, onStatusChange, onSaveDetails, generatingResume, resumeError, onGenerateResume }) {
  const isUpdating = updatingApplicationId === job.id;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <ScoreBadge score={job.relevance_score} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-bold text-slate-950">{job.title}</h3>
            {job.is_new && <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">New</span>}
          </div>
          <p className="mt-1 font-semibold text-slate-700">{job.company}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            <span>{job.location || 'Location not listed'}</span>
            <span>{job.job_type || 'Job type not listed'}</span>
          </div>
          <p className="mt-4 leading-7 text-slate-600">{job.relevance_reason || 'No relevance summary available.'}</p>

          <div className="mt-5 flex flex-wrap gap-3">
            <a
              className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${job.apply_url ? 'bg-indigo-600 hover:bg-indigo-700' : 'pointer-events-none bg-slate-300'}`}
              href={job.apply_url || undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!job.apply_url}
            >
              Apply
            </a>
            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">
              <span className="sr-only">Application status for {job.title}</span>
              <select
                className="bg-transparent outline-none"
                value={job.application_status || ''}
                onChange={(event) => onStatusChange(event.target.value)}
                disabled={isUpdating}
              >
                <option value="">Track application</option>
                {applicationStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <ApplicationDetailsForm job={job} isUpdating={isUpdating} onSave={onSaveDetails} />
            {job.resume_path ? (
              <a
                className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                href={`/api/jobs/${job.id}/resume`}
                target="_blank"
                rel="noreferrer"
              >
                View Resume
              </a>
            ) : (
              <div>
                <button
                  className="inline-flex min-h-10 items-center rounded-lg border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-wait disabled:opacity-60"
                  type="button"
                  onClick={onGenerateResume}
                  disabled={generatingResume}
                >
                  {generatingResume ? 'Generating…' : 'Save Resume'}
                </button>
                {resumeError && <p className="mt-2 text-sm text-red-700" role="alert">{resumeError}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
