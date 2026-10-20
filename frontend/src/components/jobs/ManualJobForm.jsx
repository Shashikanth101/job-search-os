import { FormField } from '../ui/FormField';

/**
 * Form for saving a job by URL. Nothing is fetched and nothing is ranked on save.
 * @param {object} props
 * @param {(fields: {url: string, company: string, title: string, location: string, description: string}) => Promise<boolean>} props.onSubmit - Resolves true when saved (the form then resets).
 * @param {boolean} props.saving - A save is in flight.
 * @param {string} [props.error] - Save error to show.
 */
export function ManualJobForm({ onSubmit, saving, error }) {
  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const saved = await onSubmit(Object.fromEntries(['url', 'company', 'title', 'location', 'description'].map((name) => [name, String(data.get(name) ?? '')])));
    if (saved) form.reset();
  }
  return (
    <form onSubmit={handleSubmit} className="grid gap-3" aria-label="Add a manual job">
      <FormField label="Posting URL" name="url" type="url" required placeholder="https://company.com/careers/role" />
      <FormField label="Company" name="company" />
      <FormField label="Title" name="title" />
      <FormField label="Location" name="location" placeholder="e.g. Bengaluru" />
      <FormField label="Pasted description" name="description" type="textarea" />
      {error ? <p className="text-sm font-medium text-rose-700" role="alert">{error}</p> : null}
      <div className="flex flex-col gap-2">
        <button type="submit" disabled={saving} className="btn btn-primary self-start">{saving ? 'Saving...' : 'Save job'}</button>
        <p className="text-xs text-slate-500">Saved as-is: the posting is not fetched and the job is not ranked. Run <code className="font-mono">npm run rank:manual</code> to rank manual jobs.</p>
      </div>
    </form>
  );
}
