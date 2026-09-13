import { useMemo, useState } from 'react';

import { DashboardHeader } from './components/layout/DashboardHeader';
import { TabNav } from './components/layout/TabNav';
import { StatsSummary } from './components/applications/StatsSummary';
import { ManualApplicationForm } from './components/applications/ManualApplicationForm';
import { ErrorBanner } from './components/ui/ErrorBanner';
import { JobFilters } from './components/applications/JobFilters';
import { JobsTable } from './components/applications/JobsTable';
import { OutreachSection } from './components/outreach/OutreachSection';
import { MessageTemplatesSection } from './components/outreach/MessageTemplatesSection';
import { ManualLinksList } from './components/applications/ManualLinksList';
import { RemindersSection } from './components/applications/RemindersSection';

import { useJobs } from './hooks/useJobs';
import { useStats } from './hooks/useStats';
import { useManualLinks } from './hooks/useManualLinks';
import { useOutreach } from './hooks/useOutreach';
import { useApplicationActions } from './hooks/useApplicationActions';
import { useClipboardCopy } from './hooks/useClipboardCopy';
import { useResumeGeneration } from './hooks/useResumeGeneration';

const JOB_STATUSES = ['not_applied', 'applied', 'in_process', 'closed'];

export function App() {
  const [activeTab, setActiveTab] = useState('jobs');
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualResult, setManualResult] = useState(null);
  const [company, setCompany] = useState('All');
  const [jobStatus, setJobStatus] = useState('All');
  const [minScore, setMinScore] = useState(5);
  const [newOnly, setNewOnly] = useState(false);
  const [indiaOnly, setIndiaOnly] = useState(true);

  const { jobs, setJobs, loading: jobsLoading, error: jobsError, refetchJobs } = useJobs(indiaOnly);
  const { manualLinks, loading: manualLinksLoading, error: manualLinksError } = useManualLinks();
  const { stats, loading: statsLoading, error: statsError, refetchStats } = useStats();
  const {
    linkedinOutreach,
    messageTemplates,
    loading: outreachLoading,
    error: outreachError,
  } = useOutreach();
  const {
    updatingApplicationId,
    updatingJobIds,
    applicationErrorsByJobId,
    error: actionsError,
    manualError,
    submitManualApplication: submitManualApplicationRequest,
    saveApplication,
    changeJobStatus,
    markFollowedUp,
  } = useApplicationActions({ setJobs, refetchStats, refetchJobs });
  const { copiedKey: copiedTemplate, copy: copyTemplate, error: clipboardError } = useClipboardCopy();
  const { generatingJobIds, errorsByJobId, generateResume } = useResumeGeneration({ setJobs });

  const loading = jobsLoading || manualLinksLoading || statsLoading || outreachLoading;
  const error = jobsError || manualLinksError || statsError || outreachError || actionsError || clipboardError;

  async function submitManualApplication(event) {
    const formEl = event.currentTarget;
    event.preventDefault();
    setManualSubmitting(true);
    setManualResult(null);
    const form = new FormData(event.currentTarget);
    const result = await submitManualApplicationRequest({
      company: form.get('company'),
      title: form.get('title'),
      jobDescription: form.get('jobDescription'),
      applyUrl: form.get('applyUrl'),
      location: form.get('location') === 'Other' ? form.get('country') : form.get('location'),
      job_type: form.get('job_type'),
    });
    setManualSubmitting(false);
    if (result) {
      setManualResult(result);
      formEl.reset();
      setManualFormOpen(false);
    }
  }

  function scrollToReminders() {
    document.getElementById('reminders')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const companies = useMemo(
    () => [...new Set(jobs.map((job) => job.company).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [jobs],
  );

  const visibleJobs = useMemo(
    () => jobs
      .filter((job) => company === 'All' || job.company === company)
      .filter((job) => job.source === 'manual' || Number(job.relevance_score) >= minScore)
      .filter((job) => !newOnly || job.is_new)
      .filter((job) => jobStatus === 'All' || (job.status || 'not_applied') === jobStatus)
      .sort((a, b) => Number(b.relevance_score) - Number(a.relevance_score)),
    [jobStatus, company, jobs, minScore, newOnly],
  );

  async function saveApplicationDetails(event, job) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await saveApplication(job, {
      applied_at: form.get('applied_at') || null,
      follow_up_due: form.get('follow_up_due') || null,
      notes: form.get('notes') || null,
    });
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <DashboardHeader
          matchCount={visibleJobs.length}
          loading={loading}
          error={error}
          followUpsDue={stats?.followUpsDue ?? 0}
          onScrollToReminders={scrollToReminders}
        />

        <ManualApplicationForm
          open={manualFormOpen}
          onToggle={() => setManualFormOpen((open) => !open)}
          submitting={manualSubmitting}
          onSubmit={submitManualApplication}
          result={manualResult}
          error={manualError}
        />

        <TabNav activeTab={activeTab} onChange={setActiveTab} />

        <StatsSummary stats={stats} />

        {activeTab === 'jobs' && (
          <JobFilters
            company={company}
            companies={companies}
            onCompanyChange={setCompany}
            jobStatus={jobStatus}
            jobStatuses={JOB_STATUSES}
            onJobStatusChange={setJobStatus}
            minScore={minScore}
            onMinScoreChange={setMinScore}
            newOnly={newOnly}
            onNewOnlyChange={setNewOnly}
            indiaOnly={indiaOnly}
            onIndiaOnlyChange={setIndiaOnly}
          />
        )}

        <ErrorBanner message={error} />

        {activeTab === 'jobs' && (
          <JobsTable
            jobs={visibleJobs}
            loading={loading}
            updatingApplicationId={updatingApplicationId}
            updatingJobIds={updatingJobIds}
            applicationErrorsByJobId={applicationErrorsByJobId}
            jobStatuses={JOB_STATUSES}
            onStatusChange={changeJobStatus}
            onSaveDetails={saveApplicationDetails}
            generatingResumeJobIds={generatingJobIds}
            resumeErrors={errorsByJobId}
            onGenerateResume={generateResume}
          />
        )}

        {activeTab === 'jobs' && !loading && <ManualLinksList links={manualLinks} />}

        {activeTab === 'outreach' && (
          <section aria-labelledby="outreach-heading">
            <OutreachSection entries={linkedinOutreach} />
            <MessageTemplatesSection templates={messageTemplates} copiedKey={copiedTemplate} onCopy={copyTemplate} />
          </section>
        )}

        <RemindersSection
          followUps={stats?.followUps}
          followUpsDue={stats?.followUpsDue ?? 0}
          updatingApplicationId={updatingApplicationId}
          onMarkFollowedUp={markFollowedUp}
        />
      </div>
    </main>
  );
}
