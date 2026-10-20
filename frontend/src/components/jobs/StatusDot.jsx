const DOT = {
  new: 'border border-accent bg-white',
  saved: 'bg-accent',
  applying: 'bg-accent/50 ring-2 ring-accent/30',
  applied: 'bg-slate-900',
  skipped: 'bg-slate-300',
  closed: 'bg-slate-300',
};

/**
 * Small status marker for a list row (hollow = new, solid accent = saved, soft accent ring = applying, dark = applied, light = skipped).
 * @param {{status: string}} props - Review status.
 */
export function StatusDot({ status }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT[status] ?? DOT.new}`} title={status} aria-label={`Status: ${status}`} />;
}
