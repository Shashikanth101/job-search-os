/**
 * Score pill (neutral palette plus the accent: strong = accent, medium = accent tint, low = neutral).
 * @param {{ score: number|string|null|undefined }} props - A null score (not ranked yet) renders a dash.
 */
export function ScoreBadge({ score }) {
  const value = score == null || score === '' ? null : Number(score);
  const tone = value == null ? 'bg-slate-100 text-slate-400' : value >= 8 ? 'bg-accent text-white' : value >= 6 ? 'bg-accent-soft text-accent-strong' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-ui px-1.5 text-xs font-bold ${tone}`} title={value == null ? 'Not ranked yet' : `Score ${value}`}>{value ?? '–'}</span>;
}
