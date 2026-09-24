import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlanLedgerGridRows } from './planLedgerGridModel';

const days = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

// The progress card used to measure its own width before drawing any square, so
// its first frame had no grid at all and the 365-day grid then pushed Today and
// the ledger ~500pt down under the reader's finger. Laying the grid out as full
// rows needs no measurement: every row already has its final height on frame one.
test('a 365-day plan lays out as 23 full-width rows of 16', () => {
  const rows = getPlanLedgerGridRows(days(365), 16);

  assert.equal(rows.length, 23);
  assert.ok(rows.every((row) => row.length === 16));
  assert.deepEqual(
    rows.flat().filter((day) => day !== null),
    days(365)
  );
});

test('the last row is padded with empty slots so its squares match the rows above', () => {
  const rows = getPlanLedgerGridRows(days(365), 16);
  const lastRow = rows[rows.length - 1];

  assert.deepEqual(lastRow, [...days(365).slice(352), null, null, null]);
});

test('a 31-day plan lays out as two rows', () => {
  const rows = getPlanLedgerGridRows(days(31), 16);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], days(16));
  assert.deepEqual(rows[1], [...days(31).slice(16), null]);
});

test('a plan that fills its rows exactly gets no padding', () => {
  assert.deepEqual(getPlanLedgerGridRows(days(32), 16), [days(16), days(32).slice(16)]);
});

test('a plan with no days draws no rows', () => {
  assert.deepEqual(getPlanLedgerGridRows([], 16), []);
});
