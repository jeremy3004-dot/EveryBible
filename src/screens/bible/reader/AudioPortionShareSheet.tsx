import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { ReaderAudioPositionValue, formatClockTime } from '../ReaderAudioPositionParts';
import type { AudioPortionShareDraft } from './audioShareDependencies';
import { AudioRangeSelector } from './AudioRangeSelector';
import { AUDIO_PORTION_MIN_DURATION_MS } from './readerConstants';
import { styles } from './readerStyles';

export interface AudioPortionShareSheetProps {
  audioPortionEndMs: number;
  audioPortionRangeDurationMs: number;
  audioPortionShareDraft: AudioPortionShareDraft | null;
  audioPortionStartMs: number;
  chapterShareTitle: string;
  handleAudioPortionEndSeek: (nextEndMs: number) => void;
  handleAudioPortionStartSeek: (nextStartMs: number) => void;
  handleCloseAudioPortionSheet: () => void;
  handleConfirmAudioPortionShare: () => Promise<void>;
  handleToggleAudioPortionPreview: () => void;
  isCurrentAudioChapter: boolean;
  isPreviewingAudioPortion: boolean;
  isSharingAudioPortion: boolean;
  readerAudioTrack: { translationId: string; bookId: string; chapter: number };
}

/** Pick the start and end of a clip of the chapter audio, preview it, and share it. */
export function AudioPortionShareSheet({
  audioPortionEndMs,
  audioPortionRangeDurationMs,
  audioPortionShareDraft,
  audioPortionStartMs,
  chapterShareTitle,
  handleAudioPortionEndSeek,
  handleAudioPortionStartSeek,
  handleCloseAudioPortionSheet,
  handleConfirmAudioPortionShare,
  handleToggleAudioPortionPreview,
  isCurrentAudioChapter,
  isPreviewingAudioPortion,
  isSharingAudioPortion,
  readerAudioTrack,
}: AudioPortionShareSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Modal
      visible={audioPortionShareDraft !== null}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={handleCloseAudioPortionSheet}
    >
      <View style={[styles.feedbackModalOverlay, { backgroundColor: colors.overlay }]}>
        <TouchableOpacity
          style={styles.feedbackModalBackdrop}
          activeOpacity={1}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onPress={handleCloseAudioPortionSheet}
        />
        <View
          style={[
            styles.audioPortionSheet,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
        >
          <Text
            accessibilityRole="header"
            style={[styles.audioPortionTitle, { color: colors.biblePrimaryText }]}
          >
            {t('bible.shareAudioPortion')}
          </Text>
          <Text style={[styles.audioPortionReference, { color: colors.bibleSecondaryText }]}>
            {chapterShareTitle}
          </Text>

          <View style={styles.audioPortionRangeHeader}>
            <View style={styles.audioPortionRangeLabelWrap}>
              <Ionicons name="play-skip-back-outline" size={14} color={colors.bibleSecondaryText} />
              <Text style={[styles.audioPortionRangeTime, { color: colors.biblePrimaryText }]}>
                {formatClockTime(audioPortionStartMs)}
              </Text>
            </View>
            <View style={styles.audioPortionRangeLabelWrap}>
              <Ionicons
                name="play-skip-forward-outline"
                size={14}
                color={colors.bibleSecondaryText}
              />
              <Text style={[styles.audioPortionRangeTime, { color: colors.biblePrimaryText }]}>
                {formatClockTime(audioPortionEndMs)}
              </Text>
            </View>
          </View>

          <ReaderAudioPositionValue
            track={readerAudioTrack}
            enabled={isCurrentAudioChapter}
            fallbackMs={audioPortionStartMs}
            render={(previewPositionMs) => (
              <AudioRangeSelector
                durationMs={audioPortionShareDraft?.durationMs ?? 0}
                startMs={audioPortionStartMs}
                endMs={audioPortionEndMs}
                minRangeMs={AUDIO_PORTION_MIN_DURATION_MS}
                previewPositionMs={previewPositionMs}
                trackColor={colors.bibleDivider}
                selectionColor={colors.bibleElevatedSurface}
                waveColor={colors.bibleDivider}
                selectedWaveColor={colors.bibleSecondaryText}
                playedWaveColor={colors.bibleAccent}
                handleColor={colors.bibleAccent}
                handleGripColor={colors.bibleSurface}
                onStartChange={handleAudioPortionStartSeek}
                onEndChange={handleAudioPortionEndSeek}
                startLabel={t('bible.audioClipStart')}
                endLabel={t('bible.audioClipEnd')}
              />
            )}
          />

          <TouchableOpacity
            style={[
              styles.audioPortionPreviewButton,
              {
                borderColor: colors.bibleDivider,
                backgroundColor: colors.bibleElevatedSurface,
              },
            ]}
            activeOpacity={0.9}
            onPress={handleToggleAudioPortionPreview}
            disabled={!isCurrentAudioChapter || isSharingAudioPortion}
            accessibilityRole="button"
            accessibilityLabel={t(
              isPreviewingAudioPortion
                ? 'interface.pauseChapterAudio'
                : 'interface.playChapterAudio'
            )}
            accessibilityValue={{ text: formatClockTime(audioPortionRangeDurationMs) }}
          >
            <Ionicons
              name={isPreviewingAudioPortion ? 'pause' : 'play'}
              size={14}
              color={colors.biblePrimaryText}
            />
            <Text style={[styles.audioPortionPreviewLabel, { color: colors.biblePrimaryText }]}>
              {formatClockTime(audioPortionRangeDurationMs)}
            </Text>
          </TouchableOpacity>

          <View style={styles.audioPortionActions}>
            <TouchableOpacity
              style={[
                styles.audioPortionActionButton,
                {
                  borderColor: colors.bibleDivider,
                  backgroundColor: colors.bibleElevatedSurface,
                },
              ]}
              onPress={handleCloseAudioPortionSheet}
              disabled={isSharingAudioPortion}
              accessibilityRole="button"
            >
              <Text style={[styles.audioPortionActionLabel, { color: colors.biblePrimaryText }]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.audioPortionActionButton,
                styles.audioPortionShareButton,
                {
                  borderColor: colors.bibleAccent,
                  backgroundColor: colors.bibleAccent,
                },
              ]}
              onPress={() => {
                void handleConfirmAudioPortionShare();
              }}
              disabled={isSharingAudioPortion}
              accessibilityRole="button"
              // The label text is swapped for a spinner while sharing.
              accessibilityLabel={t('groups.share')}
              accessibilityState={{
                disabled: isSharingAudioPortion,
                busy: isSharingAudioPortion,
              }}
            >
              {isSharingAudioPortion ? (
                <ActivityIndicator size="small" color={colors.cardBackground} />
              ) : (
                <Text style={[styles.audioPortionActionLabel, { color: colors.cardBackground }]}>
                  {t('groups.share')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
