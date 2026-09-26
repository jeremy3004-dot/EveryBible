import { memo, useMemo } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { getTranslatedBookName } from '../../../constants/books';
import { useTheme } from '../../../contexts/ThemeContext';
import { getReadingFontFamily } from '../../../design/fonts';
import { layout, spacing, typography } from '../../../design/system';
import { useFontSize } from '../../../hooks/useFontSize';
import type { BibleTranslation, Verse } from '../../../types';
import { ReadAlongControls } from './readAlong/ReadAlongControls';
import { ReadAlongVerseList, buildReadAlongTextStyle } from './readAlong/ReadAlongVerseList';
import {
  useChapterVerseTimestamps,
  type ChapterTrack,
} from './readAlong/useChapterVerseTimestamps';
import { useReadAlongText } from './readAlong/useReadAlongText';

export interface FollowAlongTextSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The chapter on screen, which Read Along shows and whose recording it follows. */
  track: ChapterTrack;
  isCurrentAudioChapter: boolean;
  /** The reader's verses for that chapter, or none while it shows no text for it. */
  readerVerses: Verse[];
  translation: BibleTranslation | undefined;
  isPlaying: boolean;
  hasPreviousChapter: boolean;
  hasNextChapter: boolean;
  onPreviousChapter: () => void;
  onNextChapter: () => void;
  onPlayPause: () => void;
}

/**
 * Read Along: the chapter in large text, full screen, following the recording verse by
 * verse where it has verse timings (the verse being spoken bright and a little bolder,
 * the rest dimmed), with the chapter transport and a progress line at the bottom.
 *
 * It grew out of the reader's follow-along text sheet, which it replaces: the same
 * modal, mounted once by the reader. It takes the reader's own verses when they are on
 * screen and loads text itself otherwise (an audio-only recording reads along in BSB).
 * Memoized, and every prop is stable across the reader's unrelated re-renders; the
 * position tick reaches only the verse list (once per verse) and the progress line.
 */
export const FollowAlongTextSheet = memo(function FollowAlongTextSheet({
  visible,
  onClose,
  track,
  isCurrentAudioChapter,
  readerVerses,
  translation,
  isPlaying,
  hasPreviousChapter,
  hasNextChapter,
  onPreviousChapter,
  onNextChapter,
  onPlayPause,
}: FollowAlongTextSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const safeInsets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { scaleValue } = useFontSize();
  const text = useReadAlongText({ track, readerVerses, translation, enabled: visible });
  const { timestamps, loaded: timingsLoaded } = useChapterVerseTimestamps(track, visible);

  // The text's own script decides the serif: BSB read along with an audio-only
  // recording is Latin whatever the recording's language.
  const textLanguage = text.isFallback ? undefined : translation?.language;
  const textStyle = useMemo(
    () =>
      buildReadAlongTextStyle(
        scaleValue,
        getReadingFontFamily(textLanguage),
        getReadingFontFamily(textLanguage, 600)
      ),
    [scaleValue, textLanguage]
  );

  const title = `${getTranslatedBookName(track.bookId, t)} ${track.chapter}`;
  const eyebrow = text.isFallback
    ? (text.textTranslationId ?? '').toUpperCase()
    : translation?.abbreviation || track.translationId.toUpperCase();
  const notes = [
    text.isFallback ? t('audio.readAlongOtherTranslation', { translation: eyebrow }) : null,
    !text.isStale && text.verses.length > 0 && timingsLoaded && timestamps == null
      ? t('audio.readAlongNoTimings')
      : null,
  ].filter((note): note is string => note != null);

  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? 'fade' : 'slide'}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View
        accessibilityViewIsModal
        // VoiceOver's escape gesture closes it, as Android back does.
        onAccessibilityEscape={onClose}
        testID="read-along"
        style={[styles.container, { backgroundColor: colors.bibleBackground }]}
      >
        <View
          style={[
            styles.header,
            { paddingTop: safeInsets.top + spacing.sm, borderBottomColor: colors.bibleDivider },
          ]}
        >
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('interface.close')}
          >
            <X size={22} color={colors.biblePrimaryText} />
          </TouchableOpacity>
          <View style={styles.titleBlock}>
            <Text style={[styles.eyebrow, { color: colors.bibleAccent }]} numberOfLines={1}>
              {eyebrow}
            </Text>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: colors.biblePrimaryText }]}
              numberOfLines={1}
            >
              {title}
            </Text>
          </View>
          {/* Balances the close button, so the title stays centred. */}
          <View style={styles.closeButton} />
        </View>

        {notes.map((note) => (
          <Text key={note} style={[styles.note, { color: colors.bibleSecondaryText }]}>
            {note}
          </Text>
        ))}

        {text.loaded && text.verses.length === 0 ? (
          <Text style={[styles.empty, { color: colors.bibleSecondaryText }]}>
            {t('audio.readAlongNoText')}
          </Text>
        ) : (
          <ReadAlongVerseList
            track={track}
            verses={text.verses}
            timestamps={timestamps}
            canFollow={visible && isCurrentAudioChapter && !text.isStale}
            textStyle={textStyle}
            bottomInset={spacing.xl}
          />
        )}

        <ReadAlongControls
          track={track}
          isCurrentAudioChapter={isCurrentAudioChapter}
          isPlaying={isPlaying}
          hasPreviousChapter={hasPreviousChapter}
          hasNextChapter={hasNextChapter}
          onPreviousChapter={onPreviousChapter}
          onNextChapter={onNextChapter}
          onPlayPause={onPlayPause}
          bottomInset={Math.max(safeInsets.bottom, spacing.md)}
        />
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
  },
  eyebrow: {
    ...typography.micro,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    ...typography.cardTitle,
  },
  note: {
    ...typography.caption,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  empty: {
    ...typography.body,
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
});
