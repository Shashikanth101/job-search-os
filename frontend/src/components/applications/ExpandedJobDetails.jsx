import { ApplicationDetailsForm } from './ApplicationDetailsForm';

/**
 * Expanded description and application form for one job.
 * @param {object} props
 * @param {object} props.job
 * @param {boolean} props.isUpdating
 * @param {(event: import('react').FormEvent<HTMLFormElement>) => void} props.onSave
 */
export function ExpandedJobDetails({ job, isUpdating, onSave }) {
  return (
    <div id={`job-details-${job.id}`} className="grid gap-5 lg:grid-cols-2">
      <section aria-labelledby={`job-description-${job.id}`}>
        <h4 id={`job-description-${job.id}`} className="mb-2 text-sm font-semibold text-slate-700">Job description</h4>
        <div className="h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
          {job.description || 'No job description provided.'}
        </div>
      </section>
      <div>
        <ApplicationDetailsForm job={job} isUpdating={isUpdating} onSave={onSave} />
      </div>
    </div>
  );
}
