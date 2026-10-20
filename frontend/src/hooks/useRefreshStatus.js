import { useEffect, useState } from 'react';

/**
 * Latest completed fetch cycle (read-only).
 * @returns {{refresh: {lastRefreshAt: string|null, daysAgo: number|null, trigger: string|null}|null, error: string}} `refresh` is null while loading.
 */
export function useRefreshStatus() {
  const [refresh, setRefresh] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch('/api/review/refresh', { signal: controller.signal });
        if (!response.ok) throw new Error('The refresh status could not be loaded.');
        setRefresh(await response.json());
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      }
    })();
    return () => controller.abort();
  }, []);

  return { refresh, error };
}
