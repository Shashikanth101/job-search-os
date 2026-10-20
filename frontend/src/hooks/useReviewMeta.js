import { useEffect, useState } from 'react';

/**
 * Loads the review filter options (read-only).
 * @returns {{filters: {companies: string[], archetypes: string[], seniority: string[], statuses: string[], locationGroups: string[]}}}
 */
export function useReviewMeta() {
  const [filters, setFilters] = useState({ companies: [], archetypes: [], seniority: [], statuses: [], locationGroups: [] });

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch('/api/review/filters', { signal: controller.signal });
        if (response.ok) setFilters(await response.json());
      } catch { /* the page still works without the filter options */ }
    })();
    return () => controller.abort();
  }, []);

  return { filters };
}
