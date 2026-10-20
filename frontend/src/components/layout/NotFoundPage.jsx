/**
 * Shown for unknown client-side paths (the server falls back to index.html for every non-API path).
 * @param {{pathname: string}} props
 */
export function NotFoundPage({ pathname }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-950">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">There is no page at <code className="font-mono">{pathname}</code>. Use the navigation above.</p>
    </main>
  );
}
