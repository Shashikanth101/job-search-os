import { useState } from 'react';

/**
 * Saves a manual job (POST /api/review/manual). Nothing is fetched from the posting and nothing is ranked on save.
 * @returns {{addJob: (fields: {url: string, company?: string, title?: string, location?: string, description?: string}) => Promise<object|null>, saving: boolean, error: string}}
 *   `addJob` resolves with the saved row, or null when it failed (`error` explains).
 */
export function useAddManualJob() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function addJob(fields) {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/review/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The job could not be saved.');
      return body;
    } catch (requestError) {
      setError(requestError.message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  return { addJob, saving, error };
}
