import { ScoreBadge } from '../ui/ScoreBadge';
import { daysAgoLabel } from '../../utils/reviewFormat';
import { StatusDot } from './StatusDot';

/**
 * One job as a single line: status dot, title, company · location, archetype chip, score, age. No action buttons.
 * @param {object} props
 * @param {object} props.job - Row from /api/review/jobs.
 * @param {boolean} props.selected - Row shown in the detail pane.
 * @param {() => void} props.onSelect
 */
export function JobRow({ job, selected, onSelect }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        data-selected={selected}
        aria-current={selected ? 'true' : undefined}
        className={`flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-accent ${selected ? 'bg-accent-soft' : ''} ${job.review_status === 'skipped' ? 'text-slate-400' : 'text-slate-900'}`}
      >
        <StatusDot status={job.review_status} />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{job.title}</span>
          <span className="text-slate-500"> · {job.company} · </span>
          {job.location ? <span className="text-slate-500">{job.location}</span> : <span className="chip">unknown</span>}
        </span>
        {job.is_manual ? <span className="chip chip-accent">manual</span> : null}
        {job.experience ? <span className="chip hidden whitespace-nowrap sm:inline-flex" title="Required experience">{job.experience}</span> : null}
        {job.archetype ? <span className="chip hidden sm:inline-flex">{job.archetype}</span> : null}
        <ScoreBadge score={job.score} />
        <span className="hidden w-20 shrink-0 text-right text-xs text-slate-500 sm:block">{daysAgoLabel(job.scraped_days_ago)}</span>
      </button>
    </li>
  );
}
