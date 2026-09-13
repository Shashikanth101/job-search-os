import { useState } from 'react';

/**
 * Encapsulates the network calls that create or mutate job applications.
 * @param {object} deps
 * @param {(updater: (jobs: object[]) => object[]) => void} deps.setJobs
 * @param {() => Promise<void>} deps.refetchStats
 * @param {() => Promise<void>} deps.refetchJobs
 * @returns {{
 *   updatingApplicationId: (string|number|null),
 *   error: string,
 *   manualError: string,
 *   submitManualApplication: (payload: {company: string, title: string, jobDescription: string, applyUrl: string, location?: string, job_type?: string}) => Promise<object|null>,
 *   saveApplication: (job: object, changes: object) => Promise<object|null>,
 *   changeApplicationStatus: (job: object, status: string) => Promise<object|null>,
 *   markFollowedUp: (reminder: object) => Promise<void>,
 * }}
 */
export function useApplicationActions({ setJobs, refetchStats, refetchJobs }) {
  const [updatingApplicationId, setUpdatingApplicationId] = useState(null);
  const [error, setError] = useState('');
  const [manualError, setManualError] = useState('');

  async function submitManualApplication(payload) {
    setError('');
    setManualError('');
    try {
      const response = await fetch('/api/jobs/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save the manual application.');
      try {
        await refetchJobs();
        await refetchStats();
      } catch (refreshError) {
        setError(`The application was saved, but the dashboard could not refresh: ${refreshError.message}`);
      }
      return result;
    } catch (requestError) {
      setManualError(requestError.message || 'Could not save the manual application.');
      return null;
    }
  }

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
      await refetchStats();
      return application;
    } catch (requestError) {
      setError(requestError.message || 'Could not update application details.');
      return null;
    } finally {
      setUpdatingApplicationId(null);
    }
  }

  async function changeApplicationStatus(job, status) {
    return saveApplication(job, { status });
  }

  async function markFollowedUp(reminder) {
    setUpdatingApplicationId(reminder.application_id);
    setError('');
    try {
      const response = await fetch(`/api/applications/${reminder.application_id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'followed_up' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update the reminder.');
      await refetchStats();
    } catch (requestError) {
      setError(requestError.message || 'Could not update the reminder.');
    } finally {
      setUpdatingApplicationId(null);
    }
  }

  return {
    manualError,
    updatingApplicationId,
    error,
    submitManualApplication,
    saveApplication,
    changeApplicationStatus,
    markFollowedUp,
  };
}
