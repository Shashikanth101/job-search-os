import { JobRow } from './JobRow';
import { LoadingSkeletonTable } from '../ui/LoadingSkeletonTable';

/**
 * Loading state, empty state, or the compact jobs table.
 * @param {object} props
 * @param {object[]} props.jobs - Already-filtered and sorted jobs.
 * @param {boolean} props.loading
 * @param {(string|number|null)} props.updatingApplicationId
 * @param {Set<string|number>} props.updatingJobIds
 * @param {Record<string, string>} props.applicationErrorsByJobId
 * @param {Set<string|number>} props.generatingResumeJobIds
 * @param {Record<string, string>} props.resumeErrors
 * @param {string[]} props.jobStatuses
 * @param {(job: object, status: string) => void} props.onStatusChange
 * @param {(event: import('react').FormEvent<HTMLFormElement>, job: object) => void} props.onSaveDetails
 * @param {(job: object) => Promise<boolean>} props.onGenerateResume
 */
export function JobsTable({ jobs, loading, updatingApplicationId, updatingJobIds, applicationErrorsByJobId, generatingResumeJobIds, resumeErrors, jobStatuses, onStatusChange, onSaveDetails, onGenerateResume }) {
  if (loading) return <LoadingSkeletonTable />;

  return (
    <section aria-labelledby="ranked-jobs-heading">
      <h2 id="ranked-jobs-heading" className="sr-only">Ranked jobs</h2>
      {jobs.length ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead className="bg-slate-100">
              <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-600">
                <th scope="col" className="px-3 py-3">Score</th>
                <th scope="col" className="px-3 py-3">Company</th>
                <th scope="col" className="px-3 py-3">Title</th>
                <th scope="col" className="px-3 py-3">Location · Job Type</th>
                <th scope="col" className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  isUpdating={updatingJobIds.has(job.id)}
                  statusError={applicationErrorsByJobId[job.id] || ''}
                  generatingResume={generatingResumeJobIds.has(job.id)}
                  resumeError={resumeErrors[job.id] || ''}
                  jobStatuses={jobStatuses}
                  onStatusChange={(status) => onStatusChange(job, status)}
                  onSaveDetails={(event) => onSaveDetails(event, job)}
                  onGenerateResume={() => onGenerateResume(job)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <h3 className="text-lg font-bold text-slate-900">No jobs match these filters</h3>
          <p className="mt-2 text-sm text-slate-500">Try lowering the score or including jobs you have already seen.</p>
        </div>
      )}
    </section>
  );
}
