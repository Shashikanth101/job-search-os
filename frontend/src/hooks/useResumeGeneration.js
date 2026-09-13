import { useState } from 'react';

/**
 * Generates and opens stored resumes through the app API.
 * @param {object} deps
 * @param {(updater: (jobs: object[]) => object[]) => void} deps.setJobs
 * @returns {{generatingJobId: (string|number|null), errorsByJobId: Record<string, string>, generateResume: (job: object) => Promise<boolean>}}
 */
export function useResumeGeneration({ setJobs }) {
  const [generatingJobId, setGeneratingJobId] = useState(null);
  const [errorsByJobId, setErrorsByJobId] = useState({});

  async function generateResume(job) {
    setGeneratingJobId(job.id);
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
      setGeneratingJobId(null);
    }
  }

  return { generatingJobId, errorsByJobId, generateResume };
}
