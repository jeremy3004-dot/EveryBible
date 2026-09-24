import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { privateDataStorage, registerPrivateDataStore } from './privateDataScope';
import { mergeGuestAnnotations } from './privateDataAdoption';
import { asRecordArray, mergeSanitizedState, type PersistedRecord } from './persistedShapeGuards';
import type { UserAnnotation } from '../services/supabase/types';

const LOCAL_USER_ID = 'local-device';

type LocalAnnotationInput = Omit<
  UserAnnotation,
  'user_id' | 'created_at' | 'updated_at' | 'synced_at'
>;

interface AnnotationStoreState {
  annotations: UserAnnotation[];
  upsertAnnotation: (annotation: LocalAnnotationInput) => UserAnnotation;
  softDeleteAnnotation: (id: string) => boolean;
  replaceAnnotations: (annotations: UserAnnotation[]) => void;
  clearAnnotations: () => void;
}

const createAnnotationId = () =>
  `local-annotation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const makeCompositeKey = ({
  book,
  chapter,
  verse_start,
  type,
}: Pick<UserAnnotation, 'book' | 'chapter' | 'verse_start' | 'type'>) =>
  `${book}|${chapter}|${verse_start}|${type}`;

// ISO 8601 timestamps sort correctly with plain string comparison. Avoids the
// ICU-backed localeCompare (slow on Hermes, no JIT) on this hot path — runs on
// every annotation store update, which re-renders the Bible reader.
const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sortAnnotations = (annotations: UserAnnotation[]) =>
  [...annotations].sort((a, b) => {
    const updatedAtDelta = compareStrings(b.updated_at, a.updated_at);
    if (updatedAtDelta !== 0) {
      return updatedAtDelta;
    }

    return compareStrings(b.created_at, a.created_at);
  });

// The fields the reader, the store's own dedup and the sync path index on.
const isPersistedAnnotation = (entry: PersistedRecord): boolean =>
  typeof entry.id === 'string' &&
  typeof entry.book === 'string' &&
  typeof entry.chapter === 'number' &&
  typeof entry.verse_start === 'number' &&
  typeof entry.type === 'string';

const hydrateLocalAnnotation = (
  annotation: LocalAnnotationInput,
  existing?: UserAnnotation
): UserAnnotation => {
  const now = new Date().toISOString();

  return {
    ...annotation,
    id: annotation.id || existing?.id || createAnnotationId(),
    user_id: LOCAL_USER_ID,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    synced_at: now,
    deleted_at: annotation.deleted_at ?? null,
  };
};

export const useAnnotationStore = create<AnnotationStoreState>()(
  persist(
    (set) => ({
      annotations: [],

      upsertAnnotation: (annotation) => {
        let savedAnnotation: UserAnnotation | null = null;

        set((state) => {
          const index = state.annotations.findIndex(
            (existing) =>
              // Soft-deleted rows must not be matched by the upsert dedup, otherwise creating a new
              // annotation on the same verse would revive a previously deleted one (deleted_at is
              // cleared by hydrateLocalAnnotation). Composite-key semantics are unchanged. (L31)
              existing.deleted_at == null &&
              (existing.id === annotation.id ||
                makeCompositeKey(existing) === makeCompositeKey(annotation))
          );
          const existing = index >= 0 ? state.annotations[index] : undefined;
          const nextAnnotation = hydrateLocalAnnotation(annotation, existing);
          const nextAnnotations =
            index >= 0
              ? [
                  ...state.annotations.slice(0, index),
                  nextAnnotation,
                  ...state.annotations.slice(index + 1),
                ]
              : [...state.annotations, nextAnnotation];

          savedAnnotation = nextAnnotation;

          return { annotations: sortAnnotations(nextAnnotations) };
        });

        return savedAnnotation ?? hydrateLocalAnnotation(annotation);
      },

      softDeleteAnnotation: (id) => {
        let deleted = false;

        set((state) => {
          const nextAnnotations = state.annotations.map((annotation) => {
            if (annotation.id !== id || annotation.deleted_at != null) {
              return annotation;
            }

            deleted = true;
            const now = new Date().toISOString();

            return {
              ...annotation,
              deleted_at: now,
              updated_at: now,
              synced_at: now,
            };
          });

          return { annotations: sortAnnotations(nextAnnotations) };
        });

        return deleted;
      },

      replaceAnnotations: (annotations) => {
        set({ annotations: sortAnnotations(annotations) });
      },

      clearAnnotations: () => set({ annotations: [] }),
    }),
    {
      name: 'annotation-storage',
      // Local-only and private: scoped to the signed-in account (see privateDataScope).
      storage: createJSONStorage(() => privateDataStorage),
      merge: (persistedState, currentState) =>
        mergeSanitizedState(persistedState, currentState, {
          // Stored order is kept: every write path already sorts.
          annotations: (value) => asRecordArray<UserAnnotation>(value, isPersistedAnnotation),
        }),
    }
  )
);

export const localAnnotationStore = {
  get annotations() {
    return useAnnotationStore.getState().annotations;
  },
  upsertAnnotation: (annotation: LocalAnnotationInput) =>
    useAnnotationStore.getState().upsertAnnotation(annotation),
  softDeleteAnnotation: (id: string) => useAnnotationStore.getState().softDeleteAnnotation(id),
  replaceAnnotations: (annotations: UserAnnotation[]) =>
    useAnnotationStore.getState().replaceAnnotations(annotations),
  clearAnnotations: () => useAnnotationStore.getState().clearAnnotations(),
  /** Calls `listener` whenever the saved annotations change, including an account switch. */
  subscribe: (listener: () => void): (() => void) =>
    useAnnotationStore.subscribe((state, previous) => {
      if (state.annotations !== previous.annotations) {
        listener();
      }
    }),
};

registerPrivateDataStore(useAnnotationStore, (account, guest) => ({
  annotations: sortAnnotations(mergeGuestAnnotations(account.annotations, guest.annotations)),
}));
