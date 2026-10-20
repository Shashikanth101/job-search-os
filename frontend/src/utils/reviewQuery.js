export const DEFAULT_FILTERS = { minScore: 7, archetypes: null, locationGroup: '', company: '', q: '' };

/**
 * Request parameters for the filters shared by the list and the sidebar counts (one definition, so they cannot drift apart).
 * @param {{minScore: number, archetypes: string[]|null, locationGroup: string, company: string, q: string}} filters
 * @returns {Record<string, string|number>} Query parameters; empty values are omitted by the callers.
 */
export function filterParams(filters) {
  return { minScore: filters.minScore, archetype: (filters.archetypes ?? []).join(','), locationGroup: filters.locationGroup, company: filters.company, q: filters.q };
}

/**
 * Serialize query parameters, dropping empty values.
 * @param {Record<string, string|number|null|undefined>} params
 * @returns {string}
 */
export function toQueryString(params) {
  return new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null)).toString();
}
