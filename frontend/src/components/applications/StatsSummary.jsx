/**
 * Saved / Applied / Pending-follow-up counters.
 * @param {{ stats: {saved_applications: number, applied_applications: number, pending_follow_ups: number}|null }} props
 */
export function StatsSummary({ stats }) {
  if (!stats) return null;

  const items = [
    ['Saved', stats.saved_applications],
    ['Applied', stats.applied_applications],
    ['Pending follow-ups', stats.pending_follow_ups],
  ];

  return (
    <section className="mb-8 grid gap-3 sm:grid-cols-3" aria-label="Application statistics">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
        </div>
      ))}
    </section>
  );
}