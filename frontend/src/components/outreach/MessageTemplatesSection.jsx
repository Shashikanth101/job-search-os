/**
 * Copyable outreach message templates.
 * @param {object} props
 * @param {Record<string, string>} props.templates
 * @param {string} props.copiedKey
 * @param {(key: string, text: string) => void} props.onCopy
 */
export function MessageTemplatesSection({ templates, copiedKey, onCopy }) {
  return (
    <div className="mt-10 border-t border-slate-200 pt-8" aria-labelledby="message-templates-heading">
      <div className="mb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">Ready to send</p>
        <h2 id="message-templates-heading" className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Message templates</h2>
      </div>
      <div className="grid gap-4">
        {Object.entries(templates).map(([key, text]) => (
          <article key={key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <h3 className="font-bold capitalize text-slate-950">{key.replace(/([A-Z])/g, ' $1')}</h3>
              <button
                type="button"
                onClick={() => onCopy(key, text)}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                {copiedKey === key ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">{text}</p>
          </article>
        ))}
      </div>
    </div>
  );
}