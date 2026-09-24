// Kept free of react-native imports so the node test runner can load it.

/**
 * The plan card's day grid is a GitHub-style dot heatmap. A long plan packs
 * small dots into many columns so a year stands ~140pt tall rather than a whole
 * screen; a short plan (a 31-day book study) keeps larger dots it can afford.
 */
export type PlanLedgerGridDensity = 'dense' | 'roomy';

/** Plans up to this many days keep the larger, roomier dots. */
export const PLAN_LEDGER_SHORT_PLAN_MAX_DAYS = 60;
export const PLAN_LEDGER_DENSE_DOT = 8;
export const PLAN_LEDGER_DENSE_GAP = 3;
export const PLAN_LEDGER_ROOMY_DOT = 14;
export const PLAN_LEDGER_ROOMY_GAP = 4;

export interface PlanLedgerGridMetrics {
  columns: number;
  gap: number;
  density: PlanLedgerGridDensity;
}

/**
 * How many dots fit across `availableWidth` at the plan's target dot size. The
 * dots themselves flex to fill each row, so the width only has to be a good
 * estimate (the window width less the screen and card padding): it is known on
 * the first frame, and a slightly-off estimate changes a dot by a fraction of a
 * point rather than moving anything below the card.
 */
export function getPlanLedgerGridMetrics(
  totalDays: number,
  availableWidth: number
): PlanLedgerGridMetrics {
  const density: PlanLedgerGridDensity =
    totalDays <= PLAN_LEDGER_SHORT_PLAN_MAX_DAYS ? 'roomy' : 'dense';
  const dot = density === 'roomy' ? PLAN_LEDGER_ROOMY_DOT : PLAN_LEDGER_DENSE_DOT;
  const gap = density === 'roomy' ? PLAN_LEDGER_ROOMY_GAP : PLAN_LEDGER_DENSE_GAP;
  const columns = Math.max(1, Math.floor((Math.max(0, availableWidth) + gap) / (dot + gap)));
  return { columns, gap, density };
}

/**
 * Splits the plan card's day dots into rows of `columns`, padding the last row
 * with `null` slots. Every row then spans the card's full width, so each dot
 * can size itself with flex + aspectRatio and the grid has its final height on
 * the first frame, with no width measurement that lands a frame late.
 */
export function getPlanLedgerGridRows<T>(items: readonly T[], columns: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let start = 0; start < items.length; start += columns) {
    const row: (T | null)[] = items.slice(start, start + columns);
    while (row.length < columns) {
      row.push(null);
    }
    rows.push(row);
  }
  return rows;
}
