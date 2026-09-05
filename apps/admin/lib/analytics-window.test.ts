import assert from 'node:assert/strict';
import test from 'node:test';
import { analyticsWindowStart } from './analytics-window';

test('seven days includes today across month boundaries and local time zones', () => {
  assert.equal(analyticsWindowStart(7, new Date('2026-09-05T00:00:00Z')), '2026-08-30T00:00:00.000Z');
  assert.equal(analyticsWindowStart(7, new Date('2026-09-05T23:59:59Z')), '2026-08-30T00:00:00.000Z');
});
