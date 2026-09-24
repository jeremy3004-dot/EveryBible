import { useState } from 'react';
import { Alert } from 'react-native';
import { useI18n } from '../../../hooks/useI18n';
import { describeAudioDownloadError } from '../../../services/audio/audioDownloadErrorMessage';
import { useBibleStore } from '../../../stores/bibleStore';
import { getNewTestamentAudioBookIds, type ManageAudioDownloadKey } from './translationManageModel';

interface ManageAudioDownloadsOptions {
  translationId: string;
  audioBookIds: string[];
  /** Audio can be downloaded for the book being read (gates the collections). */
  canDownloadAudio: boolean;
  canDownloadBookAudio: (bookId: string) => boolean;
}

/**
 * Audio downloads started from the manage sheet: the whole Bible, the New Testament, or one
 * book. Tracks which one is running so the sheet can show it busy, and explains a failure
 * with its specific reason (space, network, ...).
 */
export function useManageAudioDownloads({
  translationId,
  audioBookIds,
  canDownloadAudio,
  canDownloadBookAudio,
}: ManageAudioDownloadsOptions) {
  const { t } = useI18n();
  const downloadAudioForBook = useBibleStore((state) => state.downloadAudioForBook);
  const downloadAudioForBooks = useBibleStore((state) => state.downloadAudioForBooks);
  const downloadAudioForTranslation = useBibleStore((state) => state.downloadAudioForTranslation);
  const [activeAudioDownloadKey, setActiveAudioDownloadKey] =
    useState<ManageAudioDownloadKey | null>(null);

  const runDownload = async (key: ManageAudioDownloadKey, download: () => Promise<unknown>) => {
    setActiveAudioDownloadKey(key);

    try {
      await download();
    } catch (downloadError) {
      Alert.alert(t('common.error'), describeAudioDownloadError(downloadError, t));
    } finally {
      setActiveAudioDownloadKey(null);
    }
  };

  const downloadAudioCollection = async (action: 'full-bible' | 'new-testament') => {
    if (!canDownloadAudio) {
      return;
    }

    await runDownload(action === 'new-testament' ? 'nt' : 'all', () =>
      action === 'new-testament'
        ? downloadAudioForBooks(translationId, getNewTestamentAudioBookIds(audioBookIds))
        : downloadAudioForTranslation(translationId)
    );
  };

  const downloadBookAudio = async (bookId: string) => {
    if (!canDownloadBookAudio(bookId)) {
      return;
    }

    await runDownload(`book:${bookId}`, () => downloadAudioForBook(translationId, bookId));
  };

  return { activeAudioDownloadKey, downloadAudioCollection, downloadBookAudio };
}
