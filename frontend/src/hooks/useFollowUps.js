import { useState } from 'react';

/**
 * Marks a follow-up reminder as done (pushes the follow-up date out 10 days) via PATCH /api/applications/:id.
 * @param {() => Promise<void>} refetchStats - Reloads the stats after a change.
 * @returns {{markFollowedUp: (reminder: {application_id: number|string}) => Promise<void>, updatingApplicationId: number|string|null, error: string}}
 */
export function useFollowUps(refetchStats) {
  const [updatingApplicationId, setUpdatingApplicationId] = useState(null);
  const [error, setError] = useState('');

  async function markFollowedUp(reminder) {
    setUpdatingApplicationId(reminder.application_id);
    setError('');
    try {
      const response = await fetch(`/api/applications/${reminder.application_id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ follow_up_due: new Date(Date.now() + (10 * 24 * 60 * 60 * 1000)).toISOString() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update the reminder.');
      await refetchStats();
    } catch (requestError) {
      setError(requestError.message || 'Could not update the reminder.');
    } finally {
      setUpdatingApplicationId(null);
    }
  }

  return { markFollowedUp, updatingApplicationId, error };
}
