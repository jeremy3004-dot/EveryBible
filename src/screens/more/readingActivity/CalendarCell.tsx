import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import type { ReadingActivityGridCell } from '../readingActivityCalendarModel';
import type { CalendarStyles } from './calendarStyles';

interface CalendarCellProps {
  cell: ReadingActivityGridCell;
  isSelected: boolean;
  colors: ThemeColors;
  styles: CalendarStyles;
  label: string;
  stateLabel?: string;
  onSelect: (dateKey: string) => void;
}

// One square. Read days carry the accent fill, today is outlined in a dashed
// accent hairline, everything else is an inert `muted` well. The selection ring
// is drawn as two nested borders bleeding into the 6pt gutter so it never
// changes the cell's own size. Memoised: choosing a day re-renders only the
// cell losing the selection and the one gaining it.
export const CalendarCell = memo(function CalendarCell({
  cell,
  isSelected,
  colors,
  styles,
  label,
  stateLabel,
  onSelect,
}: CalendarCellProps) {
  const isRead = cell.state === 'read';
  const isToday = cell.state === 'today';

  return (
    <Pressable
      onPress={() => onSelect(cell.dateKey)}
      style={[styles.cellSlot, !cell.inMonth && styles.cellLeading]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={stateLabel ? { text: stateLabel } : undefined}
      accessibilityState={{ selected: isSelected }}
    >
      <View
        style={[
          styles.cell,
          {
            backgroundColor: isRead ? colors.accentPrimary : isToday ? 'transparent' : colors.muted,
          },
          isToday && { borderColor: colors.accentPrimary },
          isToday && styles.cellToday,
        ]}
      >
        <Text
          style={[
            styles.cellLabel,
            {
              color: isRead
                ? colors.onAccent
                : isToday
                  ? colors.accentPrimary
                  : colors.textTertiary,
            },
          ]}
        >
          {cell.day}
        </Text>
      </View>
      {isSelected ? (
        <>
          <View
            pointerEvents="none"
            style={[styles.selectionInnerRing, { borderColor: colors.cardBackground }]}
          />
          <View
            pointerEvents="none"
            style={[styles.selectionOuterRing, { borderColor: colors.primaryText }]}
          />
        </>
      ) : null}
    </Pressable>
  );
});
