import assert from 'node:assert/strict';
import test from 'node:test';
import { totalListeningMinutes } from './listeningTime';

test('listening minutes come from this device when there is no cloud total', () => {
  assert.equal(
    totalListeningMinutes({ '2026-09-23': 4 * 60_000, '2026-09-24': 6 * 60_000 + 59_000 }, null),
    10,
    'whole minutes, summed over every day'
  );
  assert.equal(totalListeningMinutes({}, null), 0);
});

test('a cloud total counts other devices, and this device covers a cloud summary that lags', () => {
  const local = { '2026-09-24': 12 * 60_000 };
  assert.equal(totalListeningMinutes(local, 95), 95);
  // Events still queued for upload, or not yet folded into the summary.
  assert.equal(totalListeningMinutes(local, 0), 12);
});

test('a corrupt day entry never poisons the listening total', () => {
  assert.equal(
    totalListeningMinutes(
      { a: Number.NaN, b: -60_000, c: Number.POSITIVE_INFINITY, d: 2 * 60_000 },
      Number.NaN
    ),
    2
  );
});
