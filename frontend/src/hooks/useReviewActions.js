import { useState } from 'react';

/**
 * Writes a review status (new, saved, applying, applied, skipped) for one job. Only this status is written; nothing is scraped or ranked.
 * @param {(job: object) => void} onUpdated - Receives the updated job row.
 * @returns {{setStatus: (id: number, status: string) => Promise<void>, error: string, pendingIds: Set<number>}}
 */
export function useReviewActions(onUpdated) {
  const [error, setError] = useState('');
  const [pendingIds, setPendingIds] = useState(new Set());

  async function setStatus(id, status) {
    setError('');
    setPendingIds((current) => new Set(current).add(id));
    try {
      const response = await fetch(`/api/review/jobs/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The status could not be saved.');
      onUpdated(body);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPendingIds((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  }

  return { setStatus, error, pendingIds };
}
