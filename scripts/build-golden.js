// Builds evals/golden.jsonl from the real DB (opened read-only; nothing is written to it). Re-running is
// deterministic for a given DB. After generation, edit evals/golden.jsonl by hand: expected_min/expected_max
// are only pre-filled from the stored score (+/-1). No LLM calls.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../src/config/env.js';
import { DESCRIPTION_CHARS } from '../src/ranker/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'evals', 'golden.jsonl');
const REQUIRED_IDS = [12156, 1597, 589, 1709, 3551, 860, 240, 582];
const SEED = 20261019;

function rng(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const db = new Database(path.resolve(getConfig().databasePath), { readonly: true, fileMustExist: true });
const random = rng(SEED);
const shuffle = (rows) => [...rows].sort(() => random() - 0.5);
const used = new Set(REQUIRED_IDS);
const all = db.prepare(`SELECT id, title, company, location, description, relevance_score AS score, rank_archetype AS archetype, rank_prompt_version AS version
  FROM jobs WHERE rank_status = 'ranked' AND rank_prompt_version = (SELECT MAX(rank_prompt_version) FROM jobs WHERE rank_status = 'ranked')
  AND COALESCE(description, '') != '' AND source != 'manual' ORDER BY id`).all();

function take(rows, count, { perCompany = Infinity } = {}) {
  const picked = [];
  const byCompany = new Map();
  for (const row of rows) {
    if (picked.length >= count) break;
    if (used.has(row.id) || (byCompany.get(row.company) ?? 0) >= perCompany) continue;
    byCompany.set(row.company, (byCompany.get(row.company) ?? 0) + 1);
    used.add(row.id);
    picked.push(row);
  }
  return picked;
}

const required = REQUIRED_IDS.map((id) => {
  const row = db.prepare(`SELECT id, title, company, location, description, relevance_score AS score, rank_archetype AS archetype, rank_prompt_version AS version FROM jobs WHERE id = ?`).get(id);
  if (!row) throw new Error(`Required job ${id} not found.`);
  return row;
});
const requiredSet = new Set(REQUIRED_IDS);
const pool = all.filter((row) => !requiredSet.has(row.id));
const top = take([...pool].sort((a, b) => b.score - a.score || a.id - b.id), 15, { perCompany: 2 });
const irrelevant = take(shuffle(pool.filter((row) => row.score === 1 && row.archetype === 'other')), 15, { perCompany: 1 });
const borderline = [3, 4, 5, 6].flatMap((score, index) => take(shuffle(pool.filter((row) => row.score === score)), index === 3 ? 3 : 4, { perCompany: 1 }));
const boundary = [
  ...take(shuffle(pool.filter((row) => row.score === 7)), 4, { perCompany: 1 }),
  ...take(shuffle(pool.filter((row) => row.score === 2 && ['frontend', 'fullstack', 'fde_applied_ai'].includes(row.archetype))), 3, { perCompany: 1 }),
];
if (boundary.length < 7) boundary.push(...take(shuffle(pool.filter((row) => row.score === 2)), 7 - boundary.length, { perCompany: 1 }));

const groups = [['top', top], ['irrelevant', irrelevant], ['borderline', borderline], ['required', required], ['boundary', boundary]];
const lines = groups.flatMap(([category, rows]) => rows.map((row) => JSON.stringify({
  id: row.id,
  category,
  title: row.title,
  company: row.company,
  location: row.location,
  // Exactly what the ranker sends today (first DESCRIPTION_CHARS characters of the stored description).
  description: String(row.description).slice(0, DESCRIPTION_CHARS),
  // Full stored text, used only to compare the optional trimming helper against the production cut.
  description_full: row.description,
  baseline_score: row.score,
  baseline_archetype: row.archetype,
  baseline_prompt_version: row.version,
  expected_min: Math.max(1, row.score - 1),
  expected_max: Math.min(10, row.score + 1),
})));
fs.writeFileSync(OUT, `${lines.join('\n')}\n`);
console.log(JSON.stringify(Object.fromEntries(groups.map(([name, rows]) => [name, rows.length])), null, 0), 'total', lines.length, '->', path.relative(ROOT, OUT));
db.close();
