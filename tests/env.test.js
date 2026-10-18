import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENV_DEFAULTS, ENV_FILE_PATH, getConfig, loadEnvFile, validateEnv } from '../src/config/env.js';
import { SECRET_NAME, isPlaceholder, looksLikeRealSecret, parseEnvText } from '../src/config/env-file.js';
import { checkEnv, syncEnv } from '../scripts/env-sync.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = path.join(ROOT, '.env.example');
// Set by the platform / test runner rather than configured by the user.
const SYSTEM_VARS = new Set(['PATH', 'NODE_TEST_CONTEXT']);

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(?:js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

test('every env var read in src/ and scripts/ is documented in .env.example', () => {
  const documented = new Set(parseEnvText(fs.readFileSync(EXAMPLE, 'utf8')).map((entry) => entry.key));
  const used = new Map();
  for (const file of ['src', 'scripts'].flatMap((dir) => sourceFiles(path.join(ROOT, dir)))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(?:process\.env\.|\benv\.|process\.env\[\s*['"]|\benv\[\s*['"]|\b(?:read|number)\(\s*env\s*,\s*')([A-Z][A-Z0-9_]*)/g)) {
      if (!SYSTEM_VARS.has(match[1])) used.set(match[1], path.relative(ROOT, file));
    }
  }
  assert.ok(used.size > 10, 'scanner found the variables');
  const missing = [...used].filter(([name]) => !documented.has(name)).map(([name, file]) => `${name} (${file})`);
  assert.deepEqual(missing, [], 'add these to .env.example');
});

test('.env.example has placeholder secrets only and no real-looking values', () => {
  const entries = parseEnvText(fs.readFileSync(EXAMPLE, 'utf8'));
  const offenders = entries.filter((entry) => (SECRET_NAME.test(entry.key) && !isPlaceholder(entry.value)) || looksLikeRealSecret(entry.value)).map((entry) => entry.key);
  assert.deepEqual(offenders, []);
  assert.ok(entries.filter((entry) => SECRET_NAME.test(entry.key)).every((entry) => entry.value === 'your-key-here'));
});

test('SECRET_NAME treats credentials as secrets but not token counts', () => {
  for (const name of ['LLM_API_KEY', 'GH_TOKEN', 'DB_PASSWORD', 'APP_SECRET']) assert.equal(SECRET_NAME.test(name), true, name);
  assert.equal(SECRET_NAME.test('RANK_MAX_TOKENS'), false);
});

test('secret detector flags provider-style and long random values but not defaults', () => {
  for (const value of ['sk-ant-api03-abcdefghijklmnop', 'sk-abcdefghijklmnopqrstuv', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6', 'ghp_abcdefghijklmnop']) assert.equal(looksLikeRealSecret(value), true, value);
  for (const value of ['your-key-here', '', './data/jobs.db', '[]', '60000', 'claude-haiku-5-5', '0.50']) assert.equal(looksLikeRealSecret(value), false, value);
});

test('config defaults match .env.example and every example key has a default', () => {
  const entries = parseEnvText(fs.readFileSync(EXAMPLE, 'utf8'));
  assert.deepEqual(entries.map((entry) => entry.key).sort(), Object.keys(ENV_DEFAULTS).sort());
  for (const { key, value } of entries) {
    assert.equal(ENV_DEFAULTS[key], SECRET_NAME.test(key) ? '' : value, key);
  }
});

test('config treats placeholders as unset, applies defaults, and validates required keys by name only', () => {
  const config = getConfig({ LLM_API_KEY: 'your-key-here', RESUME_LLM_API_KEY: 'your-key-here', RANK_CONCURRENCY: 'abc' });
  assert.equal(config.llm.apiKey, '');
  assert.equal(config.rank.concurrency, 4);
  assert.equal(config.llm.provider, 'anthropic');
  assert.equal(getConfig({ LLM_API_KEY: 'fake', RESUME_LLM_API_KEY: '' }).resumeLlm.apiKey, 'fake');

  const missingKey = validateEnv({ requireLlm: true, env: { LLM_API_KEY: 'your-key-here' } });
  assert.match(missingKey.errors.join(' '), /LLM_API_KEY is required/);
  assert.deepEqual(validateEnv({ requireLlm: true, env: { LLM_API_KEY: 'fake-secret-value' } }).errors, []);
  assert.deepEqual(validateEnv({ requireLlm: true, env: { LLM_DISABLED: '1' } }).errors, []);
  assert.deepEqual(validateEnv({ requireLlm: true, env: { LLM_PROVIDER: 'ollama' } }).errors, []);
  assert.deepEqual(validateEnv({ requireLlm: false, env: {} }).errors, []);
  const output = JSON.stringify(validateEnv({ requireLlm: true, env: { LLM_API_KEY: 'fake-secret-value', FIRECRAWL_API_KEY: 'another-fake' } }));
  assert.ok(!output.includes('fake-secret-value') && !output.includes('another-fake'));
});

test('env:check and env:sync report names only, never reorder or overwrite, and back up first', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-'));
  const examplePath = path.join(dir, '.env.example');
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(examplePath, '# c\nPORT=3001\nLLM_API_KEY=your-key-here\nOTHER_TOKEN=sk-abcdefghijklmnopqrstuv\nMODE=fast # inline\nNEW_FLAG=on\n');
  fs.writeFileSync(envPath, 'PORT=9999\nSTALE=1\nLLM_API_KEY=super-secret-sentinel');

  const report = checkEnv({ examplePath, envPath });
  assert.deepEqual(report, { missing: ['OTHER_TOKEN', 'MODE', 'NEW_FLAG'], extra: ['STALE'], duplicates: [], badSecrets: ['OTHER_TOKEN'] });
  const dupPath = path.join(dir, '.env.dup');
  fs.writeFileSync(dupPath, 'PORT=1\nPORT=2\nMODE=a\n');
  assert.deepEqual(checkEnv({ examplePath, envPath: dupPath }).duplicates, ['PORT']);
  assert.ok(!JSON.stringify(report).includes('super-secret-sentinel') && !JSON.stringify(report).includes('sk-abc'));

  const before = fs.readFileSync(envPath, 'utf8');
  const result = syncEnv({ examplePath, envPath, now: new Date('2026-01-02T03:04:05.678Z') });
  assert.deepEqual(result.added, ['OTHER_TOKEN', 'MODE', 'NEW_FLAG']);
  assert.deepEqual(result.secretsToFill, ['OTHER_TOKEN']);
  assert.equal(fs.readFileSync(result.backupPath, 'utf8'), before);
  assert.match(path.basename(result.backupPath), /^\.env\.bak-2026-01-02T03-04-05-678Z$/);
  const after = fs.readFileSync(envPath, 'utf8');
  assert.ok(after.startsWith(before), 'existing lines untouched and in order');
  assert.match(after, /\nOTHER_TOKEN=\nMODE=fast\nNEW_FLAG=on\n$/);
  assert.ok(!JSON.stringify(result).includes('super-secret-sentinel'));
  assert.deepEqual(checkEnv({ examplePath, envPath }).missing, []);
  assert.deepEqual(syncEnv({ examplePath, envPath }).added, []);
});

test('.gitignore ignores .env and its backups', () => {
  const lines = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/);
  assert.ok(lines.includes('.env') && lines.includes('.env.bak-*'));
});

test('.env is authoritative: it overrides pre-set shell values, and only names are logged', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envload-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, 'PORT=4000\nLLM_MODEL=from-file\nLLM_API_KEY="file-secret-sentinel"\nNEW_ONLY_IN_FILE=1\nSAME_VALUE=same\n');
  const env = { PORT: '1111', LLM_API_KEY: 'shell-secret-sentinel', SAME_VALUE: 'same', UNRELATED: 'keep' };
  const logs = [];
  const result = loadEnvFile({ path: file, env, log: (line) => logs.push(line) });

  assert.equal(result.loaded, true);
  assert.deepEqual(result.overridden, ['PORT', 'LLM_API_KEY']);
  assert.equal(env.PORT, '4000');
  assert.equal(env.LLM_API_KEY, 'file-secret-sentinel');
  assert.equal(env.NEW_ONLY_IN_FILE, '1');
  assert.equal(env.UNRELATED, 'keep');
  assert.equal(logs.length, 1);
  assert.match(logs[0], /overrides 2 shell variable\(s\): PORT, LLM_API_KEY/);
  assert.ok(!logs[0].includes('sentinel') && !logs[0].includes('4000') && !logs[0].includes('1111'), 'no values in the log');

  // Default environment object (process.env) behaves the same way.
  process.env.ENVLOAD_TEST_VAR = 'shell';
  fs.writeFileSync(file, 'ENVLOAD_TEST_VAR=file\n');
  try {
    assert.deepEqual(loadEnvFile({ path: file, log() {} }).overridden, ['ENVLOAD_TEST_VAR']);
    assert.equal(process.env.ENVLOAD_TEST_VAR, 'file');
  } finally {
    delete process.env.ENVLOAD_TEST_VAR;
  }
});

test('a missing .env changes nothing and logs nothing', () => {
  const env = { PORT: '1111' };
  const logs = [];
  const result = loadEnvFile({ path: path.join(os.tmpdir(), 'definitely-missing-dir', '.env'), env, log: (line) => logs.push(line) });
  assert.deepEqual(result, { loaded: false, overridden: [] });
  assert.deepEqual(env, { PORT: '1111' });
  assert.deepEqual(logs, []);
});

test('the real project .env is never loaded during tests', () => {
  const before = { ...process.env };
  const result = loadEnvFile({ log() {} });
  assert.deepEqual(result, { loaded: false, overridden: [], skipped: 'test' });
  assert.deepEqual({ ...process.env }, before);
  assert.ok(ENV_FILE_PATH.endsWith('.env'));
});
