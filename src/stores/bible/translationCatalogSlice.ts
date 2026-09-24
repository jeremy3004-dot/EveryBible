import { config } from '../../constants/config';
import type { BibleTranslation } from '../../types';
import { getAudioAvailability } from '../../services/audio/audioAvailability';
import {
  isRemoteAudioAvailable,
  syncRemoteAudioMetadataResolverWithTranslations,
} from '../../services/audio/audioRemote';
import {
  activateTranslationPackCandidate,
  failTranslationPackCandidate,
  rollbackTranslationPack,
  stageTranslationPackCandidate,
} from '../../services/bible/bibleDataModel';
import { getDefaultBibleTranslations } from '../persistedStateSanitizers';
import { writeRuntimeCatalogSnapshot } from '../bibleTranslationPersistence';
import { mergeRuntimeCatalogTranslations } from '../bibleStoreModel';
import type { BibleSliceCreator, BibleState } from './bibleStoreTypes';
import {
  saveTranslationPreference,
  syncVerseTimestampMetadata,
} from './bibleStoreDeferredServices';
import {
  carryInstallStateIntoRuntimeTranslation,
  hasReadableTranslationText,
  normalizePreferredTranslationLanguage,
} from './translationCatalogModel';

type TranslationCatalogSlice = Pick<
  BibleState,
  | 'currentTranslation'
  | 'currentTranslationChosenAt'
  | 'preferredTranslationLanguage'
  | 'translations'
  | 'setCurrentTranslation'
  | 'setPreferredTranslationLanguage'
  | 'applyRuntimeCatalog'
  | 'stageTranslationPack'
  | 'activateTranslationPack'
  | 'failTranslationPack'
  | 'rollbackTranslationPackInstall'
  | 'getAvailableTranslations'
  | 'getCurrentTranslationInfo'
  | 'isBookDownloaded'
  | 'isAudioBookDownloaded'
>;

/** The translation catalog, the reader's chosen translation, and per-row pack bookkeeping. */
export const createTranslationCatalogSlice: BibleSliceCreator<TranslationCatalogSlice> = (
  set,
  get
) => {
  const updateTranslationRow = (
    translationId: string,
    update: (translation: BibleTranslation) => BibleTranslation
  ) => {
    set((state) => ({
      translations: state.translations.map((translation) =>
        translation.id === translationId ? update(translation) : translation
      ),
    }));
  };

  return {
    currentTranslation: 'bsb',
    currentTranslationChosenAt: null,
    preferredTranslationLanguage: 'English',
    translations: getDefaultBibleTranslations(),

    setCurrentTranslation: (translationId, adopted) => {
      const translation = get().translations.find((t) => t.id === translationId);
      if (!translation) {
        return;
      }

      const preferredTranslationLanguage = translation.language?.trim() || null;
      const select = () => {
        const currentTranslationChosenAt = adopted ? adopted.chosenAt : new Date().toISOString();
        set({
          currentTranslation: translationId,
          currentTranslationChosenAt,
          preferredTranslationLanguage,
          error: null,
        });
        if (!adopted && currentTranslationChosenAt) {
          saveTranslationPreference(translationId, currentTranslationChosenAt);
        }
      };

      if (translation.isDownloaded || hasReadableTranslationText(translation)) {
        select();
        return;
      }

      if (!translation.hasText && translation.hasAudio) {
        const availability = getAudioAvailability({
          featureEnabled: config.features.audioEnabled,
          translationHasAudio: translation.hasAudio,
          remoteAudioAvailable: isRemoteAudioAvailable(translation.id),
          downloadedAudioBooks: translation.downloadedAudioBooks,
        });

        if (availability.canPlayAudio) {
          select();
        }
      }
    },

    setPreferredTranslationLanguage: (preferredTranslationLanguage) =>
      set({
        preferredTranslationLanguage: normalizePreferredTranslationLanguage(
          preferredTranslationLanguage
        ),
      }),

    applyRuntimeCatalog: (runtimeTranslations) => {
      let nextTranslationsSnapshot: BibleTranslation[] = [];

      set((state) => {
        const existingTranslationsById = new Map(
          state.translations.map((translation) => [translation.id, translation])
        );
        const nextRuntimeTranslations = runtimeTranslations
          .filter((translation) => translation.source === 'runtime')
          .map((translation) =>
            carryInstallStateIntoRuntimeTranslation(
              translation,
              existingTranslationsById.get(translation.id)
            )
          );
        const nextTranslations = mergeRuntimeCatalogTranslations(
          state.translations,
          nextRuntimeTranslations
        );
        nextTranslationsSnapshot = nextTranslations;
        const nextTranslationIds = new Set(nextTranslations.map((translation) => translation.id));

        return {
          translations: nextTranslations,
          currentTranslation: nextTranslationIds.has(state.currentTranslation)
            ? state.currentTranslation
            : 'bsb',
        };
      });

      // The only place runtime catalog metadata enters the store, and therefore the only place
      // the offline metadata cache needs refreshing. Deliberately off the download/navigation
      // hot path, and a no-op write when the catalog has not actually changed.
      writeRuntimeCatalogSnapshot(nextTranslationsSnapshot);
      syncRemoteAudioMetadataResolverWithTranslations(nextTranslationsSnapshot);
      syncVerseTimestampMetadata(nextTranslationsSnapshot);
    },

    stageTranslationPack: (translationId, candidate) => {
      updateTranslationRow(translationId, (translation) =>
        stageTranslationPackCandidate(translation, candidate)
      );
    },

    activateTranslationPack: (translationId) => {
      updateTranslationRow(translationId, activateTranslationPackCandidate);
    },

    failTranslationPack: (translationId, error) => {
      updateTranslationRow(translationId, (translation) =>
        failTranslationPackCandidate(translation, error)
      );
    },

    rollbackTranslationPackInstall: (translationId) => {
      updateTranslationRow(translationId, rollbackTranslationPack);
    },

    getAvailableTranslations: () => get().translations,

    getCurrentTranslationInfo: () => {
      return get().translations.find((t) => t.id === get().currentTranslation);
    },

    isBookDownloaded: (translationId, bookId) => {
      const translation = get().translations.find((t) => t.id === translationId);
      if (!translation) return false;
      if (translation.isDownloaded) return true;
      return translation.downloadedBooks.includes(bookId);
    },

    isAudioBookDownloaded: (translationId, bookId) => {
      const translation = get().translations.find((t) => t.id === translationId);
      return translation?.downloadedAudioBooks.includes(bookId) ?? false;
    },
  };
};
