import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../hooks/useI18n';
import { useBibleStore } from '../../../stores/bibleStore';
import type { BibleTranslation } from '../../../types';
import { normalizeTranslationLanguage } from '../bibleTranslationModel';
import {
  reportTranslationDownloadFailure,
  showTranslationDownloadFailedAlert,
} from '../translationDownloadFailureAlert';
import {
  createTranslationPickerDownloadQueue,
  type TranslationPickerDownloadDeps,
  type TranslationPickerDownloadQueue,
  type TranslationPickerDownloadState,
} from '../translationPickerDownloadQueue';
import { useLatestRef } from './useLatestRef';

export interface TranslationPickerCallbacks {
  /** Modal hosts keep the list mounted while hidden; hidden selections cannot activate. */
  isActive?: boolean;
  onRequestClose?: () => void;
  onTranslationActivated?: (translation: BibleTranslation) => void;
}

/**
 * Text downloads started from the picker, one at a time (see translationPickerDownloadQueue.ts).
 * A download that finishes while it is still the reader's latest choice opens its Bible; a
 * failure is reported and offers a retry. Closing the picker drops the waiting choice.
 */
export function useTranslationPickerDownloads({
  isActive = true,
  onRequestClose,
  onTranslationActivated,
}: TranslationPickerCallbacks) {
  const { t } = useI18n();
  const activeRef = useLatestRef(isActive);
  const mountedRef = useRef(false);
  const retryGenerationRef = useRef(0);
  const invalidateDownloadRetry = useCallback(() => {
    retryGenerationRef.current += 1;
  }, []);
  const setCurrentTranslation = useBibleStore((state) => state.setCurrentTranslation);
  const setPreferredTranslationLanguage = useBibleStore(
    (state) => state.setPreferredTranslationLanguage
  );
  const downloadTranslation = useBibleStore((state) => state.downloadTranslation);

  const [downloadQueueState, setDownloadQueueState] = useState<TranslationPickerDownloadState>({
    downloadingId: null,
    queuedId: null,
  });

  // The queue is created once, on first use, and reads its handlers through a ref refreshed
  // whenever they change, so it always calls the latest ones without being rebuilt (and losing
  // its state). `downloadQueue` is a stable facade over it for rows and effects.
  const downloadQueueDepsRef = useRef<TranslationPickerDownloadDeps<BibleTranslation> | null>(null);
  const queueRef = useRef<TranslationPickerDownloadQueue<BibleTranslation> | null>(null);
  const getQueue = useCallback(() => {
    queueRef.current ??= createTranslationPickerDownloadQueue<BibleTranslation>(() => {
      if (!downloadQueueDepsRef.current) {
        throw new Error('Translation picker download queue used before its first render');
      }
      return downloadQueueDepsRef.current;
    });
    return queueRef.current;
  }, []);
  const downloadQueue = useMemo<TranslationPickerDownloadQueue<BibleTranslation>>(
    () => ({
      request: (translation) => {
        if (!mountedRef.current || !activeRef.current) return Promise.resolve();
        retryGenerationRef.current += 1;
        return getQueue().request(translation);
      },
      cancelQueued: (translationId) => getQueue().cancelQueued(translationId),
      supersede: () => {
        retryGenerationRef.current += 1;
        getQueue().supersede();
      },
    }),
    [activeRef, getQueue]
  );

  useLayoutEffect(() => {
    downloadQueueDepsRef.current = {
      download: (translation) => downloadTranslation(translation.id),
      activate: (translation) => {
        setPreferredTranslationLanguage(normalizeTranslationLanguage(translation.language));
        setCurrentTranslation(translation.id);
        onRequestClose?.();
        onTranslationActivated?.(
          useBibleStore
            .getState()
            .translations.find((candidate) => candidate.id === translation.id) ?? translation
        );
      },
      onDownloadFailed: (translation, error) => {
        reportTranslationDownloadFailure(error);
        const generation = retryGenerationRef.current;
        showTranslationDownloadFailedAlert(t, () => {
          if (
            !mountedRef.current ||
            !activeRef.current ||
            retryGenerationRef.current !== generation
          )
            return;
          void downloadQueue.request(translation);
        });
      },
      onStateChange: setDownloadQueueState,
    };
  }, [
    activeRef,
    downloadTranslation,
    setPreferredTranslationLanguage,
    setCurrentTranslation,
    onRequestClose,
    onTranslationActivated,
    t,
    downloadQueue,
  ]);

  // Closing the picker drops the waiting choice; a running download finishes but opens nothing.
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      downloadQueue.supersede();
    };
  }, [downloadQueue]);
  useLayoutEffect(() => {
    if (!isActive) downloadQueue.supersede();
  }, [downloadQueue, isActive]);

  const handleDownloadTextTranslation = useCallback(
    async (translation: BibleTranslation) => {
      if (!activeRef.current || !translation.catalog?.text?.downloadUrl) {
        return;
      }
      await downloadQueue.request(translation);
    },
    [activeRef, downloadQueue]
  );

  return {
    downloadQueue,
    downloadQueueState,
    handleDownloadTextTranslation,
    invalidateDownloadRetry,
  };
}
