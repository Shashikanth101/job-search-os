import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { COMPANY_TIERS_PATH, companyKeys, createTierLookup, loadCompanyTiers } from '../src/config/company-tiers.js';
import { orderCompanyGroups } from '../src/review-query.js';

const row = (id, company, score, day = 1) => ({ id, company, score, found_at: `2026-10-${String(day).padStart(2, '0')} 10:00:00` });

test('tier lookup is case-insensitive and alias-aware; unlisted companies are tier 5 (lowest); the best tier wins', () => {
  const tierOf = createTierLookup({ tier1: ['Shopify', 'Anysphere (Cursor)'], tier2: ['Scale AI', 'Postman', 'Shopify'], tier3: ['Zoom'], tier4: ['Okta'], tier5: ['Oracle'] });
  assert.equal(tierOf('shopify'), 1);
  assert.equal(tierOf('SHOPIFY INC.'), 1);
  assert.equal(tierOf('Cursor'), 1, 'a parenthetical alias matches');
  assert.equal(tierOf('Anysphere'), 1);
  assert.equal(tierOf('Anysphere (Cursor)'), 1);
  assert.equal(tierOf('Scale'), 2, 'generic suffix words are ignored');
  assert.equal(tierOf('Postman Technologies'), 2);
  assert.equal(tierOf('Zoom'), 3);
  assert.equal(tierOf('Okta'), 4);
  assert.equal(tierOf('Oracle'), 5);
  assert.equal(tierOf('Totally Unknown Co'), 5);
  assert.equal(tierOf(''), 5);
  assert.ok(['anysphere', 'cursor'].every((key) => companyKeys('Anysphere (Cursor)').includes(key)));
});

test('company groups are ordered by tier, then best score, then job count, then name; jobs inside by score then newest', () => {
  const tiers = { Gold: 1, Zed: 2, Beta: 2, Alpha: 2, Many: 2, Mid: 4, Low: 5 };
  const rows = [
    row(1, 'Low', 10), row(2, 'Low', 10, 2),               // tier 5, best 10: after every higher tier
    row(12, 'Mid', 10),                                     // tier 4: after tier 2, before tier 5
    row(3, 'Alpha', 8), row(4, 'Alpha', 6),                 // tier 2, best 8, 2 jobs
    row(5, 'Beta', 8), row(6, 'Beta', 7), row(7, 'Beta', 5), // tier 2, best 8, 3 jobs: ahead of Alpha on count
    row(8, 'Zed', 9),                                       // tier 2, best 9: ahead of both
    row(9, 'Many', 8), row(10, 'Many', 6),                  // tier 2, best 8, 2 jobs: ties Alpha, name decides
    row(11, 'Gold', 2),                                     // tier 1, worst score: still first
  ];
  const { ids, groups } = orderCompanyGroups(rows, (company) => tiers[company] ?? 5);
  assert.deepEqual(groups.map((group) => group.key), ['Gold', 'Zed', 'Beta', 'Alpha', 'Many', 'Mid', 'Low']);
  assert.deepEqual(groups.map((group) => [group.tier, group.bestScore, group.count]), [[1, 2, 1], [2, 9, 1], [2, 8, 3], [2, 8, 2], [2, 8, 2], [4, 10, 1], [5, 10, 2]]);
  assert.deepEqual(ids, [11, 8, 5, 6, 7, 3, 4, 9, 10, 12, 2, 1], 'inside Low: equal scores, newest first');
  assert.deepEqual(orderCompanyGroups([], () => 5), { ids: [], groups: [] });
  const unranked = orderCompanyGroups([row(1, 'B', null), row(2, 'A', null)], () => 5);
  assert.deepEqual(unranked.groups.map((group) => [group.key, group.bestScore]), [['A', null], ['B', null]], 'unranked companies fall back to name order');
  assert.equal(orderCompanyGroups([row(1, 'a', 5), row(2, 'B', 5)], () => 5).groups[0].key, 'a', 'name order ignores case');
});

test('company-tiers.json is valid, seeded, and loads; malformed files are rejected', () => {
  const parsed = JSON.parse(fs.readFileSync(COMPANY_TIERS_PATH, 'utf8'));
  for (const tier of ['tier1', 'tier2', 'tier3', 'tier4', 'tier5']) assert.ok(Array.isArray(parsed[tier]) && parsed[tier].length > 0, tier);
  const tierOf = loadCompanyTiers();
  assert.equal(tierOf('Shopify'), 1);
  assert.equal(tierOf('Anysphere (Cursor)'), 1);
  assert.equal(tierOf('Glean'), 2);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiers-'));
  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, '{"tier1": "nope"}');
  assert.throws(() => loadCompanyTiers(bad), /tier1 must be an array/);
  fs.writeFileSync(bad, '{oops');
  assert.throws(() => loadCompanyTiers(bad), /not valid JSON/);
  assert.equal(loadCompanyTiers(path.join(dir, 'missing.json'))('Anything'), 5);
  fs.rmSync(dir, { recursive: true, force: true });
});
