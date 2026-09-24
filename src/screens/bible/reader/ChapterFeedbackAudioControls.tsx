import { useEffect, useRef } from 'react';
import { StyleSheet, ActivityIndicator, Linking, Text, TouchableOpacity, View } from 'react-native';
import { layout, radius, spacing } from '../../../design/system';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../../contexts/ThemeContext';
import { CONTROL_LABEL_MAX_FONT_SCALE } from '../../../design/largeTextLayout';
import { CHAPTER_FEEDBACK_AUDIO_MAX_DURATION_MS } from '../../../services/feedback/chapterFeedbackAudio';
import {
  FEEDBACK_AUDIO_COUNTDOWN_SIZE,
  FEEDBACK_AUDIO_COUNTDOWN_STROKE_WIDTH,
  FEEDBACK_AUDIO_COUNTDOWN_RADIUS,
  FEEDBACK_AUDIO_COUNTDOWN_CIRCUMFERENCE,
} from './readerConstants';
import { formatFeedbackAudioDuration } from './feedbackAudioSession';
import type { ChapterFeedback } from './useChapterFeedback';
import { announceForAccessibility } from '../../../utils/a11y';

interface ChapterFeedbackAudioControlsProps {
  feedback: ChapterFeedback;
  compact?: boolean;
}

