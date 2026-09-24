import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_LEDGER_DENSE_GAP,
  PLAN_LEDGER_ROOMY_GAP,
  getPlanLedgerGridMetrics,
  getPlanLedgerGridRows,
} from './planLedgerGridModel';

const days = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

// A ~400pt phone (iPhone 17 Pro, 402pt) leaves the progress card 318pt inside
// its screen and card padding; a 375pt phone leaves 291pt.
const PHONE_GRID_WIDTH = 318;
const SMALL_PHONE_GRID_WIDTH = 291;

/** The height the grid draws at, given its columns fill the width exactly. */
function gridHeight(totalDays: number, width: number): number {
  const { columns, gap } = getPlanLedgerGridMetrics(totalDays, width);
  const dot = (width - gap * (columns - 1)) / columns;
  const rows = Math.ceil(totalDays / columns);
  return rows * dot + (rows - 1) * gap;
}

// The old grid was sixteen big squares a row: a 365-day plan stood 23 rows and
// ~456pt tall, a whole phone screen before Today. It is now a dot heatmap.
test('a 365-day plan on a ~400pt phone packs into 29 columns and 13 rows of ~8pt dots', () => {
  const { columns, gap, density } = getPlanLedgerGridMetrics(365, PHONE_GRID_WIDTH);
  const rows = getPlanLedgerGridRows(days(365), columns);

  assert.deepEqual(
    { columns, gap, density },
    { columns: 29, gap: PLAN_LEDGER_DENSE_GAP, density: 'dense' }
  );
  assert.equal(rows.length, 13);
  const dot = (PHONE_GRID_WIDTH - gap * (columns - 1)) / columns;
  assert.ok(dot >= 7 && dot <= 9, `dot should be 7-9pt, was ${dot}`);
});

test('a 365-day grid stands about a third of the old 456pt grid', () => {
  const height = gridHeight(365, PHONE_GRID_WIDTH);
  assert.ok(height <= 456 / 3 + 5, `grid should be ~152pt or less, was ${height}`);
  assert.ok(gridHeight(365, SMALL_PHONE_GRID_WIDTH) <= 170);
});

test('columns follow the available width', () => {
  assert.equal(getPlanLedgerGridMetrics(365, SMALL_PHONE_GRID_WIDTH).columns, 26);
  assert.ok(getPlanLedgerGridMetrics(365, 700).columns > 29);
});

test('a short plan keeps larger dots in fewer columns', () => {
  const { columns, gap, density } = getPlanLedgerGridMetrics(31, PHONE_GRID_WIDTH);
  const rows = getPlanLedgerGridRows(days(31), columns);

  assert.deepEqual(
    { columns, gap, density },
    { columns: 17, gap: PLAN_LEDGER_ROOMY_GAP, density: 'roomy' }
  );
  assert.equal(rows.length, 2);
  const dot = (PHONE_GRID_WIDTH - gap * (columns - 1)) / columns;
  assert.ok(dot >= 12, `short-plan dots should stay large, was ${dot}`);
  assert.ok(gridHeight(31, PHONE_GRID_WIDTH) < 40);
});

test('sixty days is still a short plan; sixty-one is dense', () => {
  assert.equal(getPlanLedgerGridMetrics(60, PHONE_GRID_WIDTH).density, 'roomy');
  assert.equal(getPlanLedgerGridMetrics(61, PHONE_GRID_WIDTH).density, 'dense');
});

test('a plan with no days draws no rows, and a width too narrow still gets one column', () => {
  const { columns } = getPlanLedgerGridMetrics(0, PHONE_GRID_WIDTH);
  assert.deepEqual(getPlanLedgerGridRows([], columns), []);
  assert.equal(getPlanLedgerGridMetrics(365, 0).columns, 1);
});

// The progress card used to measure its own width before drawing any square, so
// its first frame had no grid at all and the grid then pushed Today and the
// ledger down under the reader's finger. Laying the grid out as full rows needs
// no measurement: every row already has its final height on frame one.
test('the last row is padded with empty slots so its dots match the rows above', () => {
  const rows = getPlanLedgerGridRows(days(365), 29);
  const lastRow = rows[rows.length - 1];

  assert.ok(rows.every((row) => row.length === 29));
  assert.deepEqual(lastRow, [...days(365).slice(348), ...Array(12).fill(null)]);
  assert.deepEqual(
    rows.flat().filter((day) => day !== null),
    days(365)
  );
});

test('a 31-day plan pads its second row', () => {
  const rows = getPlanLedgerGridRows(days(31), 17);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], days(17));
  assert.deepEqual(rows[1], [...days(31).slice(17), null, null, null]);
});

test('a plan that fills its rows exactly gets no padding', () => {
  assert.deepEqual(getPlanLedgerGridRows(days(32), 16), [days(16), days(32).slice(16)]);
});
