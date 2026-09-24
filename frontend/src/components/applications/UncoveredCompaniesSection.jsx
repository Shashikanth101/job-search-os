/**
 * Lists target companies that need manual career-page triage.
 * @param {{ companies: string[] }} props Companies without scraper coverage.
 */
export function UncoveredCompaniesSection({ companies }) {
  return (
    <section className="mt-10 border-t border-slate-200 pt-8" aria-labelledby="uncovered-companies-heading">
      <div className="mb-4">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">Other Companies</p>
        <h2 id="uncovered-companies-heading" className="mt-1 text-xl font-bold tracking-tight text-slate-950">Companies to check manually</h2>
      </div>
      {companies.length ? (
        <ul className="space-y-2">
          {companies.map((company) => (
            <li key={company}>
              <a
                className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-semibold text-indigo-700 underline decoration-indigo-200 underline-offset-4 transition hover:text-indigo-900 hover:decoration-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                href={`https://www.google.com/search?q=${encodeURIComponent(company)}+careers`}
                target="_blank"
                rel="noreferrer"
              >
                {company}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No uncovered companies are configured.</p>
      )}
    </section>
  );
}