/** Record, stop, preview and re-record the voice note, with a countdown ring to the limit. */
export function ChapterFeedbackAudioControls({
  feedback,
  compact = false,
}: ChapterFeedbackAudioControlsProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const {
    feedbackAudioState,
    feedbackAudioDraft,
    feedbackAudioElapsedMs,
    feedbackAudioPermissionDenied,
    isSubmittingFeedback,
    startFeedbackAudioRecording,
    stopFeedbackAudioRecording,
    playFeedbackAudioPreview,
    discardFeedbackAudioDraft,
  } = feedback;
  const isRecording = feedbackAudioState === 'recording';
  const isUploadingAudio = feedbackAudioState === 'uploading';
  const previewDurationMs = feedbackAudioDraft?.durationMs ?? feedbackAudioElapsedMs;
  const countdownElapsedMs = Math.min(
    isRecording ? feedbackAudioElapsedMs : previewDurationMs,
    CHAPTER_FEEDBACK_AUDIO_MAX_DURATION_MS
  );
  const countdownRemainingMs = Math.max(
    CHAPTER_FEEDBACK_AUDIO_MAX_DURATION_MS - countdownElapsedMs,
    0
  );
  const countdownProgress =
    CHAPTER_FEEDBACK_AUDIO_MAX_DURATION_MS > 0
      ? countdownElapsedMs / CHAPTER_FEEDBACK_AUDIO_MAX_DURATION_MS
      : 0;
  const countdownStrokeDashoffset = FEEDBACK_AUDIO_COUNTDOWN_CIRCUMFERENCE * countdownProgress;
  const statusLabel = isRecording
    ? t('bible.chapterFeedbackAudioRecording', {
        duration: formatFeedbackAudioDuration(feedbackAudioElapsedMs),
      })
    : feedbackAudioDraft
      ? t('bible.chapterFeedbackAudioReady', {
          duration: formatFeedbackAudioDuration(previewDurationMs),
        })
      : t('bible.chapterFeedbackAudioIdle');

  // Record and Stop swap places under the user's finger, and the one-minute
  // limit stops a recording on its own, so each phase change is spoken once
  // (not the per-second timer). The first render only sets the baseline.
  const phase = isRecording
    ? 'recording'
    : isUploadingAudio
      ? 'uploading'
      : feedbackAudioDraft
        ? 'ready'
        : 'idle';
  const phaseAnnouncement =
    phase === 'uploading'
      ? t('bible.chapterFeedbackAudioUploading')
      : phase === 'idle'
        ? null
        : statusLabel;
  const announcedPhaseRef = useRef(phase);
  useEffect(() => {
    if (announcedPhaseRef.current === phase) return;
    announcedPhaseRef.current = phase;
    if (phaseAnnouncement) announceForAccessibility(phaseAnnouncement);
  }, [phase, phaseAnnouncement]);

  return (
    <View
      style={[
        styles.feedbackAudioCard,
        compact ? styles.feedbackAudioCardCompact : null,
        {
          backgroundColor: colors.bibleElevatedSurface,
          borderColor: colors.bibleDivider,
        },
      ]}
    >
      <View style={styles.feedbackAudioHeader}>
        <View style={styles.feedbackAudioHeaderMain}>
          {/* The ring and its bare "0:47" are visual; the status beside it says
              "Recording 0:13" in words. The time is capped so it stays inside the
              58pt ring at accessibility sizes. */}
          <View
            style={styles.feedbackAudioCountdown}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Svg
              width={FEEDBACK_AUDIO_COUNTDOWN_SIZE}
              height={FEEDBACK_AUDIO_COUNTDOWN_SIZE}
              viewBox={`0 0 ${FEEDBACK_AUDIO_COUNTDOWN_SIZE} ${FEEDBACK_AUDIO_COUNTDOWN_SIZE}`}
              style={styles.feedbackAudioCountdownSvg}
            >
              <Circle
                cx={FEEDBACK_AUDIO_COUNTDOWN_SIZE / 2}
                cy={FEEDBACK_AUDIO_COUNTDOWN_SIZE / 2}
                r={FEEDBACK_AUDIO_COUNTDOWN_RADIUS}
                stroke={colors.bibleDivider}
                strokeWidth={FEEDBACK_AUDIO_COUNTDOWN_STROKE_WIDTH}
                fill="none"
              />
              <Circle
                cx={FEEDBACK_AUDIO_COUNTDOWN_SIZE / 2}
                cy={FEEDBACK_AUDIO_COUNTDOWN_SIZE / 2}
                r={FEEDBACK_AUDIO_COUNTDOWN_RADIUS}
                stroke={isRecording ? colors.accentPrimary : colors.bibleAccent}
                strokeWidth={FEEDBACK_AUDIO_COUNTDOWN_STROKE_WIDTH}
                strokeLinecap="round"
                strokeDasharray={FEEDBACK_AUDIO_COUNTDOWN_CIRCUMFERENCE}
                strokeDashoffset={countdownStrokeDashoffset}
                fill="none"
                transform={`rotate(-90 ${FEEDBACK_AUDIO_COUNTDOWN_SIZE / 2} ${
                  FEEDBACK_AUDIO_COUNTDOWN_SIZE / 2
                })`}
              />
            </Svg>
            <Text
              maxFontSizeMultiplier={CONTROL_LABEL_MAX_FONT_SCALE}
              style={[styles.feedbackAudioCountdownText, { color: colors.biblePrimaryText }]}
            >
              {formatFeedbackAudioDuration(countdownRemainingMs)}
            </Text>
          </View>
          <View style={styles.feedbackAudioStatus}>
            <Ionicons
              name={
                isRecording ? 'mic' : feedbackAudioDraft ? 'musical-notes-outline' : 'mic-outline'
              }
              size={18}
              color={isRecording ? colors.error : colors.biblePrimaryText}
            />
            <Text style={[styles.feedbackAudioStatusText, { color: colors.biblePrimaryText }]}>
              {statusLabel}
            </Text>
          </View>
        </View>
        <Text style={[styles.feedbackAudioLimitText, { color: colors.bibleSecondaryText }]}>
          {t('bible.chapterFeedbackAudioLimit')}
        </Text>
      </View>

      {feedbackAudioPermissionDenied ? (
        <View style={styles.feedbackAudioHelpRow}>
          <Text
            style={[
              styles.feedbackAudioHelpText,
              styles.feedbackAudioHelpMessage,
              { color: colors.bibleSecondaryText },
            ]}
          >
            {t('bible.chapterFeedbackAudioPermissionHelp')}
          </Text>
          {/* Once the system stops re-prompting (Android "don't ask again"), settings is
                the only way to turn the microphone back on. */}
          <TouchableOpacity
            onPress={() => void Linking.openSettings()}
            accessibilityRole="button"
            accessibilityLabel={t('common.settings')}
            hitSlop={8}
          >
            <Text style={[styles.feedbackAudioHelpLink, { color: colors.bibleAccent }]}>
              {t('common.settings')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.feedbackAudioActionRow}>
        {!isRecording && !feedbackAudioDraft ? (
          <TouchableOpacity
            style={[
              styles.feedbackAudioButton,
              {
                borderColor: colors.bibleDivider,
                backgroundColor: colors.bibleSurface,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('bible.chapterFeedbackAudioRecord')}
            onPress={() => {
              void startFeedbackAudioRecording();
            }}
            disabled={isSubmittingFeedback}
          >
            <Ionicons name="mic-outline" size={17} color={colors.biblePrimaryText} />
            <Text style={[styles.feedbackAudioButtonText, { color: colors.biblePrimaryText }]}>
              {t('bible.chapterFeedbackAudioRecord')}
            </Text>
          </TouchableOpacity>
        ) : null}

        {isRecording ? (
          <TouchableOpacity
            style={[
              styles.feedbackAudioButton,
              {
                borderColor: colors.accentPrimary,
                backgroundColor: colors.accentPrimary,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('bible.chapterFeedbackAudioStop')}
            onPress={() => {
              void stopFeedbackAudioRecording();
            }}
          >
            <Ionicons name="stop-outline" size={17} color={colors.cardBackground} />
            <Text style={[styles.feedbackAudioButtonText, { color: colors.cardBackground }]}>
              {t('bible.chapterFeedbackAudioStop')}
            </Text>
          </TouchableOpacity>
        ) : null}

        {feedbackAudioDraft ? (
          <>
            <TouchableOpacity
              style={[
                styles.feedbackAudioIconButton,
                {
                  borderColor: colors.bibleDivider,
                  backgroundColor: colors.bibleSurface,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('bible.chapterFeedbackAudioPreview')}
              onPress={() => {
                void playFeedbackAudioPreview();
              }}
              disabled={isSubmittingFeedback}
            >
              <Ionicons name="play-outline" size={18} color={colors.biblePrimaryText} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.feedbackAudioIconButton,
                {
                  borderColor: colors.bibleDivider,
                  backgroundColor: colors.bibleSurface,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('bible.chapterFeedbackAudioRerecord')}
              onPress={discardFeedbackAudioDraft}
              disabled={isSubmittingFeedback}
            >
              <Ionicons name="refresh-outline" size={18} color={colors.biblePrimaryText} />
            </TouchableOpacity>
          </>
        ) : null}

        {isUploadingAudio ? (
          <View style={styles.feedbackAudioUploading}>
            <ActivityIndicator size="small" color={colors.accentPrimary} />
            <Text style={[styles.feedbackAudioHelpText, { color: colors.bibleSecondaryText }]}>
              {t('bible.chapterFeedbackAudioUploading')}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  feedbackAudioCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  feedbackAudioCardCompact: {
    padding: spacing.sm,
  },
  feedbackAudioHeader: {
    gap: 4,
  },
  feedbackAudioHeaderMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  feedbackAudioCountdown: {
    width: FEEDBACK_AUDIO_COUNTDOWN_SIZE,
    height: FEEDBACK_AUDIO_COUNTDOWN_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackAudioCountdownSvg: {
    position: 'absolute',
  },
  feedbackAudioCountdownText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  feedbackAudioStatus: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  feedbackAudioStatusText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  feedbackAudioLimitText: {
    fontSize: 12,
    lineHeight: 16,
  },
  feedbackAudioHelpText: {
    fontSize: 12,
    lineHeight: 16,
  },
  feedbackAudioHelpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  feedbackAudioHelpMessage: {
    flex: 1,
  },
  feedbackAudioHelpLink: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  feedbackAudioActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  feedbackAudioButton: {
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  feedbackAudioButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  feedbackAudioIconButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackAudioUploading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
