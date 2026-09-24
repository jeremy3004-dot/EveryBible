import { createStore, type StoreApi } from 'zustand/vanilla';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { useStore } from 'zustand';

import type { ReadingPlansStoreState } from '../services/plans/types';
import { createEnrollmentSlice } from './readingPlans/enrollmentSlice';
import { createEmptyState } from './readingPlans/planProgressModel';
import { createProgressSlice } from './readingPlans/progressSlice';
import {
  lazyDefaultStorage,
  mergePersistedReadingPlans,
  partializeReadingPlans,
  READING_PLANS_STORAGE_NAME,
} from './readingPlans/readingPlansPersistence';
import { createRhythmSlice } from './readingPlans/rhythmSlice';

export {
  RHYTHM_MUTATION_ERROR_CODES,
  type RhythmMutationErrorCode,
} from './readingPlans/rhythmModel';

export type ReadingPlansStoreApi = StoreApi<ReadingPlansStoreState>;

/**
 * The reading-plans store: one persisted store assembled from slices under `./readingPlans/`
 * (progress, enrolment and tombstones, rhythms). `storage` is injectable for tests; the default
 * loads MMKV on first use.
 */
export function createReadingPlansStore(
  storage: StateStorage = lazyDefaultStorage
): ReadingPlansStoreApi {
  return createStore<ReadingPlansStoreState>()(
    persist(
      (set, get) => ({
        ...createEmptyState(),
        ...createRhythmSlice(set, get),
        ...createProgressSlice(set, get),
        ...createEnrollmentSlice(set, get),
      }),
      {
        name: READING_PLANS_STORAGE_NAME,
        storage: createJSONStorage(() => storage),
        partialize: partializeReadingPlans,
        merge: mergePersistedReadingPlans,
      }
    )
  );
}

export const readingPlansStore = createReadingPlansStore();

export function useReadingPlansStore<T>(selector: (state: ReadingPlansStoreState) => T): T {
  return useStore(readingPlansStore, selector);
}
