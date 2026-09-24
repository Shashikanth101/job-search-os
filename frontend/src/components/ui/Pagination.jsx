/**
 * Accessible page controls shared by paginated lists and tables.
 * @param {{page: number, pageCount: number, onPageChange: (page: number) => void, label: string}} props
 */
export function Pagination({ page, pageCount, onPageChange, label }) {
  if (pageCount <= 1) return null;
  const buttonClass = 'min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <nav aria-label={`${label} pagination`} className="mt-3 flex flex-wrap items-center justify-end gap-3">
      <button type="button" className={buttonClass} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
      <span className="text-sm text-slate-600" aria-live="polite">Page {page} of {pageCount}</span>
      <button type="button" className={buttonClass} disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next</button>
    </nav>
  );
}
