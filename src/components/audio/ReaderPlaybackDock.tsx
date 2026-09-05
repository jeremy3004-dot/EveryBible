import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { mediumHaptic } from '../../utils/haptics';
import { radius } from '../../design/system';
import { READER_TAB_BAR_COLLAPSE_DISTANCE } from '../../navigation/readerTabBarMotion';
import {
  READER_PLAY_BUTTON_SIZE,
  READER_PLAY_COLLAPSE_TRAVEL,
  READER_CHAPTER_BUTTON_SIZE,
} from '../../screens/bible/readerChromeMotion';

const PRESSED_SCALE = 0.96;

interface ReaderPlaybackDockProps {
  collapseProgress: SharedValue<number>;
  isCollapsed: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  hasPreviousChapter: boolean;
  hasNextChapter: boolean;
  hidePlayButton?: boolean;
  nextAccessibilityHint?: string;
  nextAccessibilityLabel?: string;
  nextButtonColor?: string;
  nextIconColor?: string;
  nextIconName?: 'checkmark' | 'chevron-forward';
  onPreviousChapter: () => void;
  onNextChapter: () => void;
  onPlayPause: () => void;
}

export const ReaderPlaybackDock = memo(function ReaderPlaybackDock({
  collapseProgress,
  isCollapsed,
  isPlaying,
  isLoading,
  hasPreviousChapter,
  hasNextChapter,
  hidePlayButton,
  nextAccessibilityHint,
  nextAccessibilityLabel,
  nextButtonColor,
  nextIconColor,
  nextIconName = 'chevron-forward',
  onPreviousChapter,
  onNextChapter,
  onPlayPause,
}: ReaderPlaybackDockProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const playButtonIconName = isPlaying || isLoading ? 'pause' : 'play';
  const playButtonAccessibilityLabel =
    playButtonIconName === 'pause'
      ? t('interface.pauseChapterAudio')
      : t('interface.playChapterAudio');
  const showPlayButton = hidePlayButton !== true;

  // The whole dock travels 65pt. The arrows travel the remaining 67pt,
  // so their total travel matches the tab capsule at every animation frame.
  const sideTransportAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          collapseProgress.value,
          [0, 1],
          [0, READER_TAB_BAR_COLLAPSE_DISTANCE - READER_PLAY_COLLAPSE_TRAVEL],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  return (
    <View style={[styles.container]}>
      <Animated.View
        style={[styles.sideTransportWrap, sideTransportAnimatedStyle]}
        pointerEvents={isCollapsed ? 'none' : 'auto'}
        accessibilityElementsHidden={isCollapsed}
        importantForAccessibility={isCollapsed ? 'no-hide-descendants' : 'auto'}
      >
        <Pressable
          style={({ pressed }) => [
            styles.sideTransportButton,
            {
              backgroundColor: colors.bibleElevatedSurface,
              transform: [{ scale: pressed ? PRESSED_SCALE : 1 }],
            },
          ]}
          onPress={onPreviousChapter}
          disabled={isCollapsed || !hasPreviousChapter}
          accessibilityState={{ disabled: isCollapsed || !hasPreviousChapter }}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t('audio.previousChapter')}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={hasPreviousChapter ? colors.biblePrimaryText : colors.bibleSecondaryText}
          />
        </Pressable>
      </Animated.View>

      {showPlayButton ? (
        <Animated.View style={styles.playButtonWrap}>
          <Pressable
            style={({ pressed }) => [
              styles.playButton,
              {
                // Reader transport keeps the disc close to the page tone and lets
                // the glyph carry the contrast, rather than inverting the whole
                // button — an inverted disc reads as a hard slam over Scripture.
                backgroundColor: colors.bibleElevatedSurface,
                transform: [{ scale: pressed ? PRESSED_SCALE : 1 }],
              },
            ]}
            onPress={() => {
              mediumHaptic();
              onPlayPause();
            }}
            accessibilityRole="button"
            accessibilityLabel={playButtonAccessibilityLabel}
            accessibilityState={{ busy: isLoading, disabled: isLoading }}
            disabled={isLoading}
            testID="reader-play-pause"
          >
            <Ionicons
              name={playButtonIconName}
              size={28}
              color={colors.biblePrimaryText}
              style={playButtonIconName === 'play' ? styles.playIcon : undefined}
            />
          </Pressable>
        </Animated.View>
      ) : null}

      <Animated.View
        style={[styles.sideTransportWrap, sideTransportAnimatedStyle]}
        pointerEvents={isCollapsed ? 'none' : 'auto'}
        accessibilityElementsHidden={isCollapsed}
        importantForAccessibility={isCollapsed ? 'no-hide-descendants' : 'auto'}
      >
        <Pressable
          style={({ pressed }) => [
            styles.sideTransportButton,
            {
              backgroundColor: nextButtonColor ?? colors.bibleElevatedSurface,
              transform: [{ scale: pressed ? PRESSED_SCALE : 1 }],
            },
          ]}
          onPress={onNextChapter}
          disabled={isCollapsed || !hasNextChapter}
          accessibilityState={{ disabled: isCollapsed || !hasNextChapter }}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={nextAccessibilityLabel ?? t('audio.nextChapter')}
          accessibilityHint={nextAccessibilityHint}
        >
          <Ionicons
            name={nextIconName}
            size={22}
            color={
              hasNextChapter
                ? (nextIconColor ?? colors.biblePrimaryText)
                : colors.bibleSecondaryText
            }
          />
        </Pressable>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    // Bottom-aligned, not centred: the play button is larger than the chapter
    // chevrons, so centring pushed its lower edge under the tab bar. Sharing a
    // baseline lets it grow upward instead of being clipped.
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    width: '100%',
  },
  sideTransportWrap: {
    width: 56,
    height: 48,
    marginBottom: -4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideTransportButton: {
    width: READER_CHAPTER_BUTTON_SIZE,
    height: READER_CHAPTER_BUTTON_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: READER_PLAY_BUTTON_SIZE,
    height: READER_PLAY_BUTTON_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    marginLeft: 2,
  },
});
