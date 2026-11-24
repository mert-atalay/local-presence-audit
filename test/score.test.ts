import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { overallScore, prioritiseFixes, statusFor, WEIGHTS } from '../src/score.js';
import type { CheckId, CheckResult, Fix } from '../src/types.js';

const check = (id: CheckId, score: number | null, fixes: Fix[] = []): CheckResult => ({
  id,
  title: id,
  score,
  status: statusFor(score),
  summary: '',
  details: [],
  fixes,
});

describe('scoring', () => {
  it('weights add up to 100', () => {
    assert.equal(Object.values(WEIGHTS).reduce((sum, weight) => sum + weight, 0), 100);
  });
  it('maps scores to statuses at 80 and 50', () => {
    assert.deepEqual([100, 80, 79, 50, 49, 0].map(statusFor), ['pass', 'pass', 'warn', 'warn', 'fail', 'fail']);
    assert.equal(statusFor(null), 'skipped');
  });
  it('takes the weighted mean', () => {
    assert.equal(overallScore([check('completeness', 100), check('recency', 0)]), 71); // 2500 / 35
    assert.equal(overallScore([check('completeness', 60), check('reputation', 60), check('hours', 60)]), 60);
  });
  it('leaves skipped checks out and re-weights the rest', () => {
    assert.equal(overallScore([check('completeness', 80), check('website', null), check('competitors', null)]), 80);
  });
  it('returns null when nothing ran', () => {
    assert.equal(overallScore([]), null);
    assert.equal(overallScore([check('website', null)]), null);
  });
  it('orders fixes by priority, then by check weight, keeping order inside a check', () => {
    const fixes = prioritiseFixes([
      check('recency', 10, [{ priority: 'high', text: 'r-high' }]),
      check('hours', 50, [{ priority: 'low', text: 'h-low' }, { priority: 'medium', text: 'h-med' }]),
      check('completeness', 40, [{ priority: 'medium', text: 'c-med' }, { priority: 'high', text: 'c-high-1' }, { priority: 'high', text: 'c-high-2' }]),
    ]);
    assert.deepEqual(fixes.map((fix) => fix.text), ['c-high-1', 'c-high-2', 'r-high', 'c-med', 'h-med', 'h-low']);
    assert.equal(fixes[0]?.check, 'completeness');
  });
});
