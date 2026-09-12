/**
 * Page title, live match count, and the "Follow-ups due" shortcut.
 * @param {object} props
 * @param {number} props.matchCount
 * @param {boolean} props.loading
 * @param {string} props.error
 * @param {number} props.followUpsDue
 * @param {() => void} props.onScrollToReminders
 */
export function DashboardHeader({ matchCount, loading, error, followUpsDue, onScrollToReminders }) {
  return (
    <header className="mb-8">
      <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">Job Search OS</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Your ranked job feed</h1>
          <p className="mt-2 text-slate-600">Focus on the strongest matches and keep your search moving.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!loading && !error && (
            <p className="text-sm font-medium text-slate-500" aria-live="polite">
              {matchCount} {matchCount === 1 ? 'match' : 'matches'}
            </p>
          )}
          <button
            type="button"
            onClick={onScrollToReminders}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 text-sm font-bold text-rose-700 transition hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
          >
            Follow-ups due <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-600 px-1.5 text-xs text-white">{followUpsDue}</span>
          </button>
        </div>
      </div>
    </header>
  );
}