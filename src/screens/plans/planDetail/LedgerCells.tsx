import { useMemo } from 'react';
import { StyleSheet, View, type ViewStyle, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../../../contexts/ThemeContext';
import { layout, motion, radius, spacing } from '../../../design/system';
import type { ReadingPlanLedgerDayState } from '../../../services/plans/readingPlanModel';
import {
  PLAN_LEDGER_DENSE_GAP,
  PLAN_LEDGER_ROOMY_GAP,
  getPlanLedgerDotPaint,
  getPlanLedgerGridMetrics,
  getPlanLedgerGridRows,
  type PlanLedgerDotPaint,
} from '../planLedgerGridModel';

/**
 * Dot ledger: one dot per plan day, as many to a row as fit the card. The grid
 * sits inside the header's screen padding and the progress card's padding.
 */
const LEDGER_GRID_HORIZONTAL_INSET = 2 * (layout.screenPadding + layout.cardPaddingWide);
/** Last cell starts drawing in by here, so the whole grid lands inside 1.5s. */
const LEDGER_DRAW_IN_MAX_DELAY = 1350;
const LEDGER_DRAW_IN_STEP = 30;

/** Dot ledger — one dot per plan day, a GitHub-style heatmap. */
export function LedgerCells({ states }: { states: ReadingPlanLedgerDayState[] }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();

  // Columns come from the window width, which is right on the first frame, and
  // the dots flex to fill full rows: measuring the card first meant its first
  // frame had no grid, and the grid then landed a frame later and shoved Today
  // and the ledger under the reader's tap.
  const { columns, density } = getPlanLedgerGridMetrics(
    states.length,
    windowWidth - LEDGER_GRID_HORIZONTAL_INSET
  );
  const rows = useMemo(() => getPlanLedgerGridRows(states, columns), [states, columns]);
  const isDense = density === 'dense';

  const palette = useMemo(() => {
    const paint = getPlanLedgerDotPaint(colors);
    const toStyle = ({ fill, border, borderWidth }: PlanLedgerDotPaint): ViewStyle =>
      border
        ? { backgroundColor: fill, borderWidth, borderColor: border }
        : { backgroundColor: fill };
    return {
      done: toStyle(paint.done),
      missed: toStyle(paint.missed),
      today: toStyle(paint.today),
      future: toStyle(paint.future),
    } satisfies Record<ReadingPlanLedgerDayState, ViewStyle>;
  }, [colors]);

  return (
    <View
      style={[styles.grid, isDense ? styles.denseGap : styles.roomyGap]}
      // The card's heading row already says this in words; the dots are a
      // picture of it, so screen readers should not walk 365 of them.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.row, isDense ? styles.denseGap : styles.roomyGap]}>
          {row.map((state, columnIndex) => {
            const index = rowIndex * columns + columnIndex;
            if (state === null) {
              return <View key={`empty-${index}`} style={styles.cell} />;
            }
            return (
              <Animated.View
                key={`${state}-${index}`}
                entering={
                  reduceMotion
                    ? undefined
                    : FadeIn.duration(motion.duration.fast).delay(
                        Math.min(index * LEDGER_DRAW_IN_STEP, LEDGER_DRAW_IN_MAX_DELAY)
                      )
                }
                style={[
                  styles.cell,
                  palette[state],
                  // An 8pt ring is small; let today's swell into the gap so it
                  // still reads as the marker without changing the row height.
                  state === 'today' && isDense ? styles.denseToday : null,
                ]}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    marginTop: spacing.lg,
  },
  row: {
    flexDirection: 'row',
  },
  denseGap: {
    gap: PLAN_LEDGER_DENSE_GAP,
  },
  roomyGap: {
    gap: PLAN_LEDGER_ROOMY_GAP,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.pill,
  },
  denseToday: {
    transform: [{ scale: 1.25 }],
  },
});
