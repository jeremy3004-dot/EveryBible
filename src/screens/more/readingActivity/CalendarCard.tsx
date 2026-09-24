import { useEffect, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { parseLocalDateKey } from '../../../services/progress/readingActivity';
import { AppCard, IconButton } from '../../../components/ui';
import {
  buildWeekdayInitials,
  type ReadingActivityGrid,
  type ReadingActivityGridCell,
} from '../readingActivityCalendarModel';
import { CalendarCell } from './CalendarCell';
import { createCalendarStyles } from './calendarStyles';
import { announceForAccessibility } from '../../../utils/a11y';
import { describeCellState, formatMonthTitle } from './readingActivityScreenModel';

/** The month title and arrows, Monday-first weekday headers, the week rows and the legend. */
export function CalendarCard({
  viewDate,
  grid,
  weeks,
  cellLabels,
  dayLabelFormatter,
  selectedDateKey,
  onSelectDay,
  onChangeMonth,
}: {
  viewDate: Date;
  grid: ReadingActivityGrid;
  weeks: Array<Array<ReadingActivityGridCell | null>>;
  cellLabels: Map<string, string>;
  dayLabelFormatter: Intl.DateTimeFormat;
  selectedDateKey: string | null;
  onSelectDay: (dateKey: string) => void;
  onChangeMonth: (delta: number) => void;
}) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t, i18n } = useTranslation();
  const styles = useMemo(() => createCalendarStyles(colors), [colors]);
  const weekdayInitials = useMemo(() => buildWeekdayInitials(i18n.language), [i18n.language]);
  const monthTitle = useMemo(
    () => formatMonthTitle(viewDate, i18n.language),
    [viewDate, i18n.language]
  );

  // The month buttons keep focus while the grid changes beneath them, so the new
  // month is spoken; the first render only sets the baseline.
  const shownMonthRef = useRef(monthTitle);
  useEffect(() => {
    if (shownMonthRef.current === monthTitle) return;
    shownMonthRef.current = monthTitle;
    announceForAccessibility(monthTitle);
  }, [monthTitle]);

  return (
    <AppCard padding={0} style={styles.calendarCard}>
      <View style={styles.calendarHeader}>
        <Text
          accessibilityRole="header"
          style={[styles.monthTitle, displayFont.bold]}
          numberOfLines={2}
        >
          {monthTitle}
        </Text>
        <View style={styles.monthNav}>
          <IconButton
            icon={ChevronLeft}
            size={30}
            iconSize={14}
            onPress={() => onChangeMonth(-1)}
            accessibilityLabel={t('readingActivity.previousMonth')}
          />
          <IconButton
            icon={ChevronRight}
            size={30}
            iconSize={14}
            onPress={() => onChangeMonth(1)}
            accessibilityLabel={t('readingActivity.nextMonth')}
          />
        </View>
      </View>

      <View style={styles.weekdayRow}>
        {weekdayInitials.map((initial, index) => (
          <Text key={`weekday-${index}`} style={[styles.weekday, displayFont.regular]}>
            {initial}
          </Text>
        ))}
      </View>

      <View testID="reading-activity-calendar" style={styles.grid}>
        {weeks.map((week) => (
          <View key={week[0]?.dateKey} style={styles.week}>
            {week.map((cell, column) =>
              cell ? (
                <CalendarCell
                  key={cell.dateKey}
                  cell={cell}
                  isSelected={cell.dateKey === selectedDateKey}
                  colors={colors}
                  styles={styles}
                  label={
                    cellLabels.get(cell.dateKey) ??
                    dayLabelFormatter.format(parseLocalDateKey(cell.dateKey))
                  }
                  stateLabel={describeCellState(cell, t)}
                  onSelect={onSelectDay}
                />
              ) : (
                <View key={`blank-${column}`} style={styles.cellSlot} />
              )
            )}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <View style={[styles.legendSwatch, { backgroundColor: colors.accentPrimary }]} />
        <Text style={[styles.legendLabel, displayFont.regular]}>
          {t('readingActivity.legendRead')}
        </Text>
        <View style={[styles.legendSwatch, styles.legendSwatchToday, styles.legendSpacer]} />
        <Text style={[styles.legendLabel, displayFont.regular]}>
          {t('readingActivity.legendToday')}
        </Text>
        <Text style={[styles.legendProgress, displayFont.regular]}>
          {t('readingActivity.legendProgress', { read: grid.readDays, count: grid.elapsedDays })}
        </Text>
      </View>
    </AppCard>
  );
}
