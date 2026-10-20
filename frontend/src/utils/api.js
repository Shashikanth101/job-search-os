/**
 * Message for a failed fetch response. A non-JSON 404 means the running API server does not have the route (it is older than
 * the frontend), which is the most common cause of "everything shows 0 / could not be loaded" in dev.
 * @param {Response} response - The failed response.
 * @param {string} fallback - Message when nothing better is known.
 * @returns {Promise<string>}
 */
export async function failureMessage(response, fallback) {
  const body = await response.json().catch(() => null);
  if (body?.error) return body.error;
  if (response.status === 404) return `${fallback} (HTTP 404: the API server does not know this route; restart it so it runs the current code)`;
  return `${fallback} (HTTP ${response.status})`;
}
