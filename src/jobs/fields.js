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
