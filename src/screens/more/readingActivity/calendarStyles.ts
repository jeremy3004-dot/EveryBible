import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../design/system';

const CELL_GAP = spacing.sm - 2; // 6pt gutter between calendar squares
const CELL_RADIUS = radius.sm; // 6
const SELECTED_RING_GAP = 2;
const SELECTED_RING_WIDTH = 1.5;
const TODAY_BORDER_WIDTH = 1.5;
const LEGEND_SWATCH = 12;
const LEADING_DAY_OPACITY = 0.4;

/** The calendar card's styles, built once per theme and shared with every cell. */
export const createCalendarStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    calendarCard: {
      paddingTop: 14,
      paddingHorizontal: layout.cardPadding,
      paddingBottom: layout.cardPadding,
      marginBottom: layout.cardGap,
    },
    calendarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    monthTitle: {
      ...typography.sectionHeading,
      color: colors.primaryText,
      flexShrink: 1,
    },
    monthNav: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    weekdayRow: {
      flexDirection: 'row',
      gap: CELL_GAP,
      marginBottom: spacing.sm,
    },
    weekday: {
      flex: 1,
      ...typography.eyebrow,
      letterSpacing: 0,
      color: colors.secondaryText,
      textAlign: 'center',
    },
    grid: {
      gap: CELL_GAP,
    },
    week: {
      flexDirection: 'row',
      gap: CELL_GAP,
    },
    // A seventh of the week row, square.
    cellSlot: {
      flex: 1,
      aspectRatio: 1,
      alignItems: 'stretch',
      justifyContent: 'center',
    },
    cellLeading: {
      opacity: LEADING_DAY_OPACITY,
    },
    cell: {
      flex: 1,
      borderRadius: CELL_RADIUS,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellToday: {
      borderWidth: TODAY_BORDER_WIDTH,
      borderStyle: 'dashed',
    },
    cellLabel: {
      ...typography.mono,
      letterSpacing: 0,
    },
    selectionInnerRing: {
      position: 'absolute',
      top: -SELECTED_RING_GAP,
      left: -SELECTED_RING_GAP,
      right: -SELECTED_RING_GAP,
      bottom: -SELECTED_RING_GAP,
      borderWidth: SELECTED_RING_GAP,
      borderRadius: CELL_RADIUS + SELECTED_RING_GAP,
    },
    selectionOuterRing: {
      position: 'absolute',
      top: -(SELECTED_RING_GAP * 2),
      left: -(SELECTED_RING_GAP * 2),
      right: -(SELECTED_RING_GAP * 2),
      bottom: -(SELECTED_RING_GAP * 2),
      borderWidth: SELECTED_RING_WIDTH,
      borderRadius: CELL_RADIUS + SELECTED_RING_GAP * 2,
    },
    // Wraps so the "N of M days" count moves to its own line at large text sizes instead of
    // running off the card.
    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: layout.cardPadding,
    },
    legendSwatch: {
      width: LEGEND_SWATCH,
      height: LEGEND_SWATCH,
      borderRadius: radius.xs,
    },
    legendSwatchToday: {
      borderWidth: TODAY_BORDER_WIDTH,
      borderStyle: 'dashed',
      borderColor: colors.accentPrimary,
    },
    legendSpacer: {
      marginLeft: spacing.sm,
    },
    legendLabel: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
    legendProgress: {
      ...typography.eyebrow,
      color: colors.secondaryText,
      marginLeft: 'auto',
      flexShrink: 1,
      textAlign: 'right',
    },
  });

export type CalendarStyles = ReturnType<typeof createCalendarStyles>;
