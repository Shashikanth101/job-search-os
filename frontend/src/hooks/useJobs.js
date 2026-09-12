import { useEffect, useState } from 'react';

/**
 * Fetches the ranked job feed and exposes local mutation helpers.
 * @param {boolean} indiaOnly - Restrict results to India-based jobs when true.
 * @returns {{
 *   jobs: object[],
 *   setJobs: import('react').Dispatch<import('react').SetStateAction<object[]>>,
 *   loading: boolean,
 *   error: string,
 *   refetchJobs: () => Promise<void>,
 * }}
 */
export function useJobs(indiaOnly) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function fetchJobs(signal) {
    const response = await fetch(
      `/api/jobs?minScore=5${indiaOnly ? '&location=india' : ''}`,
      signal ? { signal } : undefined,
    );
    if (!response.ok) throw new Error('The job feed could not be loaded.');
    return response.json();
  }

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError('');
        setJobs(await fetchJobs(controller.signal));
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'The job feed could not be loaded.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [indiaOnly]);

  async function refetchJobs() {
    setJobs(await fetchJobs());
  }

  return { jobs, setJobs, loading, error, refetchJobs };
}