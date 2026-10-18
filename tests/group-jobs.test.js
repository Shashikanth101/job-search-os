import test from 'node:test';
import assert from 'node:assert/strict';
import { groupByCompany, groupByScore, getGroupStats } from '../frontend/src/utils/groupJobs.js';

test('company groups use average displayed scores, deterministic ties and immutable input', () => {
  const jobs = Object.freeze([
    Object.freeze({ id: 1, company: 'Low', relevance_score: 10, company_score: 10 }),
    Object.freeze({ id: 2, company: 'High', relevance_score: '8' }),
    Object.freeze({ id: 3, company: 'Low', relevance_score: 2 }),
    Object.freeze({ id: 4, company: 'Another high', relevance_score: 8 }),
    Object.freeze({ id: 5, company: 'Unscored', relevance_score: null }),
  ]);
  const groups = groupByCompany(jobs);
  assert.deepEqual(groups.map((group) => [group.label, group.averageScore]), [['Another high', 8], ['High', 8], ['Low', 6], ['Unscored', null]]);
  assert.deepEqual(groups[2].jobs.map((job) => job.id), [1, 3]);
  assert.equal(jobs[0].id, 1);
});

test('score groups sort numerically descending, retain fractions and separate zero from unscored', () => {
  const jobs = [0, '10', 8.5, 2, null, undefined, '10'].map((relevance_score, id) => ({ id, relevance_score }));
  const groups = groupByScore(jobs);
  assert.deepEqual(groups.map((group) => group.label), ['Score: 10', 'Score: 8.5', 'Score: 2', 'Score: 0', 'Not ranked yet']);
  assert.deepEqual(groups[0].jobs.map((job) => job.id), [1, 6]);
  assert.deepEqual(groupByCompany([]), []);
  assert.deepEqual(groupByScore([]), []);
});

test('stats count applied and in_process together and missing status as pending', () => {
  assert.deepEqual(getGroupStats(['applied', 'in_process', 'not_applied', undefined, 'closed'].map((status) => ({ status }))), {
    applied: 2, pending: 2, closed: 1,
  });
});
