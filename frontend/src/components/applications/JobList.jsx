import { JobCard } from './JobCard';
import { LoadingSkeletonCards } from '../ui/LoadingSkeletonCards';

/**
 * Loading skeleton, empty state, or the ranked job cards.
 * @param {object} props
 * @param {object[]} props.jobs - Already-filtered/sorted jobs to display.
 * @param {boolean} props.loading
 * @param {(string|number|null)} props.updatingApplicationId
 * @param {string[]} props.applicationStatuses
 * @param {(job: object, status: string) => void} props.onStatusChange
 * @param {(event: import('react').FormEvent<HTMLFormElement>, job: object) => void} props.onSaveDetails
 */
export function JobList({ jobs, loading, updatingApplicationId, applicationStatuses, onStatusChange, onSaveDetails }) {
  if (loading) return <LoadingSkeletonCards />;

  return (
    <section aria-labelledby="ranked-jobs-heading">
      <h2 id="ranked-jobs-heading" className="sr-only">Ranked jobs</h2>
      {jobs.length ? (
        <div className="grid gap-4">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              updatingApplicationId={updatingApplicationId}
              applicationStatuses={applicationStatuses}
              onStatusChange={(status) => onStatusChange(job, status)}
              onSaveDetails={(event) => onSaveDetails(event, job)}
            />
          ))}
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