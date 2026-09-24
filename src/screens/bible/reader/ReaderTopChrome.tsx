import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { layout, radius, spacing, typography } from '../../../design/system';
import type { Dispatch, SetStateAction } from 'react';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getTranslatedBookName } from '../../../constants';
import { useTheme } from '../../../contexts/ThemeContext';
import {
  TOP_ACTION_HIT_SLOP,
  TOP_ACTION_ICON_SIZE,
  READER_REFERENCE_PILL_MAX_FONT_SCALE,
} from './readerConstants';

export interface ReaderTopChromeProps {
  useAnimatedChrome: boolean;
  audioEnabled: boolean;
  bookId: string;
  canShowTranslationSheet: boolean;
  chapter: number;
  chapterFeedbackEnabled: boolean;
  compactBookName: string;
  handleExitPlanSession: () => void;
  handleOpenBibleSearch: () => void;
  handleOpenBookPicker: () => void;
  handleOpenChapterFeedback: () => void;
  handleOpenTranslationOptions: () => void;
  isReadBottomChromeCollapsed: boolean;
  setShowAudioOptionsSheet: Dispatch<SetStateAction<boolean>>;
  setShowChapterActionsSheet: Dispatch<SetStateAction<boolean>>;
  setShowFontSizeSheet: Dispatch<SetStateAction<boolean>>;
  setShowTranslationSheet: Dispatch<SetStateAction<boolean>>;
  sharedTopChromeTop: number;
  showPlanSessionChrome: boolean;
  topChromeAnimatedStyle: { opacity: number; transform: { translateY: number }[] };
  translationLabel: string;
}

