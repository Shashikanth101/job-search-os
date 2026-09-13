import { useState } from 'react';

/**
 * Generates and opens stored resumes through the app API.
 * @param {object} deps
 * @param {(updater: (jobs: object[]) => object[]) => void} deps.setJobs
 * @returns {{generatingJobIds: Set<string|number>, errorsByJobId: Record<string, string>, generateResume: (job: object) => Promise<boolean>}}
 */
export function useResumeGeneration({ setJobs }) {
  const [generatingJobIds, setGeneratingJobIds] = useState(() => new Set());
  const [errorsByJobId, setErrorsByJobId] = useState({});

  async function generateResume(job) {
    setGeneratingJobIds((current) => new Set(current).add(job.id));
    setErrorsByJobId((current) => ({ ...current, [job.id]: '' }));
    try {
      const response = await fetch('/api/resume/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not generate the resume.');
      setJobs((currentJobs) => currentJobs.map((currentJob) => currentJob.id === job.id
        ? { ...currentJob, resume_path: result.resumePath }
        : currentJob));
      return true;
    } catch (error) {
      setErrorsByJobId((current) => ({ ...current, [job.id]: error.message || 'Could not generate the resume.' }));
      return false;
    } finally {
      setGeneratingJobIds((current) => {
        const next = new Set(current);
        next.delete(job.id);
        return next;
      });
    }
  }

  return { generatingJobIds, errorsByJobId, generateResume };
}
