import fs from 'node:fs';
import path from 'node:path';
import { GOLDEN_PATH, loadGolden } from './golden.js';

export const REVIEW_CSV_PATH = path.join(path.dirname(GOLDEN_PATH), 'golden-review.csv');
export const REVIEW_COLUMNS = ['id', 'company', 'title', 'category', 'baseline_score', 'expected_min', 'expected_max', 'note'];

const csvCell = (value) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Parse CSV text (RFC 4180: quoted cells, escaped quotes, embedded newlines, CRLF).
 * @param {string} text CSV content.
 * @returns {string[][]} Rows of cells; blank lines are skipped.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const body = text.replace(/^﻿/, '');
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (quoted) {
      if (char === '"' && body[i + 1] === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = false; else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; } else if (char === '\n' || char === '\r') {
      if (char === '\r' && body[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error('CSV has an unterminated quoted cell.');
  row.push(cell);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

/**
 * Write the compact review CSV (no descriptions) for the golden set. No LLM calls.
 * @param {object} [options] Options.
 * @param {string} [options.golden] Path to golden.jsonl.
 * @param {string} [options.csv] Output CSV path.
 * @returns {{count: number, file: string}} Rows written and the path.
 */
export function exportReviewCsv({ golden = GOLDEN_PATH, csv = REVIEW_CSV_PATH } = {}) {
  const entries = loadGolden(golden);
  const lines = [REVIEW_COLUMNS.join(','), ...entries.map((entry) => REVIEW_COLUMNS.map((column) => csvCell(column === 'note' ? entry.note : entry[column])).join(','))];
  fs.writeFileSync(csv, `${lines.join('\n')}\n`);
  return { count: entries.length, file: csv };
}

/**
 * Apply edits from the review CSV to golden.jsonl: only expected_min, expected_max and note change.
 * Validates everything first; nothing is written if any row is invalid or the ids do not match the golden set exactly.
 * @param {object} [options] Options.
 * @param {string} [options.golden] Path to golden.jsonl.
 * @param {string} [options.csv] Input CSV path.
 * @returns {{changes: Array<{id: number, fields: Array<{field: string, from: *, to: *}>}>, unchanged: number}} What changed.
 * @throws {Error} When the CSV is malformed, ids differ, or a range violates 1 <= min <= max <= 10.
 */
export function importReviewCsv({ golden = GOLDEN_PATH, csv = REVIEW_CSV_PATH } = {}) {
  const entries = loadGolden(golden);
  const [header, ...rows] = parseCsv(fs.readFileSync(csv, 'utf8'));
  if (!header) throw new Error('Review CSV is empty.');
  const missingColumns = ['id', 'expected_min', 'expected_max', 'note'].filter((column) => !header.includes(column));
  if (missingColumns.length) throw new Error(`Review CSV is missing column(s): ${missingColumns.join(', ')}.`);
  const col = Object.fromEntries(header.map((name, index) => [name, index]));

  const byId = new Map(entries.map((entry) => [String(entry.id), entry]));
  const seen = new Set();
  const edits = new Map();
  const errors = [];
  rows.forEach((cells, index) => {
    const line = index + 2;
    if (cells.length !== header.length) { errors.push(`line ${line}: expected ${header.length} cells, got ${cells.length}.`); return; }
    const id = cells[col.id].trim();
    if (!byId.has(id)) { errors.push(`line ${line}: id ${id || '(blank)'} is not in golden.jsonl.`); return; }
    if (seen.has(id)) { errors.push(`line ${line}: duplicate id ${id}.`); return; }
    seen.add(id);
    const min = Number(cells[col.expected_min].trim());
    const max = Number(cells[col.expected_max].trim());
    if (!cells[col.expected_min].trim() || !cells[col.expected_max].trim() || !(min >= 1 && max <= 10 && min <= max)) {
      errors.push(`line ${line} (id ${id}): expected_min/expected_max must satisfy 1 <= min <= max <= 10 (got ${cells[col.expected_min]}, ${cells[col.expected_max]}).`);
      return;
    }
    edits.set(id, { expected_min: min, expected_max: max, note: cells[col.note].trim() });
  });
  for (const id of byId.keys()) if (!seen.has(id)) errors.push(`id ${id} is in golden.jsonl but missing from the CSV.`);
  if (errors.length) throw new Error(`Review CSV rejected, golden.jsonl untouched:\n  ${errors.join('\n  ')}`);

  const changes = [];
  const updated = entries.map((entry) => {
    const edit = edits.get(String(entry.id));
    const fields = [];
    const next = { ...entry };
    for (const field of ['expected_min', 'expected_max']) {
      if (entry[field] !== edit[field]) { fields.push({ field, from: entry[field], to: edit[field] }); next[field] = edit[field]; }
    }
    if ((entry.note ?? '') !== edit.note) {
      fields.push({ field: 'note', from: entry.note ?? '', to: edit.note });
      if (edit.note) next.note = edit.note; else delete next.note;
    }
    if (fields.length) changes.push({ id: entry.id, fields });
    return fields.length ? next : entry;
  });
  if (changes.length) {
    const original = fs.readFileSync(golden, 'utf8').split('\n').filter((line) => line.trim());
    fs.writeFileSync(golden, `${updated.map((entry, index) => (entry === entries[index] ? original[index] : JSON.stringify(entry))).join('\n')}\n`);
  }
  return { changes, unchanged: entries.length - changes.length };
}
