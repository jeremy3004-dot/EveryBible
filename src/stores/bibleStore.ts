/**
 * The Bible store: reading position, the translation catalog and what is installed on this
 * device, text pack and audio downloads.
 *
 * One Zustand store persisted to MMKV under `bible-storage`. Its actions live in slice modules
 * under `./bible/`; they are all spread into the single `persist` creator below, which alone
 * owns the persisted shape (name, version, migrate, partialize, merge). Changing that shape
 * corrupts the blob every installed device already carries — `bibleStore.persistence.test.ts`
 * pins its bytes.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './mmkvStorage';
import {
  setBibleTranslationReadinessResolver,
  setBibleDatabaseSourceResolver,
} from '../services/bible/bibleDatabaseSources';
import { buildInstalledBibleDatabaseSource } from '../services/bible/bibleDataModel';
import { sanitizePersistedBibleState } from './persistedStateSanitizers';
import {
  BIBLE_PERSISTED_STATE_VERSION,
  migrateBiblePersistedState,
  readRuntimeCatalogSnapshot,
  toPersistedTranslation,
} from './bibleTranslationPersistence';
import { settleInterruptedInstallState } from './bibleStoreModel';
import type { BibleState } from './bible/bibleStoreTypes';
import {
  syncRemoteAudioMetadataDeferred,
  syncVerseTimestampMetadata,
} from './bible/bibleStoreDeferredServices';
import { createReadingSlice } from './bible/readingSlice';
import { createTranslationCatalogSlice } from './bible/translationCatalogSlice';
import { createDownloadProgressSlice } from './bible/downloadProgressSlice';
import { createTextPackInstallSlice } from './bible/textPackInstallSlice';
import { createTextPackMaintenanceSlice } from './bible/textPackMaintenanceSlice';
import { createAudioDownloadSlice } from './bible/audioDownloadSlice';
import { recoverTextPackJournal } from './bible/textPackJournalRecovery';
import { isTextPackReadinessBypassed } from './bible/textPackRuntime';

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  console.log('[EB-T] bible:pre-create', Date.now());
}
export const useBibleStore = create<BibleState>()(
  persist(
    (set, get) => ({
      ...createReadingSlice(set, get),
      ...createTranslationCatalogSlice(set, get),
      ...createDownloadProgressSlice(set, get),
      ...createTextPackInstallSlice(set, get),
      ...createTextPackMaintenanceSlice(set, get),
      ...createAudioDownloadSlice(set, get),
    }),
    {
      name: 'bible-storage',
      version: BIBLE_PERSISTED_STATE_VERSION,
      storage: createJSONStorage(() => zustandStorage),
      // Version 0 blobs inline every runtime translation's static catalog metadata. Migration
      // moves that metadata into its own MMKV key and leaves only the user-mutable delta here.
      // Zustand runs migrate BEFORE merge, and MMKV is synchronous, so the snapshot written here
      // is already readable by the time merge re-joins the two halves.
      migrate: (persistedState, version) =>
        migrateBiblePersistedState(persistedState, version) as BibleState,
      // Only the fields the store itself mutates. Everything static is re-seeded on hydration —
      // bundled translations from the `bibleTranslations` constant, runtime translations from the
      // catalog snapshot — so routine set() calls (chapter navigation, download progress ticks)
      // no longer re-serialize 200+ full catalog objects to MMKV.
      partialize: (state) => ({
        currentBook: state.currentBook,
        currentChapter: state.currentChapter,
        hasReaderHistory: state.hasReaderHistory,
        preferredChapterLaunchMode: state.preferredChapterLaunchMode,
        currentTranslation: state.currentTranslation,
        currentTranslationChosenAt: state.currentTranslationChosenAt,
        preferredTranslationLanguage: state.preferredTranslationLanguage,
        translations: state.translations.map(toPersistedTranslation),
      }),
      merge: (persistedState, currentState) => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[EB-T] bible:merge-start', Date.now());
        }
        // Single read + single pass over the cached catalog; the deltas then join against it by id.
        const persisted = sanitizePersistedBibleState(persistedState, readRuntimeCatalogSnapshot());
        const result = {
          ...currentState,
          ...persisted,
          translations: persisted.translations.map(settleInterruptedInstallState),
        };
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[EB-T] bible:merge-done', Date.now());
        }
        return result;
      },
    }
  )
);

setBibleDatabaseSourceResolver((translationId) => {
  const translation = useBibleStore
    .getState()
    .translations.find((candidate) => candidate.id === translationId);

  if (!translation?.textPackLocalPath) {
    return null;
  }

  return buildInstalledBibleDatabaseSource(
    translation.id,
    translation.textPackLocalPath,
    translation.activeTextPackVersion
  );
});

setBibleTranslationReadinessResolver(async (translationId) => {
  if (isTextPackReadinessBypassed(translationId)) {
    return;
  }
  await recoverTextPackJournal(useBibleStore);
});

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  console.log('[EB-T] bible:post-create', Date.now());
}
syncRemoteAudioMetadataDeferred(useBibleStore.getState().translations);
syncVerseTimestampMetadata(useBibleStore.getState().translations);
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  console.log('[EB-T] bible:module-done', Date.now());
}
