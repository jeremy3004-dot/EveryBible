import { memo } from 'react';
import { ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { playbackControlsStyles as styles } from './playbackControlsStyles';

// Each transport button is memoised on plain values and stable handlers, so a
// parent redraw only reaches the buttons whose own state changed.

interface ChapterButtonProps {
  direction: 'previous' | 'next';
  hasChapter: boolean;
  isLoading: boolean;
  isChapterOnly: boolean;
  onPress: () => void;
}

export const ChapterButton = memo(function ChapterButton({
  direction,
  hasChapter,
  isLoading,
  isChapterOnly,
  onPress,
}: ChapterButtonProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const disabled = !hasChapter || isLoading;

  return (
    <TouchableOpacity
      style={[
        styles.iconButton,
        isChapterOnly ? styles.chapterOnlyTransportButton : null,
        !hasChapter && styles.disabledButton,
      ]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={t(
        direction === 'previous' ? 'audio.previousChapter' : 'audio.nextChapter'
      )}
      accessibilityState={{ disabled }}
    >
      <Ionicons
        name={direction === 'previous' ? 'play-skip-back' : 'play-skip-forward'}
        size={isChapterOnly ? 28 : 20}
        color={hasChapter ? colors.biblePrimaryText : colors.bibleSecondaryText}
      />
    </TouchableOpacity>
  );
});

interface SkipButtonProps {
  direction: 'backward' | 'forward';
  isLoading: boolean;
  onPress: () => void;
}

export const SkipButton = memo(function SkipButton({
  direction,
  isLoading,
  onPress,
}: SkipButtonProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const label = <Text style={[styles.skipLabel, { color: colors.biblePrimaryText }]}>10</Text>;
  const arrow = (
    <Ionicons
      name={direction === 'backward' ? 'play-back' : 'play-forward'}
      size={16}
      color={colors.biblePrimaryText}
    />
  );

  return (
    <TouchableOpacity
      style={[
        styles.skipButton,
        { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
      ]}
      onPress={onPress}
      disabled={isLoading}
      hitSlop={4}
      accessibilityRole="button"
      // The visible "10" plus a chevron is not a name; say what it does.
      accessibilityLabel={t(direction === 'backward' ? 'audio.skipBackward' : 'audio.skipForward')}
      accessibilityState={{ disabled: isLoading }}
    >
      {direction === 'backward' ? arrow : label}
      {direction === 'backward' ? label : arrow}
    </TouchableOpacity>
  );
});

interface PlayButtonProps {
  isLoading: boolean;
  isPlaying: boolean;
  isChapterOnly: boolean;
  onPress: () => void;
}

export const PlayButton = memo(function PlayButton({
  isLoading,
  isPlaying,
  isChapterOnly,
  onPress,
}: PlayButtonProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      style={[
        styles.playButton,
        isChapterOnly ? styles.chapterOnlyPlayButton : null,
        { backgroundColor: colors.bibleControlBackground },
      ]}
      onPress={onPress}
      disabled={isLoading}
      accessibilityRole="button"
      accessibilityLabel={t(
        isPlaying ? 'interface.pauseChapterAudio' : 'interface.playChapterAudio'
      )}
      accessibilityState={{ busy: isLoading, disabled: isLoading }}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.bibleBackground} />
      ) : (
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={isChapterOnly ? 34 : 26}
          color={colors.bibleBackground}
          style={!isPlaying ? styles.playIconOffset : undefined}
        />
      )}
    </TouchableOpacity>
  );
});
