import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './mmkvStorage';
import { asStringArray, mergeSanitizedState } from './persistedShapeGuards';

interface TranslationPreferences {
  pinnedIds: string[];
  hiddenIds: string[];
  pin: (id: string) => void;
  unpin: (id: string) => void;
  hide: (id: string) => void;
}

// Membership preferences never remove downloaded text/audio or change the reader.
export const useTranslationPreferenceStore = create<TranslationPreferences>()(
  persist(
    (set) => ({
      pinnedIds: [],
      hiddenIds: [],
      pin: (id) =>
        set((state) => ({
          pinnedIds: [...state.pinnedIds.filter((candidate) => candidate !== id), id],
          hiddenIds: state.hiddenIds.filter((candidate) => candidate !== id),
        })),
      unpin: (id) =>
        set((state) => ({ pinnedIds: state.pinnedIds.filter((candidate) => candidate !== id) })),
      hide: (id) =>
        set((state) => ({
          pinnedIds: state.pinnedIds.filter((candidate) => candidate !== id),
          hiddenIds: [...state.hiddenIds.filter((candidate) => candidate !== id), id],
        })),
    }),
    {
      name: 'translation-preferences',
      storage: createJSONStorage(() => zustandStorage),
      partialize: ({ pinnedIds, hiddenIds }) => ({ pinnedIds, hiddenIds }),
      // The translation picker reads both lists in a render selector.
      merge: (persistedState, currentState) =>
        mergeSanitizedState(persistedState, currentState, {
          pinnedIds: asStringArray,
          hiddenIds: asStringArray,
        }),
    }
  )
);
