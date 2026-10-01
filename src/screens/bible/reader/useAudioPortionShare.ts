import type { AudioStatus } from '../../../types/audio';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, InteractionManager, Platform, Share } from 'react-native';
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
  currentTranslation: string;
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
  currentTranslation,
  isCurrentAudioChapter,
  resetFollowAlongClamp,
  seekTo,
  status,
  togglePlayPause,
}: UseAudioPortionShareInput) {
  const { t } = useTranslation();
  const [audioPortionShareDraft, updateAudioPortionShareDraft] =
    useState<AudioPortionShareDraft | null>(null);
  const [audioPortionStartMs, setAudioPortionStartMs] = useState(0);
  const [audioPortionEndMs, setAudioPortionEndMs] = useState(0);
  const [isSharingAudioPortion, setIsSharingAudioPortion] = useState(false);
  const [isPreviewingAudioPortion, setIsPreviewingAudioPortion] = useState(false);
  const requestRef = useRef<object | null>(null);
  const sheetDismissedRef = useRef<(() => void) | null>(null);
  const setAudioPortionShareDraft: Dispatch<SetStateAction<AudioPortionShareDraft | null>> =
    useCallback((next) => {
      requestRef.current = null;
      sheetDismissedRef.current?.();
      setIsSharingAudioPortion(false);
      updateAudioPortionShareDraft(next);
    }, []);
  useEffect(() => {
    requestRef.current = null;
    setIsSharingAudioPortion(false);
    setIsPreviewingAudioPortion(false);
    setAudioPortionStartMs(0);
    setAudioPortionEndMs(0);
    updateAudioPortionShareDraft(null);
    return () => {
      requestRef.current = null;
      sheetDismissedRef.current?.();
    };
  }, [bookId, chapter, currentTranslation]);

  const closeAudioPortionSheetAndWait = () =>
    new Promise<void>((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const complete = () => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        if (sheetDismissedRef.current === complete) sheetDismissedRef.current = null;
        resolve();
      };
      if (Platform.OS === 'ios') sheetDismissedRef.current = complete;
      else {
        timeoutId = setTimeout(complete, 300);
        InteractionManager.runAfterInteractions(complete);
      }
      updateAudioPortionShareDraft(null);
    });

  const audioPortionRangeDurationMs = Math.max(audioPortionEndMs - audioPortionStartMs, 0);

  // A preview started from a paused player renders once before playback has begun (the
  // status passes through 'loading'), so it only ends when playback stops after having started.
  const previewPlaybackStartedRef = useRef(false);
  useEffect(() => {
    if (!isPreviewingAudioPortion) {
      previewPlaybackStartedRef.current = false;
      return;
    }
    if (!audioPortionShareDraft || !isCurrentAudioChapter) {
      return;
    }

    if (status === 'playing' || status === 'loading') {
      previewPlaybackStartedRef.current = true;
    } else if (previewPlaybackStartedRef.current) {
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
    if (!audioPortionShareDraft || requestRef.current) {
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

    const request = {};
    requestRef.current = request;
    const isCurrent = () => requestRef.current === request;
    setIsSharingAudioPortion(true);
    try {
      const { VideoTrimModule, trimAudioMedia } = await loadVideoTrimDependencies();
      if (!isCurrent()) return;
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
      if (!isCurrent()) return;

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
      const Sharing = await tryLoadSharing();
      if (!isCurrent()) return;
      const available = Sharing && (await Sharing.isAvailableAsync());
      if (!isCurrent()) return;
      await closeAudioPortionSheetAndWait();
      if (!isCurrent()) return;
      if (Sharing && available) {
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
      if (isCurrent()) {
        updateAudioPortionShareDraft(null);
        setAudioPortionStartMs(0);
        setAudioPortionEndMs(0);
      }
    } catch {
      if (!isCurrent()) return;
      const message = t('bible.audioDownloadFailed');
      Alert.alert(t('common.error'), message);
    } finally {
      if (isCurrent()) {
        requestRef.current = null;
        setIsSharingAudioPortion(false);
      }
    }
  };

  return {
    audioPortionEndMs,
    audioPortionRangeDurationMs,
    audioPortionShareDraft,
    audioPortionStartMs,
    handleAudioPortionEndSeek,
    handleAudioPortionShareSheetDismissed: () => sheetDismissedRef.current?.(),
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
