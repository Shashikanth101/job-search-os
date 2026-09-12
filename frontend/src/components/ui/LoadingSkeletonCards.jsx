/**
 * Placeholder skeleton cards shown while the job feed is loading.
 */
export function LoadingSkeletonCards() {
  return (
    <div className="grid gap-4" aria-label="Loading jobs" aria-busy="true">
      {[1, 2, 3].map((item) => (
        <div key={item} className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      ))}
    </div>
  );
}