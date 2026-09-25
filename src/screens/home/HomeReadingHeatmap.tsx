import { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { hexWithAlpha } from '../../utils/color';
import { spacing, typography } from '../../design/system';
import {
  HEATMAP_GAP,
  buildHomeReadingHeatmap,
  getHeatmapWeekCount,
  type HomeHeatmapActivity,
  type HomeHeatmapLevel,
} from './homeReadingHeatmapModel';

/** Before the first layout pass: what a typical phone fits, so the grid rarely reflows. */
const INITIAL_WEEK_COUNT = 15;
const SQUARE_RADIUS = 3;
const LEGEND_SQUARE = 10;
const LEVELS: HomeHeatmapLevel[] = [0, 1, 2, 3];

interface HomeReadingHeatmapProps {
  activity: HomeHeatmapActivity;
  /** Local "now"; Home advances it at midnight and on return to the foreground. */
  nowMs: number;
  onPress: () => void;
}

/**
 * One square per day for the last few months, darker the more chapters were
 * read or heard. A day without reading is a rest, not a failure: empty squares
 * stay in the soft paper tone rather than a warning colour.
 */
function HomeReadingHeatmapComponent({ activity, nowMs, onPress }: HomeReadingHeatmapProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const [weekCount, setWeekCount] = useState(INITIAL_WEEK_COUNT);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setWeekCount(getHeatmapWeekCount(event.nativeEvent.layout.width));
  }, []);

  const heatmap = useMemo(
    () => buildHomeReadingHeatmap(activity, weekCount, new Date(nowMs)),
    [activity, nowMs, weekCount]
  );

  // Every shade comes from the active palette's accent, so the grid follows the
  // appearance palette and light/dark scope. On the dark card `muted` is almost
  // the card itself, so the empty square steps up to the border tone there.
  const levelColors = useMemo(
    () => [
      isDark ? colors.borderStrong : colors.muted,
      hexWithAlpha(colors.accentPrimary, 0.35),
      hexWithAlpha(colors.accentPrimary, 0.65),
      colors.accentPrimary,
    ],
    [colors.accentPrimary, colors.borderStrong, colors.muted, isDark]
  );

  const daysLabel = t('home.heatmapDays', {
    active: heatmap.activeDays,
    count: heatmap.elapsedDays,
  });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t('more.readingActivity')} · ${daysLabel}`}
      accessibilityHint={t('profile.readingActivitySubtitle')}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <View
        style={styles.grid}
        onLayout={handleLayout}
        importantForAccessibility="no-hide-descendants"
      >
        {heatmap.weeks.map((week) => (
          <View key={week[0]?.dateKey} style={styles.week}>
            {week.map((day) => (
              <View
                key={day.dateKey}
                testID={`heatmap-day-${day.dateKey}`}
                style={[
                  styles.square,
                  day.isFuture ? styles.futureSquare : { backgroundColor: levelColors[day.level] },
                  day.isToday && [styles.todaySquare, { borderColor: colors.primaryText }],
                ]}
              />
            ))}
          </View>
        ))}
      </View>

      <View style={styles.footer} importantForAccessibility="no-hide-descendants">
        <Text style={[styles.daysLabel, { color: colors.secondaryText }]} numberOfLines={2}>
          {daysLabel}
        </Text>
        <View style={styles.legend}>
          <Text style={[styles.legendLabel, { color: colors.secondaryText }]}>
            {t('home.heatmapLess')}
          </Text>
          {LEVELS.map((level) => (
            <View
              key={level}
              style={[styles.legendSquare, { backgroundColor: levelColors[level] }]}
            />
          ))}
          <Text style={[styles.legendLabel, { color: colors.secondaryText }]}>
            {t('home.heatmapMore')}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export const HomeReadingHeatmap = memo(HomeReadingHeatmapComponent);

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  // Columns share the width as flex slots: sizing squares from a measured
  // width/count wrapped a column on device in the reading calendar.
  grid: {
    flexDirection: 'row',
    gap: HEATMAP_GAP,
  },
  week: {
    flex: 1,
    gap: HEATMAP_GAP,
  },
  square: {
    aspectRatio: 1,
    borderRadius: SQUARE_RADIUS,
  },
  futureSquare: {
    backgroundColor: 'transparent',
  },
  todaySquare: {
    borderWidth: 1.5,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: spacing.md,
    rowGap: spacing.xs,
  },
  daysLabel: {
    ...typography.caption,
    flexShrink: 1,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  legendLabel: {
    ...typography.caption,
    marginHorizontal: 2,
  },
  legendSquare: {
    width: LEGEND_SQUARE,
    height: LEGEND_SQUARE,
    borderRadius: 2,
  },
});
