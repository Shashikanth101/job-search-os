import { FormField } from '../ui/FormField';
import { Button } from '../ui/Button';
import { ManualJobFields } from './ManualJobFields';

/**
 * Collapsible "add a lead" form for manually tracked applications.
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onToggle
 * @param {boolean} props.submitting
 * @param {(event: import('react').FormEvent<HTMLFormElement>) => void} props.onSubmit
 * @param {object|null} props.result - Saved job including its ranking result.
 * @param {string} props.error - Manual submission failure message.
 */
export function ManualApplicationForm({ open, onToggle, submitting, onSubmit, result, error }) {
  return (
    <section className="mb-8 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 shadow-sm sm:p-5" aria-labelledby="manual-application-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">Add a lead</p>
          <h2 id="manual-application-heading" className="mt-1 text-xl font-bold text-slate-950">Manual application</h2>
        </div>
        <Button variant="primary" onClick={onToggle} aria-expanded={open}>
          {open ? 'Close form' : 'Add manual application'}
        </Button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      <div role="status" aria-live="polite" aria-atomic="true">
        {result && (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            Saved — ranked {result.relevance_score ?? '—'}/10: {result.relevance_reason || 'No relevance summary available.'}
          </p>
        )}
      </div>
      {open && (
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <FormField label="Company" name="company" required />
          <FormField label="Job title" name="title" required />
          <FormField label="Job description" name="jobDescription" type="textarea" required labelClassName="sm:col-span-2" />
          <FormField label="Apply URL" name="applyUrl" type="url" required />
          <ManualJobFields />
          <div className="flex items-end">
            <Button variant="dark" type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Submit application'}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
