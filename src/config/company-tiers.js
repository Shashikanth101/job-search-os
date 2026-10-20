import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COMPANY_TIERS_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'company-tiers.json');
export const LOWEST_TIER = 5;
const TIERS = Array.from({ length: LOWEST_TIER }, (_, i) => i + 1);
const GENERIC_WORDS = /\b(?:inc|llc|ltd|limited|pvt|private|corp|corporation|co|technologies|technology|labs|group|ai)\b/g;

const normalize = (text) => text.toLowerCase().replace(/&/g, ' and ').replace(/[.,'’]/g, '').replace(GENERIC_WORDS, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Lookup keys for a company name, so spelling variants match: the full name, the name without parentheses and each parenthetical
 * ("Anysphere (Cursor)" -> anysphere, cursor), lower-cased with punctuation and generic suffix words (Inc, Technologies, Labs, AI...) removed.
 * @param {string} name Company name.
 * @returns {string[]} Distinct non-empty keys.
 */
export function companyKeys(name) {
  const text = String(name ?? '');
  const parts = [text, text.replace(/\([^)]*\)/g, ' '), ...Array.from(text.matchAll(/\(([^)]+)\)/g), (match) => match[1])];
  return [...new Set(parts.map(normalize).filter(Boolean))];
}

/**
 * Build a company -> tier lookup (1 to 5). Names are matched case-insensitively and alias-aware (see companyKeys); a company in
 * several tiers gets the best (lowest); a company in none is tier 5 (lowest).
 * @param {Record<string, string[]>} tiers Parsed company-tiers.json.
 * @returns {(company: string) => 1|2|3|4|5} Tier lookup.
 */
export function createTierLookup(tiers = {}) {
  const index = new Map();
  for (const tier of [...TIERS].reverse()) for (const name of tiers[`tier${tier}`] ?? []) for (const key of companyKeys(name)) index.set(key, tier);
  return (company) => companyKeys(company).map((key) => index.get(key)).filter(Boolean).sort()[0] ?? LOWEST_TIER;
}

/**
 * Load company-tiers.json (read once, at server start). A missing file means every company is tier 3; a malformed one throws.
 * @param {string} [file] Path to the JSON file.
 * @returns {(company: string) => 1|2|3|4|5} Tier lookup.
 */
export function loadCompanyTiers(file = COMPANY_TIERS_PATH) {
  if (!fs.existsSync(file)) {
    console.warn(`[Config] ${path.basename(file)} not found: every company is tier 5.`);
    return createTierLookup({});
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${path.basename(file)} is not valid JSON: ${error.message}`);
  }
  for (const tier of TIERS.map((n) => `tier${n}`)) {
    if (parsed[tier] !== undefined && !(Array.isArray(parsed[tier]) && parsed[tier].every((name) => typeof name === 'string'))) throw new Error(`${path.basename(file)}: ${tier} must be an array of company names.`);
  }
  return createTierLookup(parsed);
}
