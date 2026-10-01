import test from 'node:test';
import assert from 'node:assert/strict';
import type { TFunction } from 'i18next';
import { formatRelativeTime } from './interfaceFormatting';

const t = ((key: string, options?: { count?: number }) =>
  options?.count === undefined ? key : `${key}:${options.count}`) as unknown as TFunction;
const NOW = Date.UTC(2026, 9, 1, 12);
const ago = (ms: number) => new Date(NOW - ms).toISOString();

test('relative time picks the largest whole unit', () => {
  assert.equal(formatRelativeTime(ago(30_000), t, NOW), 'interface.justNow');
  assert.equal(formatRelativeTime(ago(5 * 60_000), t, NOW), 'interface.minutesAgo:5');
  assert.equal(formatRelativeTime(ago(3 * 3_600_000), t, NOW), 'interface.hoursAgo:3');
  assert.equal(formatRelativeTime(ago(50 * 3_600_000), t, NOW), 'interface.daysAgo:2');
});

test('an unparsable timestamp reads as just now instead of "NaN days ago"', () => {
  assert.equal(formatRelativeTime('not a date', t, NOW), 'interface.justNow');
  assert.equal(formatRelativeTime('', t, NOW), 'interface.justNow');
});
