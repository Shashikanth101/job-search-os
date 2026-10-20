import { useState } from 'react';

/**
 * useState that remembers its value in localStorage (a per-browser convenience; works without storage).
 * @template T
 * @param {string} key - Storage key.
 * @param {T} initial - Value when nothing valid is stored.
 * @param {(value: unknown) => boolean} [isValid] - Rejects stored values that are no longer valid choices.
 * @returns {[T, (value: T) => void]}
 */
export function usePersistentState(key, initial, isValid = () => true) {
  const [value, setValue] = useState(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(key));
      return stored !== null && isValid(stored) ? stored : initial;
    } catch { return initial; }
  });
  function update(next) {
    setValue(next);
    try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable: keep the in-memory value */ }
  }
  return [value, update];
}
