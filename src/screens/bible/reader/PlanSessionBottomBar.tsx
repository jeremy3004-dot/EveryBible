import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { layout, spacing, typography } from '../../../design/system';
import { getPlanSessionTrailingActionState, getPlanSessionBannerColors } from '../bibleReaderModel';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { PLAN_SESSION_BAR_MAX_FONT_SCALE } from './readerConstants';

export interface PlanSessionBottomBarProps {
  activePlanChapterIndex: number;
  activePlanDayChapterItems: { bookId: string; chapter: number; entryId: string }[];
  activePlanSessionTitle: string | null;
  activePlanTitle: string | null;
  chapterSessionMode: 'listen' | 'read';
  handleCompletePlanDay: () => Promise<void>;
  handleNextListenChapter: () => Promise<void>;
  handlePreviousListenChapter: () => Promise<void>;
  hasNextChapter: boolean;
  hasOtherIncompletePlanSessions: boolean;
  hasPrevChapter: boolean;
  /** The strip has scrolled out with the rest of the reader chrome. */
  isCollapsed: boolean;
  isLastPlanChapter: boolean;
  planDayNumber: number | undefined;
  planSessionBottomBarAnimatedStyle: { transform: { translateY: number }[]; opacity: number };
  rootTabBarBottomPadding: number;
  rootTabBarHeight: number;
  showPlanSessionChrome: boolean;
}

