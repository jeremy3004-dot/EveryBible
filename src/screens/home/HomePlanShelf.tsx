import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { PressableScale } from '../../components/ui/PressableScale';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../design/largeTextLayout';
import { radius, spacing, typography } from '../../design/system';
import { useDisplayFont } from '../../hooks/useDisplayFont';
import { useLargeText } from '../../hooks/useLargeText';
import { hexWithAlpha } from '../../utils/color';
import { PlanCover } from '../plans/plansHome/PlanCover';
import { formatPlanCadenceLabel } from '../plans/plansHome/plansHomeModel';
import type { HomePlanShelf as HomePlanShelfData, HomePlanShelfItem } from './homePlanShelfModel';

// The covers are 4:3 plates; a card a little wider than a third of the screen
// shows two whole and the edge of a third, which is what says "swipe".
const CARD_WIDTH = 148;
// At accessibility sizes a 148pt title is a word per line; wider cards swipe instead.
const LARGE_TEXT_CARD_WIDTH = 208;
const COVER_ASPECT = 4 / 3;
const TRACK_HEIGHT = 3;

interface HomePlanShelfProps {
  shelf: HomePlanShelfData;
  /** The sheet's side padding; the row bleeds through it to the screen edges. */
  gutter: number;
  onOpenPlan: (planId: string) => void;
  onBrowsePlans: () => void;
}

/**
 * The reader's plans as a swipeable row of their cover art under the reading
 * card, or a few suggestions to start with when they have joined none.
 */
export function HomePlanShelf({ shelf, gutter, onOpenPlan, onBrowsePlans }: HomePlanShelfProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const displayFont = useDisplayFont();
  const { isLargeText } = useLargeText();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cardWidth = isLargeText ? LARGE_TEXT_CARD_WIDTH : CARD_WIDTH;
  const heading = shelf.kind === 'mine' ? t('readingPlans.myPlans') : t('readingPlans.findPlans');

  const renderCard = ({ plan, progress, dayNumber, totalDays, fraction }: HomePlanShelfItem) => {
    const title = t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key });
    // Joined plans say where you are; suggestions say what they ask of you.
    const meta = progress
      ? t('readingPlans.dayOf', { current: dayNumber, total: totalDays })
      : (formatPlanCadenceLabel(plan, t) ??
        t('readingPlans.daysCount', { count: plan.duration_days }));

    return (
      <PressableScale
        key={plan.id}
        pressEffect="translate"
        haptic="light"
        onPress={() => onOpenPlan(plan.id)}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityValue={{ text: meta }}
        style={[styles.card, { width: cardWidth }]}
      >
        <View style={styles.coverFrame}>
          <PlanCover plan={plan} colors={colors} t={t} initialSize={36} />
        </View>
        <Text style={styles.title} numberOfLines={isLargeText ? 3 : 2}>
          {title}
        </Text>
        <Text
          maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
          style={[styles.meta, displayFont.regular]}
          numberOfLines={isLargeText ? 2 : 1}
        >
          {meta}
        </Text>
        {progress ? (
          <View style={styles.track}>
            <View
              testID="plan-shelf-progress"
              style={[
                styles.trackFill,
                { width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` },
              ]}
            />
          </View>
        ) : null}
      </PressableScale>
    );
  };

  return (
    <View style={styles.section}>
      <PressableScale
        pressEffect="translate"
        onPress={onBrowsePlans}
        accessibilityRole="button"
        accessibilityLabel={heading}
        style={styles.header}
      >
        <Text
          maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
          style={[styles.heading, displayFont.bold]}
          numberOfLines={1}
        >
          {heading}
        </Text>
        <ChevronRight size={18} color={colors.secondaryText} strokeWidth={2} />
      </PressableScale>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -gutter }}
        contentContainerStyle={[styles.row, { paddingHorizontal: gutter }]}
        decelerationRate="fast"
        snapToInterval={cardWidth + spacing.md}
        snapToAlignment="start"
      >
        {shelf.items.map(renderCard)}
        {/* Someone with a single plan still sees a full row, and a way to add one. */}
        {shelf.kind === 'mine' ? (
          <PressableScale
            pressEffect="translate"
            haptic="light"
            onPress={onBrowsePlans}
            accessibilityRole="button"
            accessibilityLabel={t('readingPlans.findPlans')}
            style={[styles.card, { width: cardWidth }]}
          >
            <View style={[styles.coverFrame, styles.findFrame]}>
              <Plus size={26} color={colors.accentPrimary} strokeWidth={1.75} />
            </View>
            <Text style={styles.title} numberOfLines={2}>
              {t('readingPlans.findPlans')}
            </Text>
          </PressableScale>
        ) : null}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: {
      gap: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: spacing.xs,
      paddingTop: spacing.sm,
    },
    heading: {
      ...typography.sectionHeading,
      color: colors.primaryText,
      flexShrink: 1,
    },
    row: {
      gap: spacing.md,
    },
    card: {
      gap: spacing.xs,
    },
    coverFrame: {
      width: '100%',
      aspectRatio: COVER_ASPECT,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      overflow: 'hidden',
      backgroundColor: colors.muted,
      marginBottom: spacing.xs,
    },
    findFrame: {
      alignItems: 'center',
      justifyContent: 'center',
      borderStyle: 'dashed',
      borderColor: hexWithAlpha(colors.primaryText, 0.24),
      backgroundColor: 'transparent',
    },
    title: {
      ...typography.bodyStrong,
      fontSize: 14,
      lineHeight: 18,
      color: colors.primaryText,
    },
    meta: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
    track: {
      height: TRACK_HEIGHT,
      borderRadius: TRACK_HEIGHT / 2,
      marginTop: spacing.xs,
      overflow: 'hidden',
      backgroundColor: hexWithAlpha(colors.primaryText, 0.12),
    },
    trackFill: {
      height: '100%',
      backgroundColor: colors.accentPrimary,
    },
  });
