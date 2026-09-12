import { useState } from 'react';

/**
 * Copies text to the clipboard and tracks which keyed item was last copied.
 * @param {{ resetDelay?: number }} [options]
 * @returns {{ copiedKey: string, copy: (key: string, text: string) => Promise<void>, error: string }}
 */
export function useClipboardCopy({ resetDelay = 2000 } = {}) {
  const [copiedKey, setCopiedKey] = useState('');
  const [error, setError] = useState('');

  async function copy(key, text) {
    try {
      setError('');
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(''), resetDelay);
    } catch (copyError) {
      setError(copyError.message || 'Could not copy the message template.');
    }
  }

  return { copiedKey, copy, error };
}