/** The plan session strip above the tab bar: day and chapter progress, previous, and next or complete. */
export function PlanSessionBottomBar({
  activePlanChapterIndex,
  activePlanDayChapterItems,
  activePlanSessionTitle,
  activePlanTitle,
  chapterSessionMode,
  handleCompletePlanDay,
  handleNextListenChapter,
  handlePreviousListenChapter,
  hasNextChapter,
  hasOtherIncompletePlanSessions,
  hasPrevChapter,
  isCollapsed,
  isLastPlanChapter,
  planDayNumber,
  planSessionBottomBarAnimatedStyle,
  rootTabBarBottomPadding,
  rootTabBarHeight,
  showPlanSessionChrome,
}: PlanSessionBottomBarProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (!showPlanSessionChrome || !activePlanTitle || typeof planDayNumber !== 'number') {
    return null;
  }

  const planSessionBottomBarHeight = rootTabBarHeight;
  const showPlanChapterArrows = chapterSessionMode === 'listen';
  const showPlanPreviousChapterButton = hasPrevChapter;
  const trailingActionState = getPlanSessionTrailingActionState({
    isLastPlanChapter,
    hasNextChapter,
  });
  const showPlanCompletionAction = trailingActionState.showCompletionAction;
  const trailingActionEnabled = trailingActionState.isEnabled;
  const showSessionCompletionCopy = hasOtherIncompletePlanSessions;
  const trailingActionLabel = showPlanCompletionAction
    ? showSessionCompletionCopy
      ? t('readingPlans.completeSessionCta', {
          defaultValue: 'Complete session',
        })
      : t('readingPlans.completeDayCta', {
          defaultValue: 'Complete day',
        })
    : t('audio.nextChapter');
  const bannerColors = getPlanSessionBannerColors(colors);
  const trailingActionHint = showPlanCompletionAction
    ? showSessionCompletionCopy
      ? t('readingPlans.completeSessionHint')
      : t('readingPlans.completeDayHint')
    : t('bible.nextChapterHint');

  return (
    <Animated.View
      // Collapsed, the strip is transparent and below the screen edge but still
      // mounted: without this VoiceOver kept landing on (and taps kept hitting)
      // its invisible Previous and Complete day buttons.
      pointerEvents={isCollapsed ? 'none' : 'auto'}
      accessibilityElementsHidden={isCollapsed}
      importantForAccessibility={isCollapsed ? 'no-hide-descendants' : 'auto'}
      style={[
        styles.planSessionBottomBar,
        planSessionBottomBarAnimatedStyle,
        {
          backgroundColor: bannerColors.fill,
          borderTopColor: bannerColors.border,
          // A floor, not a fixed height: the capped labels can still need a
          // few points more than the tab bar's height at the largest sizes.
          minHeight: planSessionBottomBarHeight,
          paddingBottom: rootTabBarBottomPadding + spacing.xs,
        },
      ]}
    >
      <View style={styles.planSessionBottomBarContent}>
        {showPlanChapterArrows ? (
          showPlanPreviousChapterButton ? (
            <TouchableOpacity
              style={[
                styles.planSessionBottomBarArrowButton,
                !hasPrevChapter ? styles.disabledSessionModeButton : null,
              ]}
              activeOpacity={0.85}
              onPress={() => void handlePreviousListenChapter()}
              disabled={!hasPrevChapter}
              accessibilityRole="button"
              // "Previous" alone does not say previous what; the bar also steps days.
              accessibilityLabel={t('audio.previousChapter')}
              accessibilityHint={t('interface.previousChapterHint')}
            >
              <Ionicons
                name="chevron-back"
                size={22}
                color={hasPrevChapter ? bannerColors.icon : bannerColors.disabledIcon}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.planSessionBottomBarArrowSpacer} />
          )
        ) : (
          <View style={styles.planSessionBottomBarArrowSpacer} />
        )}

        <View
          style={[
            styles.planSessionBottomBarCopy,
            showPlanChapterArrows
              ? styles.planSessionBottomBarCopyCentered
              : styles.planSessionBottomBarCopyListenMode,
          ]}
        >
          <Text
            style={[styles.planSessionBottomBarTitle, { color: bannerColors.text }]}
            numberOfLines={1}
            maxFontSizeMultiplier={PLAN_SESSION_BAR_MAX_FONT_SCALE}
          >
            {activePlanTitle}
          </Text>
          <Text
            style={[styles.planSessionBottomBarMeta, { color: bannerColors.text }]}
            maxFontSizeMultiplier={PLAN_SESSION_BAR_MAX_FONT_SCALE}
          >
            {t('readingPlans.dayLabel', {
              day: planDayNumber,
              defaultValue: `Day ${planDayNumber}`,
            })}
            {activePlanSessionTitle ? ` • ${activePlanSessionTitle}` : ''}
            {' • '}
            {t('readingPlans.chapterProgress', {
              current: activePlanChapterIndex + 1,
              total: activePlanDayChapterItems.length,
              defaultValue: `${activePlanChapterIndex + 1} of ${activePlanDayChapterItems.length}`,
            })}
          </Text>
        </View>

        {showPlanChapterArrows ? (
          <TouchableOpacity
            style={[
              styles.planSessionBottomBarArrowButton,
              showPlanCompletionAction
                ? [
                    styles.planSessionBottomBarCompleteButton,
                    { backgroundColor: bannerColors.completeFill },
                  ]
                : null,
              !trailingActionEnabled ? styles.disabledSessionModeButton : null,
            ]}
            activeOpacity={0.85}
            onPress={() =>
              void (showPlanCompletionAction ? handleCompletePlanDay() : handleNextListenChapter())
            }
            disabled={!trailingActionEnabled}
            accessibilityRole="button"
            accessibilityLabel={trailingActionLabel}
            accessibilityHint={trailingActionHint}
          >
            <Ionicons
              name={showPlanCompletionAction ? 'checkmark' : 'chevron-forward'}
              size={22}
              color={
                trailingActionEnabled
                  ? showPlanCompletionAction
                    ? bannerColors.completeIcon
                    : bannerColors.icon
                  : bannerColors.disabledIcon
              }
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.planSessionBottomBarArrowSpacer} />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  planSessionBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    borderTopWidth: 1,
  },
  planSessionBottomBarContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  planSessionBottomBarArrowButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planSessionBottomBarCompleteButton: {
    borderRadius: layout.minTouchTarget / 2,
  },
  planSessionBottomBarArrowSpacer: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
  },
  planSessionBottomBarCopy: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
  },
  planSessionBottomBarCopyCentered: {
    alignItems: 'center',
  },
  planSessionBottomBarCopyListenMode: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  planSessionBottomBarTitle: {
    ...typography.bodyStrong,
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  planSessionBottomBarMeta: {
    ...typography.micro,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    textAlign: 'center',
  },
  disabledSessionModeButton: {
    opacity: 0.45,
  },
});
