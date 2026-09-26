import { memo } from 'react';
import { I18nManager, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Download,
  Share2,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { getTranslatedBookName } from '../../../../constants/books';
import { useTheme } from '../../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../../design/system';
import { useAudioPosition } from '../../../../hooks/useAudioPosition';
import { useAudioStore } from '../../../../stores/audioStore';
import { PLAYBACK_RATES, REPEAT_MODES, SLEEP_TIMER_OPTIONS } from '../../../../types/audio';
import type {
  BackgroundMusicChoice,
  PlaybackRate,
  RepeatMode,
  SleepTimerOption,
} from '../../../../types/audio';
import { formatPlaybackTime } from '../../../../utils/time';
import { BookIcon } from '../../../../components/bible/BookIcon';
import { Slider } from '../../../../components/ui/Slider';
import { isSleepTimerOptionSelected } from '../../../../components/audio/sleepTimerSelection';
import {
  formatPlaybackRate,
  sleepTimerOptionLabel,
} from '../../../../components/audio/playbackControlsParts/playbackControlsModel';
import { AudioSheetSection, Chip, ChipRow } from './AudioSheetParts';
import { formatRepeatPassage, repeatChipLabelKey, soundLabelKey } from './audioSheetModel';
import { useChapterVerseTimestamps } from '../readAlong/useChapterVerseTimestamps';
import { useTimedFollowAlongVerse } from '../readAlong/useTimedFollowAlongVerse';

export interface ReaderAudioTrack {
  translationId: string;
  bookId: string;
  chapter: number;
}

export interface AudioSheetMainPageProps {
  backgroundMusicChoice: BackgroundMusicChoice;
  changePlaybackRate: (rate: PlaybackRate) => Promise<void>;
  isCurrentAudioChapter: boolean;
  onDownload: () => void;
  onOpenLibrary: () => void;
  onOpenPassagePicker: () => void;
  onOpenReadAlong: () => void;
  onShareClip: () => void;
  playbackRate: PlaybackRate;
  repeatMode: RepeatMode;
  sleepTimerRemaining: number | null;
  startSleepTimer: (minutes: SleepTimerOption) => void;
  track: ReaderAudioTrack;
}

const ForwardChevron: LucideIcon = I18nManager.isRTL ? ChevronLeft : ChevronRight;

/**
 * Book artwork, "Genesis 1" (or the verse being spoken, "Genesis 1:10", where the
 * recording has verse timings) and elapsed / total. The only part of the sheet that
 * reads the position tick, so the rest does not redraw four times a second.
 */
const NowPlayingRow = memo(function NowPlayingRow({
  track,
  isCurrentAudioChapter,
}: {
  track: ReaderAudioTrack;
  isCurrentAudioChapter: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { currentPosition, duration } = useAudioPosition(track);
  const { timestamps } = useChapterVerseTimestamps(track, isCurrentAudioChapter);
  const verse = useTimedFollowAlongVerse({ track, timestamps, enabled: isCurrentAudioChapter });
  const hasTime = isCurrentAudioChapter && duration > 0;
  const bookName = getTranslatedBookName(track.bookId, t);
  const reference =
    verse == null
      ? `${bookName} ${track.chapter}`
      : t('audio.currentVerseReference', { book: bookName, chapter: track.chapter, verse });
  const elapsed = formatPlaybackTime(currentPosition);
  const total = formatPlaybackTime(duration);

  return (
    <View style={styles.nowPlaying}>
      <View
        style={[
          styles.artworkTile,
          { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
        ]}
      >
        <BookIcon bookId={track.bookId} size={36} />
      </View>
      <View style={styles.nowPlayingCopy}>
        <Text style={[styles.nowPlayingTitle, { color: colors.biblePrimaryText }]}>
          {reference}
        </Text>
        {hasTime ? (
          <Text
            style={[styles.nowPlayingTime, { color: colors.bibleSecondaryText }]}
            accessibilityLabel={t('audio.elapsedOfTotal', { elapsed, total })}
          >
            {elapsed} / {total}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

function FooterButton({
  icon: Icon,
  label,
  accessibilityLabel,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.footerButton,
        { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Icon size={18} color={colors.biblePrimaryText} />
      <Text style={[styles.footerLabel, { color: colors.biblePrimaryText }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** The audio sheet's first page: now playing, sound, speed, sleep timer, repeat, share and download. */
export function AudioSheetMainPage({
  backgroundMusicChoice,
  changePlaybackRate,
  isCurrentAudioChapter,
  onDownload,
  onOpenLibrary,
  onOpenPassagePicker,
  onOpenReadAlong,
  onShareClip,
  playbackRate,
  repeatMode,
  sleepTimerRemaining,
  startSleepTimer,
  track,
}: AudioSheetMainPageProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const narrationVolume = useAudioStore((state) => state.narrationVolume);
  const setNarrationVolume = useAudioStore((state) => state.setNarrationVolume);
  const backgroundMusicLevel = useAudioStore((state) => state.backgroundMusicLevel);
  const setBackgroundMusicLevel = useAudioStore((state) => state.setBackgroundMusicLevel);
  const sleepTimerMinutes = useAudioStore((state) => state.sleepTimerMinutes);
  const repeatPassage = useAudioStore((state) => state.repeatPassage);
  const setRepeatMode = useAudioStore((state) => state.setRepeatMode);

  const soundName = t(soundLabelKey(backgroundMusicChoice));
  const sliderColors = {
    minimumTrackColor: colors.bibleAccent,
    maximumTrackColor: colors.bibleDivider,
    thumbColor: colors.bibleSurface,
  };

  return (
    <View style={styles.page}>
      <NowPlayingRow track={track} isCurrentAudioChapter={isCurrentAudioChapter} />

      <TouchableOpacity
        style={[
          styles.readAlongButton,
          { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
        ]}
        onPress={onOpenReadAlong}
        accessibilityRole="button"
        accessibilityLabel={t('audio.readAlong')}
        accessibilityHint={t('audio.readAlongHint')}
      >
        <BookOpenText size={18} color={colors.bibleAccent} />
        <Text style={[styles.footerLabel, { color: colors.biblePrimaryText }]}>
          {t('audio.readAlong')}
        </Text>
      </TouchableOpacity>

      <AudioSheetSection title={t('audio.soundSection')}>
        <TouchableOpacity
          style={[styles.soundRow, { borderColor: colors.bibleDivider }]}
          onPress={onOpenLibrary}
          accessibilityRole="button"
          accessibilityLabel={t('audio.backgroundSound')}
          accessibilityValue={{ text: soundName }}
          accessibilityHint={t('audio.backgroundSoundHint')}
        >
          <Text style={[styles.rowLabel, { color: colors.biblePrimaryText }]}>
            {t('audio.backgroundSound')}
          </Text>
          <View style={styles.soundRowValue}>
            <Text
              style={[styles.soundName, { color: colors.bibleSecondaryText }]}
              numberOfLines={1}
            >
              {soundName}
            </Text>
            <ForwardChevron size={18} color={colors.bibleSecondaryText} />
          </View>
        </TouchableOpacity>

        <View style={styles.sliderRow}>
          <Text style={[styles.sliderLabel, { color: colors.biblePrimaryText }]}>
            {t('audio.voiceVolume')}
          </Text>
          <Slider
            style={styles.slider}
            value={narrationVolume}
            onValueChange={setNarrationVolume}
            accessibilityLabel={t('audio.voiceVolume')}
            {...sliderColors}
          />
        </View>
        <View style={styles.sliderRow}>
          <Text style={[styles.sliderLabel, { color: colors.biblePrimaryText }]}>
            {t('audio.soundVolume')}
          </Text>
          <Slider
            style={styles.slider}
            value={backgroundMusicLevel}
            onValueChange={setBackgroundMusicLevel}
            // Nothing to turn up while no sound is chosen.
            disabled={backgroundMusicChoice === 'off'}
            accessibilityLabel={t('audio.soundVolume')}
            {...sliderColors}
          />
        </View>
      </AudioSheetSection>

      <AudioSheetSection title={t('audio.speed')}>
        <ChipRow>
          {PLAYBACK_RATES.map((rate) => (
            <Chip
              key={rate}
              label={formatPlaybackRate(rate)}
              isSelected={rate === playbackRate}
              onPress={() => void changePlaybackRate(rate)}
            />
          ))}
        </ChipRow>
      </AudioSheetSection>

      <AudioSheetSection title={t('audio.sleepTimer')}>
        <ChipRow>
          {SLEEP_TIMER_OPTIONS.map((option) => {
            const labelKey = sleepTimerOptionLabel(option.value);
            const label =
              labelKey.count === undefined
                ? t(labelKey.key)
                : t(labelKey.key, { count: labelKey.count });
            const isSelected = isSleepTimerOptionSelected(
              option.value,
              sleepTimerMinutes,
              sleepTimerRemaining
            );
            // A running countdown shows what is left on its own chip.
            const remaining =
              isSelected && typeof option.value === 'number' && sleepTimerRemaining != null
                ? t('interface.minutesShort', { count: sleepTimerRemaining })
                : null;
            return (
              <Chip
                key={option.value ?? 'off'}
                label={remaining ?? label}
                accessibilityLabel={label}
                accessibilityValue={remaining ?? undefined}
                isSelected={isSelected}
                onPress={() => startSleepTimer(option.value)}
              />
            );
          })}
        </ChipRow>
      </AudioSheetSection>

      <AudioSheetSection title={t('audio.repeat')}>
        <ChipRow>
          {REPEAT_MODES.map((mode) => {
            const label = t(repeatChipLabelKey(mode));
            if (mode !== 'passage') {
              return (
                <Chip
                  key={mode}
                  label={label}
                  isSelected={repeatMode === mode}
                  onPress={() => setRepeatMode(mode)}
                />
              );
            }
            const passageLabel = repeatPassage
              ? formatRepeatPassage(
                  repeatPassage,
                  getTranslatedBookName(repeatPassage.bookId, t),
                  t
                )
              : null;
            return (
              <Chip
                key={mode}
                label={passageLabel ?? label}
                accessibilityLabel={label}
                accessibilityValue={passageLabel ?? undefined}
                accessibilityHint={t('audio.repeatPassageHint')}
                isSelected={repeatMode === 'passage'}
                onPress={onOpenPassagePicker}
              />
            );
          })}
        </ChipRow>
      </AudioSheetSection>

      <View style={styles.footer}>
        <FooterButton
          icon={Share2}
          label={t('audio.shareClip')}
          accessibilityLabel={t('bible.shareChapterAudio')}
          onPress={onShareClip}
        />
        <FooterButton
          icon={Download}
          label={t('audio.download')}
          accessibilityLabel={t('bible.downloadBookAudio')}
          onPress={onDownload}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: spacing.xl,
  },
  nowPlaying: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  artworkTile: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowPlayingCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  nowPlayingTitle: {
    ...typography.cardTitle,
  },
  nowPlayingTime: {
    ...typography.caption,
    fontVariant: ['tabular-nums'],
  },
  soundRow: {
    minHeight: layout.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    ...typography.bodyMedium,
  },
  soundRowValue: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  soundName: {
    ...typography.body,
    flexShrink: 1,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sliderLabel: {
    ...typography.bodyMedium,
    minWidth: 56,
  },
  slider: {
    flex: 1,
  },
  readAlongButton: {
    minHeight: layout.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  footerButton: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  footerLabel: {
    ...typography.label,
  },
});
