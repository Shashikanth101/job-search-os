/**
 * LinkedIn outreach targets — recruiter and hiring manager search links per company.
 * @param {{ entries: {company: string, recruiterUrl: string, hiringManagerUrl: string}[] }} props
 */
export function OutreachSection({ entries }) {
  return (
    <section aria-labelledby="outreach-heading">
      <div className="mb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">Build relationships</p>
        <h2 id="outreach-heading" className="mt-1 text-2xl font-bold tracking-tight text-slate-950">LinkedIn outreach</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <article key={entry.company} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">{entry.company}</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                className="inline-flex min-h-10 items-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                href={entry.recruiterUrl}
                target="_blank"
                rel="noreferrer"
              >
                Find Recruiter
              </a>
              <a
                className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                href={entry.hiringManagerUrl}
                target="_blank"
                rel="noreferrer"
              >
                Find Hiring Manager
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}