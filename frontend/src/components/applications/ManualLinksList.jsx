/**
 * "Worth a manual check" grid of curated career page links.
 * @param {{ links: {company: string, url: string, notes?: string}[] }} props
 */
export function ManualLinksList({ links }) {
  return (
    <section className="mt-14 border-t border-slate-200 pt-10" aria-labelledby="manual-links-heading">
      <div className="mb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">Worth a manual check</p>
        <h2 id="manual-links-heading" className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Manual career links</h2>
      </div>
      {links.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <a
              key={`${link.company}-${link.url}`}
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              href={link.url}
              target="_blank"
              rel="noreferrer"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold text-slate-900">{link.company}</h3>
                <span className="text-indigo-600 transition group-hover:translate-x-0.5" aria-hidden="true">↗</span>
              </div>
              {link.notes && <p className="mt-2 text-sm leading-6 text-slate-500">{link.notes}</p>}
            </a>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">No manual career links are configured.</p>
      )}
    </section>
  );
}