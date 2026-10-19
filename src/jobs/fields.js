export const JOB_TYPES = ['full-time', 'part-time', 'contract', 'internship'];
export const INDIAN_LOCATIONS = ['Bengaluru', 'Noida', 'Gurugram', 'Mumbai', 'Pune', 'Hyderabad', 'Chennai', 'India'];

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = new Set();
for (const first of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
  for (const second of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const code = first + second;
    const name = regionNames.of(code);
    if (name !== code && name !== 'Unknown Region') countries.add(name);
  }
}

/** Validate normalized LLM locations without accepting arbitrary prose or raw ATS strings. */
export function parseNormalizedLocation(value) {
  return typeof value === 'string' && (INDIAN_LOCATIONS.includes(value) || countries.has(value))
    ? value
    : null;
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordPattern = (name) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(name)}(?![\\p{L}\\p{N}])`, 'iu');

// Normalized Indian locations (INDIAN_LOCATIONS) with their common spellings.
const INDIAN_CITY_PATTERNS = [
  ['Bengaluru', ['Bengaluru', 'Bangalore']],
  ['Gurugram', ['Gurugram', 'Gurgaon']],
  ['Mumbai', ['Mumbai', 'Bombay', 'Navi Mumbai']],
  ['Noida', ['Noida']],
  ['Pune', ['Pune']],
  ['Hyderabad', ['Hyderabad']],
  ['Chennai', ['Chennai']],
].map(([city, names]) => [city, names.map(wordPattern)]);
// Other Indian places that normalize to just "India".
const OTHER_INDIA_PATTERNS = ['India', 'Delhi', 'New Delhi', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Kochi', 'Indore', 'Chandigarh', 'Coimbatore', 'Thiruvananthapuram',
  'Trivandrum', 'Mysuru', 'Mysore', 'Nagpur', 'Lucknow', 'Bhubaneswar', 'Vadodara', 'Surat', 'Karnataka', 'Maharashtra', 'Telangana', 'Tamil Nadu', 'Haryana', 'Uttar Pradesh'].map(wordPattern);
// Country spellings that Intl.DisplayNames does not produce; "Georgia" is left out because it is far more often the US state.
const COUNTRY_ALIASES = [['United States', ['USA', 'U.S.A.', 'U.S.', 'US', 'United States of America', 'America', 'San Francisco', 'New York']], ['United Kingdom', ['UK', 'U.K.', 'England', 'Scotland', 'Wales', 'Northern Ireland', 'Great Britain', 'London']],
  ['United Arab Emirates', ['UAE', 'Dubai', 'Abu Dhabi']]].map(([country, names]) => [country, names.map(wordPattern)]);
const COUNTRY_PATTERNS = [...countries].filter((name) => name !== 'Georgia').map((name) => [name, wordPattern(name)]);
const US_STATE_CODE = /,\s*(?:A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])(?![\p{L}\p{N}])/u;

/**
 * Deterministic fallback for a missing normalized location: derive it from the raw ATS location string with simple
 * rules (no LLM). The result is always a value parseNormalizedLocation accepts. An Indian place wins over other
 * countries (one Indian city gives that city, several give "India"); otherwise exactly one country is required, and
 * several distinct countries are never guessed between.
 * @param {string|null|undefined} raw Raw ATS location string.
 * @returns {string|null} Normalized location, or null when it cannot be decided (for example "Remote" or "EMEA").
 */
export function deriveLocation(raw) {
  const text = String(raw ?? '').replace(/\bNew Mexico\b/gi, ' ').trim();
  if (!text) return null;
  const cities = INDIAN_CITY_PATTERNS.filter(([, patterns]) => patterns.some((pattern) => pattern.test(text))).map(([city]) => city);
  if (cities.length === 1) return cities[0];
  if (cities.length > 1 || OTHER_INDIA_PATTERNS.some((pattern) => pattern.test(text))) return 'India';
  const found = new Set(COUNTRY_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name));
  for (const [country, patterns] of COUNTRY_ALIASES) if (patterns.some((pattern) => pattern.test(text))) found.add(country);
  if (US_STATE_CODE.test(text)) found.add('United States');
  return found.size === 1 ? [...found][0] : null;
}

/** Convert ATS employment labels to the supported database enum; missing labels default to full-time. */
export function normalizeJobType(value) {
  if (value == null || value === '') return 'full-time';
  const label = String(value).trim().toLowerCase().replace(/[_-]/g, ' ');
  if (label.includes('intern')) return 'internship';
  if (label.includes('contract') || label.includes('temporary')) return 'contract';
  if (label.includes('part time')) return 'part-time';
  if (label.includes('full time') || label === 'permanent') return 'full-time';
  return null;
}
