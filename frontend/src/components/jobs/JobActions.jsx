/**
 * Detail-pane action buttons. Apply opens the posting and marks the job as applying; the others only change the review status.
 * @param {object} props
 * @param {{review_status: string, apply_url: string|null}} props.job
 * @param {boolean} props.busy - A status change for this job is in flight.
 * @param {() => void} props.onApply
 * @param {() => void} props.onSave
 * @param {() => void} props.onSkip
 * @param {() => void} props.onMarkApplied
 */
export function JobActions({ job, busy, onApply, onSave, onSkip, onMarkApplied }) {
  const done = ['applied', 'closed'].includes(job.review_status);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Job actions">
      <button type="button" className="btn btn-primary" disabled={busy || done || !job.apply_url} onClick={onApply}>Apply <kbd className="ml-1 text-xs opacity-70">a</kbd></button>
      <button type="button" className="btn btn-quiet" disabled={busy || done || job.review_status === 'saved'} onClick={onSave}>Save <kbd className="ml-1 text-xs opacity-60">s</kbd></button>
      <button type="button" className="btn btn-quiet" disabled={busy || done || job.review_status === 'skipped'} onClick={onSkip}>Skip <kbd className="ml-1 text-xs opacity-60">x</kbd></button>
      <button type="button" className="btn btn-quiet" disabled={busy || done} onClick={onMarkApplied}>Mark applied</button>
      <button type="button" className="btn btn-quiet" disabled title="Resume generation is not available here yet">Generate resume</button>
    </div>
  );
}
