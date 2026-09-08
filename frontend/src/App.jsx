import { useEffect, useMemo, useState } from 'react';

const SCORE_STYLES = {
  high: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
  medium: 'bg-amber-100 text-amber-800 ring-amber-600/20',
  low: 'bg-rose-100 text-rose-800 ring-rose-600/20',
};
const APPLICATION_STATUSES = ['saved', 'applied', 'interviewing', 'rejected', 'offer'];

function getScoreStyle(score) {
  if (score >= 8) return SCORE_STYLES.high;
  if (score >= 5) return SCORE_STYLES.medium;
  return SCORE_STYLES.low;
}

function formatDateInput(value) {
  return value ? String(value).replace(' ', 'T').slice(0, 16) : '';
}

/**
 * Renders the ranked jobs dashboard and its manual career links.
 * @returns {import('react').JSX.Element} Dashboard UI.
 */
export function App() {
  const [jobs, setJobs] = useState([]);
  const [manualLinks, setManualLinks] = useState([]);
  const [stats, setStats] = useState(null);
  const [company, setCompany] = useState('All');
  const [applicationStatus, setApplicationStatus] = useState('All');
  const [minScore, setMinScore] = useState(5);
  const [newOnly, setNewOnly] = useState(false);
  const [indiaOnly, setIndiaOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingApplicationId, setUpdatingApplicationId] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      try {
        setLoading(true);
        setError('');

        const [jobsResponse, linksResponse, statsResponse] = await Promise.all([
          fetch(`/api/jobs?minScore=5${indiaOnly ? '&location=india' : ''}`, { signal: controller.signal }),
          fetch('/api/manual-links', { signal: controller.signal }),
          fetch('/api/stats', { signal: controller.signal }),
        ]);

        if (!jobsResponse.ok || !linksResponse.ok || !statsResponse.ok) {
          throw new Error('The dashboard data could not be loaded.');
        }

        const [jobsData, linksData, statsData] = await Promise.all([
          jobsResponse.json(),
          linksResponse.json(),
          statsResponse.json(),
        ]);

        setJobs(jobsData);
        setManualLinks(linksData);
        setStats(statsData);
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'Something went wrong while loading the dashboard.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadDashboard();
    return () => controller.abort();
  }, [indiaOnly]);

  const companies = useMemo(
    () => [...new Set(jobs.map((job) => job.company).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [jobs],
  );

  const visibleJobs = useMemo(
    () => jobs
      .filter((job) => company === 'All' || job.company === company)
      .filter((job) => Number(job.relevance_score) >= minScore)
      .filter((job) => !newOnly || job.is_new)
      .filter((job) => applicationStatus === 'All' || (job.application_status || 'untracked') === applicationStatus)
      .sort((a, b) => Number(b.relevance_score) - Number(a.relevance_score)),
    [applicationStatus, company, jobs, minScore, newOnly],
  );

  async function saveApplication(job, changes) {
    const method = job.application_id ? 'PATCH' : 'POST';
    const endpoint = job.application_id
      ? `/api/applications/${job.application_id}`
      : `/api/jobs/${job.id}/application`;
    setUpdatingApplicationId(job.id);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(changes),
      });
      const application = await response.json();
      if (!response.ok) throw new Error(application.error || 'Could not update application details.');
      setJobs((currentJobs) => currentJobs.map((currentJob) => currentJob.id === job.id ? {
        ...currentJob,
        application_id: application.id,
        application_status: application.status,
        application_applied_at: application.applied_at,
        application_resume_path: application.resume_path,
        application_follow_up_due: application.follow_up_due,
        application_notes: application.notes,
      } : currentJob));
      const statsResponse = await fetch('/api/stats');
      if (statsResponse.ok) setStats(await statsResponse.json());
      return application;
    } catch (requestError) {
      setError(requestError.message || 'Could not update application details.');
      return null;
    } finally {
      setUpdatingApplicationId(null);
    }
  }

  async function changeApplicationStatus(job, status) {
    await saveApplication(job, { status });
  }

  async function saveApplicationDetails(event, job) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await saveApplication(job, {
      applied_at: form.get('applied_at') || null,
      resume_path: form.get('resume_path') || null,
      follow_up_due: form.get('follow_up_due') || null,
      notes: form.get('notes') || null,
    });
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">Job Search OS</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Your ranked job feed</h1>
              <p className="mt-2 text-slate-600">Focus on the strongest matches and keep your search moving.</p>
            </div>
            {!loading && !error && (
              <p className="text-sm font-medium text-slate-500" aria-live="polite">
                {visibleJobs.length} {visibleJobs.length === 1 ? 'match' : 'matches'}
              </p>
            )}
          </div>
        </header>

        {stats && (
          <section className="mb-8 grid gap-3 sm:grid-cols-3" aria-label="Application statistics">
            {[
              ['Saved', stats.saved_applications],
              ['Applied', stats.applied_applications],
              ['Pending follow-ups', stats.pending_follow_ups],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
              </div>
            ))}
          </section>
        )}

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Job filters">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_auto_auto] lg:items-end">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Company</span>
              <select
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
              >
                <option>All</option>
                {companies.map((companyName) => <option key={companyName}>{companyName}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Application status</span>
              <select
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                value={applicationStatus}
                onChange={(event) => setApplicationStatus(event.target.value)}
              >
                <option>All</option>
                <option>untracked</option>
                {APPLICATION_STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
                Minimum score
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-indigo-700">{minScore}</span>
              </span>
              <input
                className="h-11 w-full cursor-pointer accent-indigo-600"
                type="range"
                min="1"
                max="10"
                value={minScore}
                onChange={(event) => setMinScore(Number(event.target.value))}
              />
            </label>

            <label className="flex h-11 cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-300 px-3">
              <span className="text-sm font-semibold text-slate-700">New only</span>
              <input
                className="peer sr-only"
                type="checkbox"
                checked={newOnly}
                onChange={(event) => setNewOnly(event.target.checked)}
              />
              <span className="relative h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-indigo-600 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-600 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition after:content-[''] peer-checked:after:translate-x-5" />
            </label>

            <div role="group" aria-label="Location">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Location</span>
              <div className="inline-flex rounded-full bg-slate-100 p-1">
                {[{ label: 'India Only', value: true }, { label: 'All Locations', value: false }].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={indiaOnly === option.value}
                    onClick={() => setIndiaOnly(option.value)}
                    className={`min-h-11 rounded-full px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${indiaOnly === option.value ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4" aria-label="Loading jobs" aria-busy="true">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white" />
            ))}
          </div>
        ) : (
          <section aria-labelledby="ranked-jobs-heading">
            <h2 id="ranked-jobs-heading" className="sr-only">Ranked jobs</h2>
            {visibleJobs.length ? (
              <div className="grid gap-4">
                {visibleJobs.map((job) => (
                  <article key={job.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md sm:p-6">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                      <div className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl ring-1 ring-inset ${getScoreStyle(Number(job.relevance_score))}`}>
                        <span className="text-2xl font-bold leading-none">{job.relevance_score ?? '—'}</span>
                        <span className="mt-1 text-[10px] font-bold uppercase tracking-wider">score</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-bold text-slate-950">{job.title}</h3>
                          {job.is_new && <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">New</span>}
                        </div>
                        <p className="mt-1 font-semibold text-slate-700">{job.company}</p>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                          <span>{job.location || 'Location not listed'}</span>
                          <span>{job.job_type || 'Job type not listed'}</span>
                        </div>
                        <p className="mt-4 leading-7 text-slate-600">{job.relevance_reason || 'No relevance summary available.'}</p>

                        <div className="mt-5 flex flex-wrap gap-3">
                          <a
                            className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${job.apply_url ? 'bg-indigo-600 hover:bg-indigo-700' : 'pointer-events-none bg-slate-300'}`}
                            href={job.apply_url || undefined}
                            target="_blank"
                            rel="noreferrer"
                            aria-disabled={!job.apply_url}
                          >
                            Apply
                          </a>
                          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">
                            <span className="sr-only">Application status for {job.title}</span>
                            <select
                              className="bg-transparent outline-none"
                              value={job.application_status || ''}
                              onChange={(event) => changeApplicationStatus(job, event.target.value)}
                              disabled={updatingApplicationId === job.id}
                            >
                              <option value="">Track application</option>
                              {APPLICATION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                            </select>
                          </label>
                          <details className="basis-full rounded-lg border border-slate-200 bg-slate-50 p-4">
                            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Application details</summary>
                            <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(event) => saveApplicationDetails(event, job)}>
                              <label className="text-sm font-semibold text-slate-700">Applied date
                                <input className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal" type="datetime-local" name="applied_at" defaultValue={formatDateInput(job.application_applied_at)} />
                              </label>
                              <label className="text-sm font-semibold text-slate-700">Follow-up date
                                <input className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal" type="datetime-local" name="follow_up_due" defaultValue={formatDateInput(job.application_follow_up_due)} />
                              </label>
                              <label className="text-sm font-semibold text-slate-700">Resume path
                                <input className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal" type="text" name="resume_path" defaultValue={job.application_resume_path || ''} placeholder="/path/to/resume.pdf" />
                              </label>
                              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Notes
                                <textarea className="mt-2 min-h-20 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" name="notes" defaultValue={job.application_notes || ''} />
                              </label>
                              <button className="min-h-10 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 sm:col-span-2 sm:justify-self-start" type="submit" disabled={updatingApplicationId === job.id}>
                                {updatingApplicationId === job.id ? 'Saving…' : 'Save details'}
                              </button>
                            </form>
                          </details>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
                <h3 className="text-lg font-bold text-slate-900">No jobs match these filters</h3>
                <p className="mt-2 text-sm text-slate-500">Try lowering the score or including jobs you have already seen.</p>
              </div>
            )}
          </section>
        )}

        {!loading && (
          <section className="mt-14 border-t border-slate-200 pt-10" aria-labelledby="manual-links-heading">
            <div className="mb-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">Worth a manual check</p>
              <h2 id="manual-links-heading" className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Manual career links</h2>
            </div>
            {manualLinks.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {manualLinks.map((link) => (
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
        )}
      </div>
    </main>
  );
}
