import { useEffect, useState } from 'react';

/**
 * Fetches the curated list of manual career page links.
 * @returns {{ manualLinks: object[], loading: boolean, error: string }}
 */
export function useManualLinks() {
  const [manualLinks, setManualLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError('');
        const response = await fetch('/api/manual-links', { signal: controller.signal });
        if (!response.ok) throw new Error('Manual links could not be loaded.');
        setManualLinks(await response.json());
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'Manual links could not be loaded.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  return { manualLinks, loading, error };
}