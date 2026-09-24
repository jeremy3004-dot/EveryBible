import { Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { spacing } from '../../../design/system';
import { getPlanSessionTrailingActionState, getPlanSessionBannerColors } from '../bibleReaderModel';
import { PLAN_SESSION_BAR_MAX_FONT_SCALE } from './readerConstants';
import { styles } from './readerStyles';

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
