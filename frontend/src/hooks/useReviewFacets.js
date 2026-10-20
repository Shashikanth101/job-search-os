import { useEffect, useState } from 'react';

/**
 * Archetypes that actually exist in the current view (status bucket + origin + min score), for the archetype multi-select.
 * @param {{status: string, origin?: string, minScore: number}} view
 * @returns {{value: string, count: number}[]}
 */
export function useReviewFacets({ status, origin, minScore }) {
  const [archetypes, setArchetypes] = useState([]);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(Object.entries({ status, origin, minScore }).filter(([, value]) => value !== '' && value != null));
    (async () => {
      try {
        const response = await fetch(`/api/review/facets?${query}`, { signal: controller.signal });
        if (response.ok) setArchetypes((await response.json()).archetypes);
      } catch { /* the multi-select simply stays empty */ }
    })();
    return () => controller.abort();
  }, [status, origin, minScore]);
  return archetypes;
}
