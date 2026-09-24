import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './mmkvStorage';
import { asStringRecord, mergeSanitizedState } from './persistedShapeGuards';

// When each account on this device last completed a sync the server accepted.
// Only a successful sync writes here: a local edit, an offline attempt or a failed
// one leaves the last success standing, so the More screen's "Synced …" line ages
// instead of claiming "just now". Keyed by account so one account's time is never
// shown for another after switching; guests have no entry.
interface SyncStatusState {
  lastSuccessfulSyncAtByUser: Record<string, string>;
  recordSuccessfulSync: (userId: string, at?: string) => void;
}

export const useSyncStatusStore = create<SyncStatusState>()(
  persist(
    (set) => ({
      lastSuccessfulSyncAtByUser: {},
      recordSuccessfulSync: (userId, at = new Date().toISOString()) =>
        set((state) => ({
          lastSuccessfulSyncAtByUser: { ...state.lastSuccessfulSyncAtByUser, [userId]: at },
        })),
    }),
    {
      name: 'sync-status-storage',
      storage: createJSONStorage(() => zustandStorage),
      partialize: ({ lastSuccessfulSyncAtByUser }) => ({ lastSuccessfulSyncAtByUser }),
      merge: (persistedState, currentState) =>
        mergeSanitizedState(persistedState, currentState, {
          lastSuccessfulSyncAtByUser: asStringRecord,
        }),
    }
  )
);

/** Selector for an account's last successful sync; null for guests and never-synced accounts. */
export const selectLastSuccessfulSyncAt =
  (userId: string | null) =>
  (state: Pick<SyncStatusState, 'lastSuccessfulSyncAtByUser'>): string | null =>
    userId && Object.prototype.hasOwnProperty.call(state.lastSuccessfulSyncAtByUser, userId)
      ? (state.lastSuccessfulSyncAtByUser[userId] ?? null)
      : null;
