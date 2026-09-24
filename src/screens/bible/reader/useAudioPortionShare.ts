import type { AudioStatus } from '../../../types/audio';
import type { RefObject } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Share } from 'react-native';
import { useTranslation } from 'react-i18next';
import { buildBibleDeepLink } from '../../../services/bible/deepLinkParser';
import type { ReaderAudioPositionSnapshot } from '../ReaderAudioPositionParts';
import { tryLoadSharing, loadVideoTrimDependencies } from './audioShareDependencies';
import { AUDIO_PORTION_MIN_DURATION_MS } from './readerConstants';
import type { AudioPortionShareDraft } from './audioShareDependencies';

export interface UseAudioPortionShareInput {
  audioPositionRef: RefObject<ReaderAudioPositionSnapshot>;
  bookId: string;
  chapter: number;
  chapterShareTitle: string;
  isCurrentAudioChapter: boolean;
  resetFollowAlongClamp: () => void;
  seekTo: (requestedPositionMs: number) => Promise<void>;
  status: AudioStatus;
  togglePlayPause: () => Promise<void>;
}

/** Trimming a clip of the chapter audio to share: the draft range, previewing it through the player, and trimming and sharing the clip. */
export function useAudioPortionShare({
  audioPositionRef,
  bookId,
  chapter,
  chapterShareTitle,
  isCurrentAudioChapter,
  resetFollowAlongClamp,
  seekTo,
  status,
  togglePlayPause,
}: UseAudioPortionShareInput) {
  const { t } = useTranslation();
  const [audioPortionShareDraft, setAudioPortionShareDraft] =
    useState<AudioPortionShareDraft | null>(null);
  const [audioPortionStartMs, setAudioPortionStartMs] = useState(0);
  const [audioPortionEndMs, setAudioPortionEndMs] = useState(0);
  const [isSharingAudioPortion, setIsSharingAudioPortion] = useState(false);
  const [isPreviewingAudioPortion, setIsPreviewingAudioPortion] = useState(false);

  const audioPortionRangeDurationMs = Math.max(audioPortionEndMs - audioPortionStartMs, 0);

  useEffect(() => {
    if (!isPreviewingAudioPortion || !audioPortionShareDraft || !isCurrentAudioChapter) {
      return;
    }

    if (status !== 'playing') {
      setIsPreviewingAudioPortion(false);
    }
  }, [audioPortionShareDraft, isCurrentAudioChapter, isPreviewingAudioPortion, status]);

  // Reaching the end of the previewed range is a position-tick concern, so it
  // lives in <ReaderAudioPortionPreviewGuard/> and is mounted only while a
  // preview is actually running.
  const isWatchingAudioPortionPreview =
    isPreviewingAudioPortion &&
    audioPortionShareDraft != null &&
    isCurrentAudioChapter &&
    status === 'playing';
  const handleAudioPortionPreviewEnd = useCallback(() => {
    void togglePlayPause();
    void seekTo(audioPortionStartMs);
    setIsPreviewingAudioPortion(false);
  }, [audioPortionStartMs, seekTo, togglePlayPause]);

  const handleCloseAudioPortionSheet = () => {
    if (isSharingAudioPortion) {
      return;
    }

    if (isPreviewingAudioPortion && isCurrentAudioChapter && status === 'playing') {
      void togglePlayPause();
    }

    setIsPreviewingAudioPortion(false);
    setAudioPortionShareDraft(null);
    setAudioPortionStartMs(0);
    setAudioPortionEndMs(0);
  };

  const handleAudioPortionStartSeek = (nextStartMs: number) => {
    if (!audioPortionShareDraft) {
      return;
    }

    const clampedStartMs = Math.max(0, Math.min(nextStartMs, audioPortionShareDraft.durationMs));
    const maxStartMs = Math.max(audioPortionEndMs - AUDIO_PORTION_MIN_DURATION_MS, 0);
    setAudioPortionStartMs(Math.min(clampedStartMs, maxStartMs));
  };

  const handleAudioPortionEndSeek = (nextEndMs: number) => {
    if (!audioPortionShareDraft) {
      return;
    }

    const clampedEndMs = Math.max(0, Math.min(nextEndMs, audioPortionShareDraft.durationMs));
    const minEndMs = Math.min(
      audioPortionShareDraft.durationMs,
      audioPortionStartMs + AUDIO_PORTION_MIN_DURATION_MS
    );
    setAudioPortionEndMs(Math.max(clampedEndMs, minEndMs));
  };

  const handleToggleAudioPortionPreview = () => {
    const { duration: liveDurationMs } = audioPositionRef.current;
    if (!audioPortionShareDraft || !isCurrentAudioChapter || liveDurationMs <= 0) {
      return;
    }

    if (isPreviewingAudioPortion) {
      if (status === 'playing') {
        void togglePlayPause();
      }
      setIsPreviewingAudioPortion(false);
      return;
    }

    const nextStartMs = Math.max(0, Math.min(audioPortionStartMs, liveDurationMs));
    resetFollowAlongClamp();
    void seekTo(nextStartMs);
    if (status !== 'playing') {
      void togglePlayPause();
    }
    setIsPreviewingAudioPortion(true);
  };

  const handleConfirmAudioPortionShare = async () => {
    if (!audioPortionShareDraft || isSharingAudioPortion) {
      return;
    }

    if (isPreviewingAudioPortion && isCurrentAudioChapter && status === 'playing') {
      void togglePlayPause();
    }
    setIsPreviewingAudioPortion(false);

    const startTime = Math.max(0, Math.round(audioPortionStartMs));
    const endTime = Math.max(
      startTime + AUDIO_PORTION_MIN_DURATION_MS,
      Math.round(audioPortionEndMs)
    );
    if (endTime > audioPortionShareDraft.durationMs) {
      Alert.alert(t('common.error'), t('bible.audioDownloadFailed'));
      return;
    }

    const { VideoTrimModule, trimAudioMedia } = await loadVideoTrimDependencies();
    const trimMediaFile =
      typeof trimAudioMedia === 'function'
        ? trimAudioMedia
        : typeof (
              VideoTrimModule as {
                trim?: (url: string, options: unknown) => Promise<unknown>;
              }
            ).trim === 'function'
          ? (
              VideoTrimModule as {
                trim: (url: string, options: unknown) => Promise<unknown>;
              }
            ).trim
          : null;
    if (!trimMediaFile) {
      Alert.alert(t('common.error'), t('bible.audioDownloadFailed'));
      return;
    }

    setIsSharingAudioPortion(true);
    try {
      const trimResult = await trimMediaFile(audioPortionShareDraft.sourceUri, {
        type: 'audio',
        outputExt: audioPortionShareDraft.fileExtension,
        startTime,
        endTime,
        saveToPhoto: false,
        removeAfterSavedToPhoto: false,
        removeAfterFailedToSavePhoto: false,
        enableRotation: false,
        rotationAngle: 0,
      });

      const trimOutputPath =
        typeof trimResult === 'string'
          ? trimResult
          : (trimResult as { outputPath?: string; success?: boolean } | null | undefined)
              ?.outputPath;
      const trimSucceeded =
        typeof trimResult === 'string'
          ? trimResult.length > 0
          : (trimResult as { success?: boolean } | null | undefined)?.success !== false;

      if (!trimSucceeded || !trimOutputPath) {
        Alert.alert(t('common.error'), t('bible.audioDownloadFailed'));
        return;
      }

      const trimOutputUri = trimOutputPath.startsWith('file://')
        ? trimOutputPath
        : `file://${trimOutputPath}`;
      handleCloseAudioPortionSheet();

      const Sharing = await tryLoadSharing();
      if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(trimOutputUri, {
          dialogTitle: t('groups.share'),
          mimeType: audioPortionShareDraft.mimeType,
          UTI: 'public.audio',
        });
      } else {
        const url = buildBibleDeepLink(bookId, chapter);
        await Share.share(
          Platform.OS === 'android'
            ? { message: url ? `${chapterShareTitle}\n${url}` : chapterShareTitle }
            : { message: chapterShareTitle, url }
        );
      }
    } catch {
      const message = t('bible.audioDownloadFailed');
      Alert.alert(t('common.error'), message);
    } finally {
      setIsSharingAudioPortion(false);
    }
  };

  return {
    audioPortionEndMs,
    audioPortionRangeDurationMs,
    audioPortionShareDraft,
    audioPortionStartMs,
    handleAudioPortionEndSeek,
    handleAudioPortionPreviewEnd,
    handleAudioPortionStartSeek,
    handleCloseAudioPortionSheet,
    handleConfirmAudioPortionShare,
    handleToggleAudioPortionPreview,
    isPreviewingAudioPortion,
    isSharingAudioPortion,
    isWatchingAudioPortionPreview,
    setAudioPortionEndMs,
    setAudioPortionShareDraft,
    setAudioPortionStartMs,
  };
}
