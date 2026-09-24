// Kept free of react-native imports so the node test runner can load it.
import type { ThemeColors } from '../../contexts/ThemeContext';
import {
  isCalendarDayOfMonthPlan,
  type ReadingPlanLedgerDayState,
} from '../../services/plans/readingPlanModel';
import type { ReadingPlan } from '../../services/plans/types';

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

/**
 * How many day dots the plan card draws. A day-of-month plan (Proverbs) is
 * advertised as 31 days, but this month may be shorter; drawing day 31 in
 * September left a dot for a date that does not exist, which the ledger rows
 * below already leave out.
 */
export function getPlanLedgerGridDayCount(
  plan: Pick<ReadingPlan, 'duration_days' | 'scheduleMode'>,
  today: Date
): number {
  if (!isCalendarDayOfMonthPlan(plan)) {
    return plan.duration_days;
  }
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return Math.min(plan.duration_days, daysInMonth);
}

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

/** The theme tokens a plan-day dot is painted from. */
export type PlanLedgerDotTokens = Pick<
  ThemeColors,
  'accentPrimary' | 'warning' | 'warningSoft' | 'muted' | 'controlBorder'
>;

export interface PlanLedgerDotPaint {
  fill: string;
  /** The ring, when the state draws one; `null` for a solid dot. */
  border: string | null;
  borderWidth: number;
  /** A diagonal stroke across the dot, drawn in the border colour. */
  slash: boolean;
}

/**
 * How each day state is painted. The dots sit on the progress card, and each
 * state is told apart by shape as well as colour (WCAG 1.4.1): done is solid,
 * today is a thick accent ring, missed is a tinted dot in an amber ring struck
 * through with an amber diagonal, future is a thin neutral ring around an
 * un-tinted well. Missed and future share the thin ring, so the stroke is what
 * separates them without colour. Every mark clears 3:1 on the card (WCAG
 * 1.4.11), which is why the future ring is `controlBorder` rather than a
 * decorative separator tone.
 */
export function getPlanLedgerDotPaint(
  colors: PlanLedgerDotTokens
): Record<ReadingPlanLedgerDayState, PlanLedgerDotPaint> {
  return {
    done: { fill: colors.accentPrimary, border: null, borderWidth: 0, slash: false },
    missed: { fill: colors.warningSoft, border: colors.warning, borderWidth: 1, slash: true },
    today: { fill: 'transparent', border: colors.accentPrimary, borderWidth: 2, slash: false },
    future: { fill: colors.muted, border: colors.controlBorder, borderWidth: 1, slash: false },
  };
}
