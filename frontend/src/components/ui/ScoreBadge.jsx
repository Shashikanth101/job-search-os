const SCORE_STYLES = {
  high: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
  medium: 'bg-amber-100 text-amber-800 ring-amber-600/20',
  low: 'bg-rose-100 text-rose-800 ring-rose-600/20',
};

function getScoreStyle(score) {
  if (score >= 8) return SCORE_STYLES.high;
  if (score >= 5) return SCORE_STYLES.medium;
  return SCORE_STYLES.low;
}

/**
 * Relevance score pill shown on a job card.
 * @param {{ score: number|string|null|undefined }} props
 */
export function ScoreBadge({ score }) {
  return (
    <div className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl ring-1 ring-inset ${getScoreStyle(Number(score))}`}>
      <span className="text-2xl font-bold leading-none">{score ?? '—'}</span>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-wider">score</span>
    </div>
  );
}