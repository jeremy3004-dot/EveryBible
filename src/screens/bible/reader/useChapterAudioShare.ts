import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useState } from 'react';
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
    await new Promise<void>((resolve) => {
      let settled = false;
      const complete = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        resolve();
      };
      // Guard against long-running interaction handles that can block runAfterInteractions forever.
      const timeoutId = setTimeout(complete, 300);
      InteractionManager.runAfterInteractions(complete);
    });
  };

  const handleShareFullChapterAudio = async () => {
    if (pendingChapterAudioShareAction) {
      return;
    }

    setShowChapterAudioShareSheet(false);
    setPendingChapterAudioShareAction('full');

    try {
      await waitForChapterAudioShareSheetDismissal();
      const {
        AUDIO_DOWNLOAD_ROOT_URI,
        chapterAudioShareRootUri,
        expoAudioFileSystemAdapter,
        fetchRemoteChapterAudio,
        getDownloadedChapterAudioUri,
        prepareChapterAudioShareAsset,
      } = await loadAudioShareDependencies();

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

      if (!audioShareAsset) {
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
        detail: 'share-audio-full',
      });

      const Sharing = await tryLoadSharing();
      if (Sharing && (await Sharing.isAvailableAsync())) {
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
      const message = t('bible.audioDownloadFailed');
      Alert.alert(t('common.error'), message);
    } finally {
      setPendingChapterAudioShareAction(null);
    }
  };

  const handleShareAudioPortion = async () => {
    if (pendingChapterAudioShareAction) {
      return;
    }

    setShowChapterAudioShareSheet(false);
    setPendingChapterAudioShareAction('portion');

    try {
      await waitForChapterAudioShareSheetDismissal();
      const {
        AUDIO_DOWNLOAD_ROOT_URI,
        chapterAudioShareRootUri,
        expoAudioFileSystemAdapter,
        fetchRemoteChapterAudio,
        getDownloadedChapterAudioUri,
        prepareChapterAudioShareAsset,
      } = await loadAudioShareDependencies();

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
      setPendingChapterAudioShareAction(null);
      const message = t('bible.audioDownloadFailed');
      Alert.alert(t('common.error'), message);
    }
  };

  return {
    chapterAudioShareActionLabel,
    handleOpenChapterAudioShareSheet,
    handleShareAudioPortion,
    handleShareFullChapterAudio,
    pendingChapterAudioShareAction,
    setShowChapterAudioShareSheet,
    showChapterAudioShareSheet,
  };
}
