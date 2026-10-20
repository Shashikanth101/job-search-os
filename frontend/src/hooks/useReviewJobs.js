import { useCallback, useEffect, useState } from 'react';
import { failureMessage } from '../utils/api';

/**
 * Fetches one server-side page of the review list for the given filters.
 * @param {Record<string, string|number>} query - Page, pageSize and filter values; empty values are omitted.
 * @returns {{
 *   data: {jobs: object[], total: number, page: number, pages: number},
 *   loading: boolean,
 *   error: string,
 *   replaceJob: (job: object) => void,
 *   removeJob: (id: number) => void,
 *   reload: () => void,
 * }}
 */
export function useReviewJobs(query) {
  const [data, setData] = useState({ jobs: [], total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const queryString = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== '' && value != null)).toString();

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setError('');
        const response = await fetch(`/api/review/jobs?${queryString}`, { signal: controller.signal });
        if (!response.ok) throw new Error(await failureMessage(response, 'The job list could not be loaded'));
        setData(await response.json());
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [queryString, version]);

  const replaceJob = useCallback((job) => setData((current) => ({ ...current, jobs: current.jobs.map((entry) => (entry.id === job.id ? { ...entry, ...job } : entry)) })), []);
  const removeJob = useCallback((id) => setData((current) => ({ ...current, jobs: current.jobs.filter((entry) => entry.id !== id), total: Math.max(0, current.total - 1) })), []);
  const reload = useCallback(() => setVersion((current) => current + 1), []);
  return { data, loading, error, replaceJob, removeJob, reload };
}
