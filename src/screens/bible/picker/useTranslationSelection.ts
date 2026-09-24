import { useCallback } from 'react';
import { Alert } from 'react-native';
import { config } from '../../../constants/config';
import { useI18n } from '../../../hooks/useI18n';
import {
  getFirstAvailableAudioBook,
  isRemoteAudioAvailable,
} from '../../../services/audio/audioRemote';
import { ensureRuntimeCatalogLoaded } from '../../../services/translations';
import { useBibleStore } from '../../../stores/bibleStore';
import type { BibleTranslation } from '../../../types';
import { normalizeTranslationLanguage } from '../bibleTranslationModel';
import type { TranslationPickerDownloadQueue } from '../translationPickerDownloadQueue';
import { resolveTranslationSelection } from './translationSelectionModel';
import type { TranslationPickerCallbacks } from './useTranslationPickerDownloads';

interface TranslationSelectionOptions extends TranslationPickerCallbacks {
  hasHydratedRuntimeCatalog: boolean;
  setIsHydratingRuntimeCatalog: (isHydrating: boolean) => void;
  downloadQueue: TranslationPickerDownloadQueue<BibleTranslation>;
  handleDownloadTextTranslation: (translation: BibleTranslation) => Promise<void>;
}

/**
 * Tapping a Bible: open it (moving to a book it covers when needed), offer its download, or
 * explain why it cannot open. Before the catalog has loaded, a Bible that is not on the
 * device is looked up again first, so the decision uses its catalog entry.
 */
export function useTranslationSelection({
  hasHydratedRuntimeCatalog,
  setIsHydratingRuntimeCatalog,
  downloadQueue,
  handleDownloadTextTranslation,
  onRequestClose,
  onTranslationActivated,
}: TranslationSelectionOptions) {
  const { t } = useI18n();
  const currentBook = useBibleStore((state) => state.currentBook);
  const setCurrentTranslation = useBibleStore((state) => state.setCurrentTranslation);
  const setCurrentBook = useBibleStore((state) => state.setCurrentBook);
  const setCurrentChapter = useBibleStore((state) => state.setCurrentChapter);
  const setPreferredTranslationLanguage = useBibleStore(
    (state) => state.setPreferredTranslationLanguage
  );

  return useCallback(
    async (translation: BibleTranslation) => {
      let nextTranslation = translation;

      if (!hasHydratedRuntimeCatalog && !translation.isDownloaded) {
        setIsHydratingRuntimeCatalog(true);

        try {
          await ensureRuntimeCatalogLoaded();
        } catch (error) {
          console.warn('[Bible] Failed to refresh translation catalog before selection:', error);
        } finally {
          setIsHydratingRuntimeCatalog(false);
        }

        nextTranslation =
          useBibleStore
            .getState()
            .translations.find((candidate) => candidate.id === translation.id) ?? translation;
      }

      const outcome = resolveTranslationSelection(nextTranslation, {
        currentBook,
        audioEnabled: config.features.audioEnabled,
        isRemoteAudioAvailable,
        getFirstAvailableAudioBook,
      });

      if (outcome.kind === 'activate') {
        // The reader chose a Bible they can open now, so a download still running must not
        // replace it when it finishes.
        downloadQueue.supersede();
        setPreferredTranslationLanguage(normalizeTranslationLanguage(nextTranslation.language));

        if (outcome.jumpToBook) {
          setCurrentBook(outcome.jumpToBook);
          setCurrentChapter(1);
        }

        setCurrentTranslation(nextTranslation.id);
        onRequestClose?.();
        onTranslationActivated?.(nextTranslation);
        return;
      }

      if (outcome.kind === 'audio-unavailable') {
        Alert.alert(t('common.error'), t('bible.audioDownloadFailed'), [{ text: t('common.ok') }]);
        return;
      }

      if (outcome.kind === 'download-required') {
        Alert.alert(
          nextTranslation.name,
          t('translations.downloadPrompt', {
            name: nextTranslation.name,
            size: nextTranslation.sizeInMB,
          }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('translations.download'),
              onPress: () => {
                void handleDownloadTextTranslation(nextTranslation);
              },
            },
          ]
        );
        return;
      }

      Alert.alert(
        t('common.comingSoon'),
        t('bible.translationComingSoon', { name: nextTranslation.name }),
        [{ text: t('common.ok') }]
      );
    },
    [
      hasHydratedRuntimeCatalog,
      setIsHydratingRuntimeCatalog,
      currentBook,
      setPreferredTranslationLanguage,
      setCurrentBook,
      setCurrentChapter,
      setCurrentTranslation,
      onRequestClose,
      onTranslationActivated,
      t,
      handleDownloadTextTranslation,
      downloadQueue,
    ]
  );
}
