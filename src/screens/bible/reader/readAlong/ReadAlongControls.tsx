import { memo } from 'react';
import { I18nManager, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../../contexts/ThemeContext';
import { layout, radius, spacing } from '../../../../design/system';
import { useAudioPosition } from '../../../../hooks/useAudioPosition';
import { OutlinedPlayPauseGlyph } from '../../../../components/audio/OutlinedPlayPauseGlyph';
import { SelahButton } from '../../../../components/audio/SelahButton';
import type { ChapterTrack } from './useChapterVerseTimestamps';
import { getReadAlongProgress } from './readAlongModel';

/**
 * The hairline under the text: how much of the chapter has played. The only part of
 * the controls that reads the position tick.
 */
const ReadAlongProgressLine = memo(function ReadAlongProgressLine({
  track,
  isCurrentAudioChapter,
}: {
  track: ChapterTrack;
  isCurrentAudioChapter: boolean;
}) {
  const { colors } = useTheme();
  const { currentPosition, duration } = useAudioPosition(track);
  const progress = isCurrentAudioChapter ? getReadAlongProgress(currentPosition, duration) : 0;

  return (
    // Decorative: the play button and the Audio sheet carry the time.
    <View
      style={[styles.progressTrack, { backgroundColor: colors.bibleDivider }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="read-along-progress"
    >
      <View
        style={[
          styles.progressFill,
          { backgroundColor: colors.bibleAccent, width: `${progress * 100}%` },
        ]}
      />
    </View>
  );
});

export interface ReadAlongControlsProps {
  track: ChapterTrack;
  isCurrentAudioChapter: boolean;
  isPlaying: boolean;
  hasPreviousChapter: boolean;
  hasNextChapter: boolean;
  onPreviousChapter: () => void;
  onNextChapter: () => void;
  onPlayPause: () => void;
  bottomInset: number;
}

// Chevrons point the way the chapters run, so they swap under a right-to-left layout.
const BackChevron = I18nManager.isRTL ? ChevronRight : ChevronLeft;
const ForwardChevron = I18nManager.isRTL ? ChevronLeft : ChevronRight;

/** Read Along's bottom bar: the progress line over ‹, play/pause, › and Selah. */
export const ReadAlongControls = memo(function ReadAlongControls({
  track,
  isCurrentAudioChapter,
  isPlaying,
  hasPreviousChapter,
  hasNextChapter,
  onPreviousChapter,
  onNextChapter,
  onPlayPause,
  bottomInset,
}: ReadAlongControlsProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.bibleBackground,
          borderTopColor: colors.bibleDivider,
          paddingBottom: bottomInset,
        },
      ]}
    >
      <ReadAlongProgressLine track={track} isCurrentAudioChapter={isCurrentAudioChapter} />
      <View style={styles.row}>
        {/* Balances the Selah slot, so the transport stays centred. */}
        <View style={styles.sideSlot} />
        <View style={styles.transport}>
          <TouchableOpacity
            style={styles.chevronButton}
            onPress={onPreviousChapter}
            disabled={!hasPreviousChapter}
            accessibilityRole="button"
            accessibilityLabel={t('audio.previousChapter')}
            accessibilityState={{ disabled: !hasPreviousChapter }}
          >
            <BackChevron
              size={24}
              color={hasPreviousChapter ? colors.biblePrimaryText : colors.bibleDivider}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.playTile,
              { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
            ]}
            onPress={onPlayPause}
            accessibilityRole="button"
            accessibilityLabel={
              isPlaying ? t('interface.pauseChapterAudio') : t('interface.playChapterAudio')
            }
            testID="read-along-play-pause"
          >
            <OutlinedPlayPauseGlyph playing={isPlaying} size={26} color={colors.bibleAccent} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.chevronButton}
            onPress={onNextChapter}
            disabled={!hasNextChapter}
            accessibilityRole="button"
            accessibilityLabel={t('audio.nextChapter')}
            accessibilityState={{ disabled: !hasNextChapter }}
          >
            <ForwardChevron
              size={24}
              color={hasNextChapter ? colors.biblePrimaryText : colors.bibleDivider}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.sideSlot}>
          <SelahButton size="compact" />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  progressTrack: {
    height: 2,
    marginHorizontal: spacing.lg,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sideSlot: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  chevronButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTile: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
