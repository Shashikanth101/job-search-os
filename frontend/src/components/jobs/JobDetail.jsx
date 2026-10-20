import { ApplicationDetailsForm } from '../applications/ApplicationDetailsForm';
import { ErrorBanner } from '../ui/ErrorBanner';
import { ScoreBadge } from '../ui/ScoreBadge';
import { useApplicationDetails } from '../../hooks/useApplicationDetails';
import { scrapedLabel } from '../../utils/reviewFormat';
import { DescriptionView } from './DescriptionView';
import { JobActions } from './JobActions';
import { StatusDot } from './StatusDot';

/**
 * Detail pane for one job: header, actions, score and reason, application details (applying/applied), formatted description.
 * @param {object} props
 * @param {object|null} props.job - Row from GET /api/review/jobs/:id, or null while loading.
 * @param {boolean} props.loading
 * @param {string} props.error - Load error.
 * @param {boolean} props.busy - A status change is in flight.
 * @param {(status: string, openPosting?: boolean) => void} props.onStatus - New review status; openPosting is true for Apply.
 * @param {() => void} props.onReload - Reloads the detail after application details were saved.
 * @param {() => void} props.onClose - Closes the pane (shown on narrow screens where it is a drawer).
 */
export function JobDetail({ job, loading, error, busy, onStatus, onReload, onClose }) {
  const details = useApplicationDetails(onReload);
  if (!job) return <div className="p-4 text-sm text-slate-500">{loading ? 'Loading...' : error || 'Select a job (j / k).'}</div>;

  function saveDetails(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    details.saveDetails(job, { applied_at: form.get('applied_at') || null, follow_up_due: form.get('follow_up_due') || null, notes: form.get('notes') || null });
  }

  return (
    <article className="flex flex-col gap-4 p-4" aria-label="Job detail">
      <header>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">{job.title}</h2>
          <button type="button" className="btn btn-quiet lg:hidden" onClick={onClose}>Close</button>
        </div>
        <p className="mt-1 text-slate-600">{job.company} · {job.location ? <span title={job.location_raw ?? undefined}>{job.location}</span> : <span className="chip">unknown</span>}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <StatusDot status={job.review_status} /> {job.review_status}
          {job.is_manual ? <span className="chip chip-accent">manual</span> : null}
          <span>{scrapedLabel(job.scraped_days_ago)}</span>
          {job.experience ? <span className="chip" title="Required experience (from the description)">{job.experience}</span> : null}
          {job.apply_url ? <a className="font-semibold text-accent hover:underline" href={job.apply_url} target="_blank" rel="noopener noreferrer">Open posting</a> : null}
        </p>
      </header>
      <JobActions job={job} busy={busy} onApply={() => onStatus('applying', true)} onSave={() => onStatus('saved')} onSkip={() => onStatus('skipped')} onMarkApplied={() => onStatus('applied')} />
      <section aria-label="Ranking" className="flex items-start gap-3">
        <ScoreBadge score={job.score} />
        <div className="text-sm text-slate-700">
          {job.rank_status === 'ranked' ? job.reason : <span className="italic text-slate-500">Not ranked yet. Run <code className="font-mono text-xs">npm run rank:manual</code>.</span>}
          {job.archetype ? <p className="mt-1 text-xs text-slate-500">{job.archetype}</p> : null}
        </div>
      </section>
      {['applying', 'applied'].includes(job.review_status) ? <><ErrorBanner message={details.error} /><ApplicationDetailsForm job={job} isUpdating={details.saving} onSave={saveDetails} /></> : null}
      <section aria-label="Description">
        <h3 className="label">Description</h3>
        <div className="mt-1"><DescriptionView text={job.description} /></div>
      </section>
    </article>
  );
}
