import { formatDateInput } from '../../utils/formatDate';

/**
 * Form for a job's applied date, follow-up date, and notes.
 * @param {object} props
 * @param {object} props.job
 * @param {boolean} props.isUpdating
 * @param {(event: import('react').FormEvent<HTMLFormElement>) => void} props.onSave
 */
export function ApplicationDetailsForm({ job, isUpdating, onSave }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-sm font-semibold text-slate-700">Application details</h4>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={onSave}>
        <label className="text-sm font-semibold text-slate-700">Applied date
          <input className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal" type="datetime-local" name="applied_at" defaultValue={formatDateInput(job.application_applied_at)} />
        </label>
        <label className="text-sm font-semibold text-slate-700">Follow-up date
          <input className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal" type="datetime-local" name="follow_up_due" defaultValue={formatDateInput(job.application_follow_up_due)} />
        </label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Notes
          <textarea className="mt-2 min-h-20 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" name="notes" defaultValue={job.application_notes || ''} />
        </label>
        <button className="min-h-10 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 sm:col-span-2 sm:justify-self-start" type="submit" disabled={isUpdating}>
          {isUpdating ? 'Saving…' : 'Save details'}
        </button>
      </form>
    </section>
  );
}
