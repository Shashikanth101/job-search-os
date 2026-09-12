/**
 * Shared dashboard error message. Renders nothing when there's no error.
 * @param {{ message: string }} props
 */
export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800" role="alert">
      {message}
    </div>
  );
}