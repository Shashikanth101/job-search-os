import { useState } from 'react';

/**
 * Saves a job's application details (applied date, follow-up date, notes) with the existing application endpoints.
 * @param {() => void} onSaved - Called after a successful save.
 * @returns {{saveDetails: (job: object, changes: object) => Promise<void>, saving: boolean, error: string}}
 */
export function useApplicationDetails(onSaved) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function saveDetails(job, changes) {
    setSaving(true);
    setError('');
    try {
      const existing = job.application_id;
      const response = await fetch(existing ? `/api/applications/${existing}` : `/api/jobs/${job.id}/application`, {
        method: existing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(changes),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not update application details.');
      onSaved();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return { saveDetails, saving, error };
}
