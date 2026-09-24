import { useEffect, useState } from 'react';

/**
 * Fetches target companies without automated scraper coverage.
 * @returns {{ uncoveredCompanies: string[], loading: boolean, error: string }} Resource state.
 */
export function useUncoveredCompanies() {
  const [uncoveredCompanies, setUncoveredCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError('');
        const response = await fetch('/api/uncovered-companies', { signal: controller.signal });
        if (!response.ok) throw new Error('Uncovered companies could not be loaded.');
        const companies = await response.json();
        if (!Array.isArray(companies) || companies.some((company) => typeof company !== 'string')) {
          throw new Error('Uncovered companies response was invalid.');
        }
        setUncoveredCompanies(companies);
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'Uncovered companies could not be loaded.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  return { uncoveredCompanies, loading, error };
}
