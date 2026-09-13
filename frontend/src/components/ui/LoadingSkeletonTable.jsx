/** Placeholder rows for the jobs table while its feed is loading. */
export function LoadingSkeletonTable() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Loading jobs" aria-busy="true">
      <div className="h-10 animate-pulse border-b border-slate-200 bg-slate-100" />
      <div className="grid gap-px bg-slate-200">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="grid h-12 animate-pulse grid-cols-[3rem_10rem_1fr_14rem_19rem] items-center gap-3 bg-white px-3">
            <span className="h-7 w-7 rounded-lg bg-slate-200" />
            <span className="h-4 rounded bg-slate-200" />
            <span className="h-4 rounded bg-slate-200" />
            <span className="h-4 rounded bg-slate-200" />
            <span className="h-7 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
