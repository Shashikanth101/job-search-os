/** Matches variable names whose values are secrets. */
// TOKENS (plural) is a count such as RANK_MAX_TOKENS, not a credential.
export const SECRET_NAME = /KEY|TOKEN(?!S)|SECRET|PASSWORD/;

/** Values that are obviously not a real secret (also treated as "unset" by the app). */
const PLACEHOLDER = /^(?:|your[-_ ].*|change[-_ ]?me|replace[-_ ]?me|<.*>|x{3,}|\*{3,})$/i;

/**
 * Whether a value looks like a placeholder rather than a real secret.
 * @param {string} value Variable value.
 * @returns {boolean} True for empty or placeholder-looking values.
 */
export function isPlaceholder(value) {
  return PLACEHOLDER.test(String(value ?? '').trim());
}

/**
 * Whether a value looks like a real secret (provider-style prefix, or a long random token).
 * @param {string} value Variable value.
 * @returns {boolean} True when the value should never be committed.
 */
export function looksLikeRealSecret(value) {
  const text = String(value ?? '').trim();
  if (isPlaceholder(text)) return false;
  if (/^(?:sk|pk|rk)[-_][A-Za-z0-9_-]{12,}/.test(text) || /^(?:ghp|gho|ghs|xox[abp]|AKIA|AIza)[A-Za-z0-9_-]{8,}/.test(text)) return true;
  return text.length >= 32 && /^[A-Za-z0-9_\-+/=.]+$/.test(text) && /\d/.test(text) && /[A-Za-z]/.test(text);
}

/**
 * Parse dotenv-style text into ordered entries. Inline ` # comments` on unquoted values are stripped.
 * @param {string} text File contents.
 * @returns {Array<{key: string, value: string}>} Entries in file order.
 */
export function parseEnvText(text) {
  const entries = [];
  for (const rawLine of String(text).split(/\r?\n/)) {
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.lastIndexOf(quote) > 0) {
      value = value.slice(1, value.lastIndexOf(quote));
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    entries.push({ key: match[1], value });
  }
  return entries;
}