/** The floating top chrome: plan exit, the reference pill with its translation segment, audio, search, feedback and the overflow menu. */
export function ReaderTopChrome({
  useAnimatedChrome,
  audioEnabled,
  bookId,
  canShowTranslationSheet,
  chapter,
  chapterFeedbackEnabled,
  compactBookName,
  handleExitPlanSession,
  handleOpenBibleSearch,
  handleOpenBookPicker,
  handleOpenChapterFeedback,
  handleOpenTranslationOptions,
  isReadBottomChromeCollapsed,
  setShowAudioOptionsSheet,
  setShowChapterActionsSheet,
  setShowFontSizeSheet,
  setShowTranslationSheet,
  sharedTopChromeTop,
  showPlanSessionChrome,
  topChromeAnimatedStyle,
  translationLabel,
}: ReaderTopChromeProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Animated.View
      pointerEvents={useAnimatedChrome && isReadBottomChromeCollapsed ? 'none' : 'box-none'}
      accessibilityElementsHidden={useAnimatedChrome && isReadBottomChromeCollapsed}
      importantForAccessibility={
        useAnimatedChrome && isReadBottomChromeCollapsed ? 'no-hide-descendants' : 'auto'
      }
      style={[
        styles.floatingReaderTopBar,
        { top: sharedTopChromeTop },
        useAnimatedChrome ? topChromeAnimatedStyle : null,
      ]}
    >
      <View style={styles.floatingReaderReferenceCluster}>
        {showPlanSessionChrome ? (
          <TouchableOpacity
            style={[styles.floatingReaderPlanExitButton]}
            activeOpacity={0.85}
            onPress={handleExitPlanSession}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            accessibilityHint={t('bible.returnToPlanHint')}
          >
            <Ionicons name="chevron-back" size={18} color={colors.biblePrimaryText} />
          </TouchableOpacity>
        ) : null}

        <View style={styles.floatingReaderReferencePill}>
          <View
            pointerEvents="none"
            style={[
              styles.floatingReaderReferencePillBackground,
              { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
            ]}
          />
          <TouchableOpacity
            style={[
              styles.floatingReaderReferencePillSegment,
              styles.floatingReaderReferencePillBookSegment,
            ]}
            activeOpacity={0.85}
            onPress={handleOpenBookPicker}
            accessibilityRole="button"
            accessibilityLabel={`${getTranslatedBookName(bookId, t)} ${chapter}`}
            accessibilityHint={t('bible.openBookAndChapterPickerHint')}
          >
            <Text
              style={[
                styles.floatingReaderReferencePillPrimary,
                { color: colors.biblePrimaryText },
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={READER_REFERENCE_PILL_MAX_FONT_SCALE}
            >
              {compactBookName} {chapter}
            </Text>
          </TouchableOpacity>

          <View
            style={[
              styles.floatingReaderReferencePillDivider,
              { backgroundColor: colors.bibleDivider },
            ]}
          />

          <TouchableOpacity
            style={styles.floatingReaderReferencePillSegment}
            activeOpacity={0.85}
            onPress={handleOpenTranslationOptions}
            accessibilityRole="button"
            accessibilityLabel={translationLabel}
            accessibilityHint={t('bible.openTranslationOptionsHint')}
            disabled={!canShowTranslationSheet}
          >
            <Text
              style={[
                styles.floatingReaderReferencePillTranslation,
                { color: colors.biblePrimaryText },
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={READER_REFERENCE_PILL_MAX_FONT_SCALE}
            >
              {translationLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.floatingReaderTopActionGroup}>
        {audioEnabled ? (
          <TouchableOpacity
            style={[
              styles.floatingReaderMenuButton,
              { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
            ]}
            activeOpacity={0.85}
            hitSlop={TOP_ACTION_HIT_SLOP}
            onPress={() => {
              setShowFontSizeSheet(false);
              setShowTranslationSheet(false);
              setShowChapterActionsSheet(false);
              setShowAudioOptionsSheet(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('audio.nowPlaying')}
          >
            <View style={styles.floatingReaderMenuButtonContent}>
              <Ionicons
                name="volume-medium-outline"
                size={TOP_ACTION_ICON_SIZE}
                color={colors.biblePrimaryText}
              />
            </View>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[
            styles.floatingReaderMenuButton,
            { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
          ]}
          activeOpacity={0.85}
          hitSlop={TOP_ACTION_HIT_SLOP}
          onPress={handleOpenBibleSearch}
          accessibilityRole="button"
          accessibilityLabel={t('common.search')}
        >
          <View style={styles.floatingReaderMenuButtonContent}>
            <Ionicons name="search" size={TOP_ACTION_ICON_SIZE} color={colors.biblePrimaryText} />
          </View>
        </TouchableOpacity>

        {chapterFeedbackEnabled ? (
          <TouchableOpacity
            style={[
              styles.floatingReaderMenuButton,
              { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
            ]}
            activeOpacity={0.85}
            hitSlop={TOP_ACTION_HIT_SLOP}
            onPress={handleOpenChapterFeedback}
            accessibilityRole="button"
            accessibilityLabel={t('bible.chapterFeedback')}
          >
            <View style={styles.floatingReaderMenuButtonContent}>
              <Ionicons
                name="chatbox-ellipses-outline"
                size={TOP_ACTION_ICON_SIZE}
                color={colors.biblePrimaryText}
              />
            </View>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[
            styles.floatingReaderMenuButton,
            { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
          ]}
          activeOpacity={0.85}
          hitSlop={TOP_ACTION_HIT_SLOP}
          onPress={() => {
            setShowAudioOptionsSheet(false);
            setShowFontSizeSheet(false);
            setShowTranslationSheet(false);
            setShowChapterActionsSheet(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('tabs.more')}
        >
          <View style={styles.floatingReaderMenuButtonContent}>
            <Ionicons
              name="ellipsis-horizontal"
              size={TOP_ACTION_ICON_SIZE}
              color={colors.biblePrimaryText}
            />
          </View>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  floatingReaderTopBar: {
    position: 'absolute',
    left: 24,
    right: 22,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  floatingReaderReferenceCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 1,
  },
  floatingReaderTopActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    flexShrink: 0,
  },
  floatingReaderPlanExitButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingReaderReferencePill: {
    minWidth: 124,
    maxWidth: 212,
    height: layout.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'center',
    flexShrink: 1,
  },
  floatingReaderReferencePillBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 2,
    height: layout.iconButton,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  floatingReaderReferencePillSegment: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    minWidth: layout.minTouchTarget,
    flexShrink: 1,
  },
  floatingReaderReferencePillBookSegment: {
    paddingHorizontal: 16,
  },
  floatingReaderReferencePillPrimary: {
    ...typography.label,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '700',
    letterSpacing: 0,
    flexShrink: 1,
  },
  floatingReaderReferencePillDivider: {
    width: 1,
    height: 32,
    alignSelf: 'center',
    opacity: 0.55,
  },
  floatingReaderReferencePillTranslation: {
    ...typography.label,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '700',
    letterSpacing: 0,
    flexShrink: 1,
  },
  floatingReaderMenuButton: {
    width: layout.iconButton,
    height: layout.iconButton,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  floatingReaderMenuButtonContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
