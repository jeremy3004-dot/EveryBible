import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Alert, InteractionManager, Platform, Share } from 'react-native';
import { useTranslation } from 'react-i18next';
import { trackBibleExperienceEvent } from '../../../services/analytics/bibleExperienceAnalytics';
import { buildBibleDeepLink } from '../../../services/bible/deepLinkParser';
import type { ReaderAudioPositionSnapshot } from '../ReaderAudioPositionParts';
import type { AudioPortionShareDraft } from './audioShareDependencies';
import {
  loadAudioShareDependencies,
  tryLoadSharing,
  loadVideoTrimDependencies,
} from './audioShareDependencies';
import {
  AUDIO_PORTION_MIN_DURATION_MS,
  AUDIO_PORTION_DEFAULT_DURATION_MS,
} from './readerConstants';

export interface UseChapterAudioShareInput {
  audioPositionRef: RefObject<ReaderAudioPositionSnapshot>;
  bookId: string;
  chapter: number;
  chapterShareTitle: string;
  currentTranslation: string;
  isCurrentAudioChapter: boolean;
  setAudioPortionEndMs: Dispatch<SetStateAction<number>>;
  setAudioPortionShareDraft: Dispatch<SetStateAction<AudioPortionShareDraft | null>>;
  setAudioPortionStartMs: Dispatch<SetStateAction<number>>;
  setShowAudioOptionsSheet: Dispatch<SetStateAction<boolean>>;
  setShowChapterActionsSheet: Dispatch<SetStateAction<boolean>>;
}

