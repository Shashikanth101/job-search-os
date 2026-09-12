/**
 * Converts a stored datetime string into the value a datetime-local input expects.
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function formatDateInput(value) {
  return value ? String(value).replace(' ', 'T').slice(0, 16) : '';
}