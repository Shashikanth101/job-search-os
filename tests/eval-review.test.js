import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exportReviewCsv, importReviewCsv, parseCsv, REVIEW_COLUMNS } from '../src/eval/review.js';
import { loadGolden } from '../src/eval/golden.js';

const entry = (id, min, max, extra = {}) => ({ id, category: 'top', title: `Job, "${id}"`, company: 'Acme', location: 'Bengaluru', description: 'React work.', baseline_score: 8, expected_min: min, expected_max: max, ...extra });

const writeRows = (file, rows, eol = '\n') => fs.writeFileSync(file, rows.map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join(eol));

function setup(t, entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-review-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const golden = path.join(dir, 'golden.jsonl');
  fs.writeFileSync(golden, `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`);
  return { golden, csv: path.join(dir, 'golden-review.csv') };
}

test('export writes the review columns without descriptions and quotes awkward cells', (t) => {
  const paths = setup(t, [entry(1, 8, 10, { note: 'line1\nline2, "quoted"' }), entry(2, 1, 3)]);
  assert.equal(exportReviewCsv(paths).count, 2);
  const text = fs.readFileSync(paths.csv, 'utf8');
  assert.ok(!text.includes('React work'));
  const rows = parseCsv(text);
  assert.deepEqual(rows[0], REVIEW_COLUMNS);
  assert.equal(rows[1][2], 'Job, "1"');
  assert.equal(rows[1][7], 'line1\nline2, "quoted"');
  assert.equal(rows[2][7], '');
});

test('import updates only expected_min, expected_max and note, and reports changes', (t) => {
  const paths = setup(t, [entry(1, 8, 10), entry(2, 1, 3, { note: 'old' }), entry(3, 4, 6)]);
  const before = fs.readFileSync(paths.golden, 'utf8').split('\n');
  exportReviewCsv(paths);
  const rows = parseCsv(fs.readFileSync(paths.csv, 'utf8'));
  rows[1][5] = '7';
  rows[1][7] = 'tighten, please';
  rows[2][7] = '';
  rows[1][2] = 'Edited title';
  writeRows(paths.csv, rows, '\r\n');

  const { changes, unchanged } = importReviewCsv(paths);
  assert.equal(unchanged, 1);
  assert.deepEqual(changes, [
    { id: 1, fields: [{ field: 'expected_min', from: 8, to: 7 }, { field: 'note', from: '', to: 'tighten, please' }] },
    { id: 2, fields: [{ field: 'note', from: 'old', to: '' }] },
  ]);
  const [one, two, three] = loadGolden(paths.golden);
  assert.deepEqual([one.expected_min, one.expected_max, one.note, one.title], [7, 10, 'tighten, please', 'Job, "1"']);
  assert.equal('note' in two, false);
  assert.equal(fs.readFileSync(paths.golden, 'utf8').split('\n')[2], before[2]);
  assert.deepEqual(three, entry(3, 4, 6));
});

test('import with no edits changes nothing', (t) => {
  const paths = setup(t, [entry(1, 8, 10)]);
  const before = fs.readFileSync(paths.golden, 'utf8');
  exportReviewCsv(paths);
  assert.deepEqual(importReviewCsv(paths), { changes: [], unchanged: 1 });
  assert.equal(fs.readFileSync(paths.golden, 'utf8'), before);
});

test('import rejects bad ranges and mismatched ids without writing', (t) => {
  const paths = setup(t, [entry(1, 8, 10), entry(2, 1, 3)]);
  const before = fs.readFileSync(paths.golden, 'utf8');
  exportReviewCsv(paths);
  const good = fs.readFileSync(paths.csv, 'utf8');
  const mutate = (fn) => {
    const rows = parseCsv(good);
    fn(rows);
    writeRows(paths.csv, rows);
  };
  for (const [name, fn, pattern] of [
    ['min > max', (rows) => { rows[1][5] = '9'; rows[1][6] = '5'; }, /1 <= min <= max <= 10/],
    ['max > 10', (rows) => { rows[1][6] = '11'; }, /1 <= min <= max <= 10/],
    ['min < 1', (rows) => { rows[2][5] = '0'; }, /1 <= min <= max <= 10/],
    ['non-numeric', (rows) => { rows[2][5] = 'x'; }, /1 <= min <= max <= 10/],
    ['unknown id', (rows) => { rows[1][0] = '99'; }, /id 99 is not in golden/],
    ['missing id', (rows) => { rows.pop(); }, /id 2 is in golden.jsonl but missing/],
    ['duplicate id', (rows) => { rows[2][0] = '1'; }, /duplicate id 1/],
  ]) {
    mutate(fn);
    assert.throws(() => importReviewCsv(paths), pattern, name);
    assert.equal(fs.readFileSync(paths.golden, 'utf8'), before, `${name}: golden untouched`);
  }
});

test('parseCsv handles quotes, embedded newlines and CRLF', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x,""y""","l1\nl2"\r\n\r\n'), [['a', 'b'], ['x,"y"', 'l1\nl2']]);
  assert.throws(() => parseCsv('a,"b'), /unterminated/);
});