/** Sharing the chapter audio: the share sheet, the whole chapter as a file, or a downloaded copy handed to the clip trimmer. */
export function useChapterAudioShare({
  audioPositionRef,
  bookId,
  chapter,
  chapterShareTitle,
  currentTranslation,
  isCurrentAudioChapter,
  setAudioPortionEndMs,
  setAudioPortionShareDraft,
  setAudioPortionStartMs,
  setShowAudioOptionsSheet,
  setShowChapterActionsSheet,
}: UseChapterAudioShareInput) {
  const { t } = useTranslation();
  const [showChapterAudioShareSheet, setShowChapterAudioShareSheet] = useState(false);
  const [pendingChapterAudioShareAction, setPendingChapterAudioShareAction] = useState<
    'full' | 'portion' | null
  >(null);
  const requestRef = useRef<object | null>(null);
  const sheetDismissedRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    requestRef.current = null;
    setPendingChapterAudioShareAction(null);
    return () => {
      requestRef.current = null;
      sheetDismissedRef.current?.();
    };
  }, [bookId, chapter, currentTranslation]);

  const chapterAudioShareActionLabel =
    pendingChapterAudioShareAction === 'portion'
      ? t('bible.shareAudioPortion')
      : t('bible.shareChapterAudio');

  const handleOpenChapterAudioShareSheet = () => {
    setShowAudioOptionsSheet(false);
    setShowChapterActionsSheet(false);
    setShowChapterAudioShareSheet(true);
  };

  const waitForChapterAudioShareSheetDismissal = async () => {
    if (!showChapterAudioShareSheet) return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const complete = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        if (sheetDismissedRef.current === complete) sheetDismissedRef.current = null;
        resolve();
      };
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      // iOS can present the next native sheet only after the Modal's fade ends.
      if (Platform.OS === 'ios') {
        sheetDismissedRef.current = complete;
      } else {
        timeoutId = setTimeout(complete, 300);
        InteractionManager.runAfterInteractions(complete);
      }
    });
  };

  const handleShareFullChapterAudio = async () => {
    if (requestRef.current) {
      return;
    }
    const request = {};
    requestRef.current = request;
    const isCurrent = () => requestRef.current === request;
    // Past this point the audio exists, so a failure is the share sheet's, not a download's.
    let audioReady = false;

    setShowChapterAudioShareSheet(false);
    setPendingChapterAudioShareAction('full');

    try {
      await waitForChapterAudioShareSheetDismissal();
      if (!isCurrent()) return;
      const {
        AUDIO_DOWNLOAD_ROOT_URI,
        chapterAudioShareRootUri,
        expoAudioFileSystemAdapter,
        fetchRemoteChapterAudio,
        getDownloadedChapterAudioUri,
        prepareChapterAudioShareAsset,
      } = await loadAudioShareDependencies();
      if (!isCurrent()) return;

      const audioShareAsset = await prepareChapterAudioShareAsset({
        translationId: currentTranslation,
        bookId,
        chapter,
        fileSystem: expoAudioFileSystemAdapter,
        rootUri: chapterAudioShareRootUri,
        resolveDownloadedAudioUri: (translationId, bookId, chapter) =>
          getDownloadedChapterAudioUri(
            translationId,
            bookId,
            chapter,
            expoAudioFileSystemAdapter,
            AUDIO_DOWNLOAD_ROOT_URI
          ),
        resolveRemoteAudio: fetchRemoteChapterAudio,
      });
      if (!isCurrent()) return;

      if (!audioShareAsset) {
        Alert.alert(t('common.error'), t('bible.audioDownloadFailed'));
        return;
      }

      audioReady = true;
      trackBibleExperienceEvent({
        name: 'library_action',
        bookId,
        chapter,
        source: 'reader-actions',
        mode: 'listen',
        translationId: currentTranslation,
        detail: 'share-audio-full',
      });

      const Sharing = await tryLoadSharing();
      if (!isCurrent()) return;
      const available = Sharing && (await Sharing.isAvailableAsync());
      if (!isCurrent()) return;
      if (Sharing && available) {
        setPendingChapterAudioShareAction(null);
        await Sharing.shareAsync(audioShareAsset.uri, {
          dialogTitle: t('groups.share'),
          mimeType: audioShareAsset.mimeType,
          UTI: 'public.audio',
        });
        return;
      }

      const url = buildBibleDeepLink(bookId, chapter);
      setPendingChapterAudioShareAction(null);
      await Share.share(
        Platform.OS === 'android'
          ? { message: url ? `${chapterShareTitle}\n${url}` : chapterShareTitle }
          : { message: chapterShareTitle, url }
      );
    } catch {
      if (!isCurrent()) return;
      Alert.alert(
        t('common.error'),
        t(audioReady ? 'common.somethingWentWrong' : 'bible.audioDownloadFailed')
      );
    } finally {
      if (isCurrent()) {
        requestRef.current = null;
        setPendingChapterAudioShareAction(null);
      }
    }
  };

  const handleShareAudioPortion = async () => {
    if (requestRef.current) {
      return;
    }
    const request = {};
    requestRef.current = request;
    const isCurrent = () => requestRef.current === request;

    setShowChapterAudioShareSheet(false);
    setPendingChapterAudioShareAction('portion');

    try {
      await waitForChapterAudioShareSheetDismissal();
      if (!isCurrent()) return;
      const {
        AUDIO_DOWNLOAD_ROOT_URI,
        chapterAudioShareRootUri,
        expoAudioFileSystemAdapter,
        fetchRemoteChapterAudio,
        getDownloadedChapterAudioUri,
        prepareChapterAudioShareAsset,
      } = await loadAudioShareDependencies();
      if (!isCurrent()) return;

      const audioShareAsset = await prepareChapterAudioShareAsset({
        translationId: currentTranslation,
        bookId,
        chapter,
        fileSystem: expoAudioFileSystemAdapter,
        rootUri: chapterAudioShareRootUri,
        resolveDownloadedAudioUri: (translationId, bookId, chapter) =>
          getDownloadedChapterAudioUri(
            translationId,
            bookId,
            chapter,
            expoAudioFileSystemAdapter,
            AUDIO_DOWNLOAD_ROOT_URI
          ),
        resolveRemoteAudio: fetchRemoteChapterAudio,
      });
      if (!isCurrent()) return;

      if (!audioShareAsset) {
        setPendingChapterAudioShareAction(null);
        Alert.alert(t('common.error'), t('bible.audioDownloadFailed'));
        return;
      }

      trackBibleExperienceEvent({
        name: 'library_action',
        bookId,
        chapter,
        source: 'reader-actions',
        mode: 'listen',
        translationId: currentTranslation,
        detail: 'share-audio-clip',
      });

      const { VideoTrimModule, isValidTrimMediaFile } = await loadVideoTrimDependencies();
      if (!isCurrent()) return;
      const validateTrimMediaFile =
        typeof isValidTrimMediaFile === 'function'
          ? isValidTrimMediaFile
          : typeof (VideoTrimModule as { isValidFile?: (url: string) => Promise<unknown> })
                .isValidFile === 'function'
            ? (VideoTrimModule as { isValidFile: (url: string) => Promise<unknown> }).isValidFile
            : null;

      const validationResult = validateTrimMediaFile
        ? await validateTrimMediaFile(audioShareAsset.uri)
        : null;
      if (!isCurrent()) return;
      const isValidAudioFile =
        validationResult == null || typeof validationResult === 'boolean'
          ? validationResult !== false
          : (validationResult as { isValid?: boolean } | null | undefined)?.isValid === true;
      if (!isValidAudioFile) {
        setPendingChapterAudioShareAction(null);
        Alert.alert(t('common.error'), t('bible.audioDownloadFailed'));
        return;
      }

      const validatedDurationMs =
        validationResult != null && typeof validationResult !== 'boolean'
          ? (validationResult as { duration?: number } | null | undefined)?.duration
          : null;
      const { currentPosition: livePositionMs, duration: liveDurationMs } =
        audioPositionRef.current;
      const fallbackDurationMs =
        isCurrentAudioChapter && liveDurationMs > 0 ? Math.round(liveDurationMs) : 0;
      const resolvedDurationMs = Math.max(
        validatedDurationMs ?? fallbackDurationMs,
        AUDIO_PORTION_MIN_DURATION_MS
      );
      const initialStartMs = Math.max(
        0,
        Math.min(
          isCurrentAudioChapter ? livePositionMs : 0,
          resolvedDurationMs - AUDIO_PORTION_MIN_DURATION_MS
        )
      );
      const initialEndMs = Math.min(
        resolvedDurationMs,
        Math.max(
          initialStartMs + AUDIO_PORTION_MIN_DURATION_MS,
          initialStartMs + AUDIO_PORTION_DEFAULT_DURATION_MS
        )
      );

      setAudioPortionShareDraft({
        sourceUri: audioShareAsset.uri,
        fileExtension: audioShareAsset.fileExtension,
        mimeType: audioShareAsset.mimeType,
        durationMs: resolvedDurationMs,
      });
      setAudioPortionStartMs(initialStartMs);
      setAudioPortionEndMs(initialEndMs);
      setPendingChapterAudioShareAction(null);
    } catch {
      if (!isCurrent()) return;
      setPendingChapterAudioShareAction(null);
      const message = t('bible.audioDownloadFailed');
      Alert.alert(t('common.error'), message);
    } finally {
      if (isCurrent()) {
        requestRef.current = null;
        setPendingChapterAudioShareAction(null);
      }
    }
  };

  return {
    chapterAudioShareActionLabel,
    handleOpenChapterAudioShareSheet,
    handleChapterAudioShareSheetDismissed: () => sheetDismissedRef.current?.(),
    handleShareAudioPortion,
    handleShareFullChapterAudio,
    pendingChapterAudioShareAction,
    setShowChapterAudioShareSheet,
    showChapterAudioShareSheet,
  };
}
