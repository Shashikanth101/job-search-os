import { useEffect, useState } from 'react';

/**
 * Fetches LinkedIn outreach targets and reusable message templates.
 * @returns {{
 *   linkedinOutreach: object[],
 *   messageTemplates: Record<string, string>,
 *   loading: boolean,
 *   error: string,
 * }}
 */
export function useOutreach() {
  const [linkedinOutreach, setLinkedinOutreach] = useState([]);
  const [messageTemplates, setMessageTemplates] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError('');
        const [outreachResponse, templatesResponse] = await Promise.all([
          fetch('/api/linkedin-outreach', { signal: controller.signal }),
          fetch('/api/message-templates', { signal: controller.signal }),
        ]);
        if (!outreachResponse.ok || !templatesResponse.ok) {
          throw new Error('Outreach data could not be loaded.');
        }
        const [outreachData, templatesData] = await Promise.all([
          outreachResponse.json(),
          templatesResponse.json(),
        ]);
        setLinkedinOutreach(outreachData);
        setMessageTemplates(templatesData);
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'Outreach data could not be loaded.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  return { linkedinOutreach, messageTemplates, loading, error };
}