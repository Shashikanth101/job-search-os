const PAGE_SIZES = [25, 50, 100];

/**
 * Page controls under the list (shown in grouped and ungrouped views): previous / next, "Page N of M", and a page-size select.
 * @param {object} props
 * @param {number} props.page - Current page (1-based).
 * @param {number} props.pages - Page count.
 * @param {number} props.pageSize - Rows per page.
 * @param {number} props.total - Rows matching the filters.
 * @param {(page: number) => void} props.onPageChange
 * @param {(size: number) => void} props.onPageSizeChange
 */
export function PagerBar({ page, pages, pageSize, total, onPageChange, onPageSizeChange }) {
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
      <label className="flex items-center gap-2">
        <span>Rows per page</span>
        <select className="field w-20" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <span className="text-xs text-slate-500">{total} {total === 1 ? 'row' : 'rows'}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-quiet" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
        <span aria-live="polite">Page {page} of {pages}</span>
        <button type="button" className="btn btn-quiet" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>Next</button>
      </div>
    </nav>
  );
}
