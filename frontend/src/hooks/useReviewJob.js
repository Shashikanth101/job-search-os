import { useCallback, useEffect, useState } from 'react';
import { failureMessage } from '../utils/api';

const CACHE_LIMIT = 200;
const cache = new Map();
const inflight = new Map();

function remember(job) {
  cache.delete(job.id);
  cache.set(job.id, job);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

async function fetchDetail(id, signal) {
  const response = await fetch(`/api/review/jobs/${id}`, signal ? { signal } : undefined);
  if (!response.ok) throw new Error(await failureMessage(response, 'The job could not be loaded'));
  const job = await response.json();
  remember(job);
  return job;
}

/**
 * Warm the in-memory detail cache for neighboring jobs so moving the selection is instant. Failures are ignored.
 * @param {Array<number|null|undefined>} ids - Job ids to prefetch (cached or in-flight ids are skipped).
 */
export function prefetchJobDetails(ids) {
  for (const id of ids) {
    if (!id || cache.has(id) || inflight.has(id)) continue;
    const request = fetchDetail(id).catch(() => null).finally(() => inflight.delete(id));
    inflight.set(id, request);
  }
}

/**
 * One job with its full description and application details (GET /api/review/jobs/:id), served from an in-memory cache when possible.
 * @param {number|null} id - Job id, or null for none.
 * @returns {{job: object|null, loading: boolean, error: string, setJob: (job: object|null|((current: object|null) => object|null)) => void, reload: () => void}}
 *   `setJob` also updates the cache; `reload` bypasses it.
 */
export function useReviewJob(id) {
  const [job, setJobState] = useState(() => (id ? cache.get(id) ?? null : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!id) { setJobState(null); return undefined; }
    const cached = version === 0 ? cache.get(id) : null;
    if (cached) { setJobState(cached); setError(''); setLoading(false); return undefined; }
    const controller = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setError('');
        setJobState(await fetchDetail(id, controller.signal));
      } catch (requestError) {
        if (requestError.name !== 'AbortError') { setJobState(null); setError(requestError.message); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [id, version]);

  const setJob = useCallback((next) => setJobState((current) => {
    const value = typeof next === 'function' ? next(current) : next;
    if (value?.id) remember(value);
    return value;
  }), []);
  const reload = useCallback(() => { if (id) cache.delete(id); setVersion((current) => current + 1); }, [id]);
  return { job, loading, error, setJob, reload };
}
