import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECRET_NAME, isPlaceholder, parseEnvText } from '../src/config/env-file.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_EXAMPLE = path.join(ROOT, '.env.example');
const DEFAULT_ENV = path.join(ROOT, '.env');

const readEntries = (file) => (fs.existsSync(file) ? parseEnvText(fs.readFileSync(file, 'utf8')) : []);

/**
 * Compare .env.example with .env. Returns variable NAMES only, never values.
 * @param {{examplePath?: string, envPath?: string}} [paths] File locations.
 * @returns {{missing: string[], extra: string[], duplicates: string[], badSecrets: string[]}} (d) duplicates are keys defined more than once in .env (the last one wins); (a) missing from .env, (b) not in the example, (c) example secrets that are not placeholders.
 */
export function checkEnv({ examplePath = DEFAULT_EXAMPLE, envPath = DEFAULT_ENV } = {}) {
  const example = readEntries(examplePath);
  const envEntries = readEntries(envPath);
  const actual = new Set(envEntries.map((entry) => entry.key));
  const seen = new Set();
  const duplicates = [...new Set(envEntries.filter((entry) => (seen.has(entry.key) ? true : (seen.add(entry.key), false))).map((entry) => entry.key))];
  const known = new Set(example.map((entry) => entry.key));
  return {
    missing: example.filter((entry) => !actual.has(entry.key)).map((entry) => entry.key),
    extra: [...actual].filter((key) => !known.has(key)),
    duplicates,
    badSecrets: example.filter((entry) => SECRET_NAME.test(entry.key) && !isPlaceholder(entry.value)).map((entry) => entry.key),
  };
}

/**
 * Append keys missing from .env using the example's defaults (empty for secrets), after backing .env up.
 * Existing lines are never changed or reordered.
 * @param {{examplePath?: string, envPath?: string, now?: Date}} [options] File locations and clock.
 * @returns {{added: string[], secretsToFill: string[], backupPath: string|null}} Names only.
 */
export function syncEnv({ examplePath = DEFAULT_EXAMPLE, envPath = DEFAULT_ENV, now = new Date() } = {}) {
  const example = readEntries(examplePath);
  const { missing } = checkEnv({ examplePath, envPath });
  let backupPath = null;
  if (fs.existsSync(envPath)) {
    backupPath = `${envPath}.bak-${now.toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(envPath, backupPath);
  }
  if (!missing.length) return { added: [], secretsToFill: [], backupPath };

  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = missing.map((key) => `${key}=${SECRET_NAME.test(key) ? '' : example.find((entry) => entry.key === key).value}`);
  const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(envPath, `${prefix}\n# Added by env:sync ${now.toISOString()}\n${lines.join('\n')}\n`);
  return { added: missing, secretsToFill: missing.filter((key) => SECRET_NAME.test(key)), backupPath };
}

function main(command) {
  if (command === 'check') {
    const { missing, extra, badSecrets, duplicates } = checkEnv();
    const show = (label, keys) => console.log(`${label} (${keys.length})${keys.length ? `: ${keys.join(', ')}` : ''}`);
    show('(a) In .env.example but missing from .env', missing);
    show('(b) In .env but not in .env.example', extra);
    show('(c) Example secrets whose value is not a placeholder', badSecrets);
    show('(d) Keys defined more than once in .env (warning: the last definition wins)', duplicates);
    process.exitCode = missing.length || badSecrets.length ? 1 : 0;
  } else if (command === 'sync') {
    const { added, secretsToFill, backupPath } = syncEnv();
    console.log(backupPath ? `Backed up .env to ${path.basename(backupPath)}` : 'No existing .env; creating one.');
    console.log(added.length ? `Added ${added.length} key(s): ${added.join(', ')}` : 'Nothing to add; .env already has every key.');
    for (const key of secretsToFill) console.log(`Fill this in: ${key} (appended empty)`);
  } else {
    console.error('Usage: node scripts/env-sync.js <check|sync>');
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv[2]);
