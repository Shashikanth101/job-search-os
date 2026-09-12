import { useEffect, useState } from 'react';

/**
 * Fetches application statistics (saved/applied counts, follow-ups).
 * @returns {{
 *   stats: object|null,
 *   setStats: import('react').Dispatch<import('react').SetStateAction<object|null>>,
 *   loading: boolean,
 *   error: string,
 *   refetchStats: () => Promise<void>,
 * }}
 */
export function useStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function fetchStats(signal) {
    const response = await fetch('/api/stats', signal ? { signal } : undefined);
    if (!response.ok) throw new Error('Stats could not be loaded.');
    return response.json();
  }

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError('');
        setStats(await fetchStats(controller.signal));
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'Stats could not be loaded.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  async function refetchStats() {
    setStats(await fetchStats());
  }

  return { stats, setStats, loading, error, refetchStats };
}