import { useCallback, useEffect, useState } from 'react';
import { failureMessage } from '../utils/api';
import { filterParams, toQueryString } from '../utils/reviewQuery';

const DEBOUNCE_MS = 250;

/**
 * Sidebar counts from GET /api/review/counts: per status bucket under the current list filters (the same filter builder the list uses),
 * re-fetched (debounced) when the filters change. `counts.totals` holds the unfiltered bucket sizes.
 * @param {object} filters - Current list filters (see utils/reviewQuery.js).
 * @returns {{counts: Record<string, any>|null, error: string, refetchCounts: () => void}} `counts` is null until loaded or when the request failed (the sidebar then shows a dash, not 0).
 */
export function useReviewCounts(filters) {
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const query = toQueryString(filterParams(filters));

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/review/counts?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error(await failureMessage(response, 'Counts could not be loaded'));
        setCounts(await response.json());
        setError('');
      } catch (requestError) {
        if (requestError.name !== 'AbortError') { setCounts(null); setError(requestError.message); }
      }
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, version]);

  const refetchCounts = useCallback(() => setVersion((current) => current + 1), []);
  return { counts, error, refetchCounts };
}
