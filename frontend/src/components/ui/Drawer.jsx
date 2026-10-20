/**
 * Right-side drawer with a backdrop (Escape is handled by the page's key handler).
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title
 * @param {() => void} props.onClose
 * @param {import('react').ReactNode} props.children
 */
export function Drawer({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 bg-slate-900/30" aria-label="Close" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}
