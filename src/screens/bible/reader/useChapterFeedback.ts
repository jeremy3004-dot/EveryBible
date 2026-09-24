import { useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { config } from '../../../constants/config';
import { submitChapterFeedbackOrQueue } from '../../../services/feedback';
import { uploadChapterFeedbackAudio } from '../../../services/feedback/chapterFeedbackAudio';
import { normalizeChapterFeedbackIdentity } from '../../../services/feedback/chapterFeedbackIdentity';
import type { ChapterFeedbackSourceScreen } from '../../../services/feedback/chapterFeedbackService';
import { useAuthStore } from '../../../stores/authStore';
import { announceLiveRegionText } from '../../../utils/a11y';
import {
  getFeedbackParticipationMode,
  useTranslatorReviewStore,
} from '../../../stores/translatorReviewStore';
import type { BibleTranslation } from '../../../types';
import {
  normalizeChapterFeedbackComment,
  shouldEnableChapterFeedbackSubmit,
} from '../bibleReaderFeedbackModel';
import { useChapterFeedbackAudio } from './useChapterFeedbackAudio';

export interface ChapterFeedbackInput {
  currentTranslation: string;
  currentTranslationInfo: BibleTranslation | undefined;
  translationLabel: string;
  bookId: string;
  chapter: number;
  /** Closes whatever sheet the feedback entry point was reached from. */
  onOpenChapterFeedback: () => void;
}

/**
 * Chapter feedback from the reader: who may give it (community or council), the
 * draft (sentiment, note, voice note), and submitting it from the reader's sheet
 * or the listen page's inline composer.
 */
export function useChapterFeedback({
  currentTranslation,
  currentTranslationInfo,
  translationLabel,
  bookId,
  chapter,
  onOpenChapterFeedback,
}: ChapterFeedbackInput) {
  const { t, i18n } = useTranslation();
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackSentiment, setFeedbackSentiment] = useState<'up' | 'down' | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitError, setFeedbackSubmitError] = useState<string | null>(null);
  const legacyFeedbackEnabled = useAuthStore((state) => state.preferences.chapterFeedbackEnabled);
  const storedMode = useTranslatorReviewStore((state) => state.mode);
  const participationMode = getFeedbackParticipationMode(
    { mode: storedMode, enabled: useTranslatorReviewStore((state) => state.enabled) },
    legacyFeedbackEnabled
  );
  const chapterFeedbackEnabled =
    participationMode === 'community' || participationMode === 'scripture_council';
  const councilPasscode = useTranslatorReviewStore((state) => state.councilPasscode);
  const chapterFeedbackName = useAuthStore((state) => state.preferences.chapterFeedbackName);
  const chapterFeedbackRole = useAuthStore((state) => state.preferences.chapterFeedbackRole);
  const contentLanguageCode = useAuthStore((state) => state.preferences.contentLanguageCode);
  const contentLanguageName = useAuthStore((state) => state.preferences.contentLanguageName);
  const audio = useChapterFeedbackAudio({ isSubmittingFeedback, setFeedbackSubmitError });

  // Both composers render this error in a live region, which only TalkBack
  // reads; VoiceOver is told directly (offline, sign-in, microphone refused).
  useEffect(() => {
    if (feedbackSubmitError) announceLiveRegionText(feedbackSubmitError);
  }, [feedbackSubmitError]);
  const { feedbackAudioState, setFeedbackAudioState, feedbackAudioDraft } = audio;
  const savedChapterFeedbackIdentity = normalizeChapterFeedbackIdentity({
    name: chapterFeedbackName ?? '',
    role: chapterFeedbackRole ?? '',
  });
  const canSubmitFeedback =
    shouldEnableChapterFeedbackSubmit({
      sentiment: feedbackSentiment,
      isSubmitting: isSubmittingFeedback || feedbackAudioState === 'recording',
    }) && savedChapterFeedbackIdentity != null;

  const resetFeedbackDraft = () => {
    audio.resetFeedbackAudio();
    setFeedbackSentiment(null);
    setFeedbackComment('');
    setFeedbackSubmitError(null);
  };

  const handleCloseFeedbackModal = () => {
    if (isSubmittingFeedback) {
      return;
    }

    setShowFeedbackModal(false);
  };

  const handleOpenChapterFeedback = () => {
    onOpenChapterFeedback();

    setFeedbackSubmitError(null);
    setShowFeedbackModal(true);
  };

  const handleSubmitChapterFeedback = async (sourceScreen: ChapterFeedbackSourceScreen) => {
    if (!chapterFeedbackEnabled || !feedbackSentiment || isSubmittingFeedback) {
      return;
    }

    setIsSubmittingFeedback(true);
    if (feedbackAudioDraft) {
      setFeedbackAudioState('uploading');
    }
    setFeedbackSubmitError(null);

    const audioUploadResult = feedbackAudioDraft
      ? await uploadChapterFeedbackAudio(feedbackAudioDraft, {
          translationId: currentTranslation,
          bookId,
          chapter,
        })
      : null;

    if (audioUploadResult && !audioUploadResult.success) {
      setIsSubmittingFeedback(false);
      setFeedbackAudioState('error');
      setFeedbackSubmitError(t('bible.chapterFeedbackAudioUploadError'));
      return;
    }

    // Offline, a written response is kept on the device and sent by the next sync.
    const result = await submitChapterFeedbackOrQueue({
      translationId: currentTranslation,
      translationLanguage: currentTranslationInfo?.language ?? translationLabel,
      bookId,
      chapter,
      sentiment: feedbackSentiment,
      comment: normalizeChapterFeedbackComment(feedbackComment),
      interfaceLanguage: i18n.resolvedLanguage ?? i18n.language ?? 'en',
      contentLanguageCode,
      contentLanguageName,
      participantName: savedChapterFeedbackIdentity?.name ?? null,
      participantRole: savedChapterFeedbackIdentity?.role ?? null,
      contributorCategory:
        participationMode === 'scripture_council' ? 'scripture_council' : 'community',
      councilPasscode: participationMode === 'scripture_council' ? councilPasscode : undefined,
      audioResponse: audioUploadResult?.data ?? null,
      sourceScreen,
      appPlatform: Platform.OS,
      appVersion: config.version,
    });

    setIsSubmittingFeedback(false);

    if (result.success) {
      if (sourceScreen === 'reader') {
        setShowFeedbackModal(false);
      }
      resetFeedbackDraft();

      if (result.queued) {
        Alert.alert(t('bible.chapterFeedbackQueuedTitle'), t('bible.chapterFeedbackQueued'));
        return;
      }
      Alert.alert(t('bible.chapterFeedbackSuccessTitle'), t('bible.chapterFeedbackSuccess'));
      return;
    }

    if (feedbackAudioDraft) {
      setFeedbackAudioState('preview');
    }
    setFeedbackSubmitError(
      result.offline
        ? t('bible.chapterFeedbackOffline')
        : result.requiresSignIn
          ? t('bible.chapterFeedbackSignInRequired')
          : t('common.unexpectedError')
    );
  };

  return {
    ...audio,
    chapterFeedbackEnabled,
    participationMode,
    savedChapterFeedbackIdentity,
    showFeedbackModal,
    feedbackSentiment,
    setFeedbackSentiment,
    feedbackComment,
    setFeedbackComment,
    isSubmittingFeedback,
    feedbackSubmitError,
    setFeedbackSubmitError,
    canSubmitFeedback,
    handleCloseFeedbackModal,
    handleOpenChapterFeedback,
    handleSubmitChapterFeedback,
  };
}

export type ChapterFeedback = ReturnType<typeof useChapterFeedback>;
