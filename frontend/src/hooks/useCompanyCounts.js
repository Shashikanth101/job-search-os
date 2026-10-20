import { useEffect, useState } from 'react';

/**
 * Distinct company counts (GET /api/review/companies): with at least one ranked job, and in the database overall.
 * @returns {{companies: {withRankedJobs: number, total: number}|null}} `companies` is null until loaded.
 */
export function useCompanyCounts() {
  const [companies, setCompanies] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch('/api/review/companies', { signal: controller.signal });
        if (response.ok) setCompanies(await response.json());
      } catch { /* the Ops page still works without the counts */ }
    })();
    return () => controller.abort();
  }, []);
  return { companies };
}
