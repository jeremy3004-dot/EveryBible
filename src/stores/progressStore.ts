import { create } from 'zustand';
import {
  persist,
  createJSONStorage,
  type PersistStorage,
  type StorageValue,
} from 'zustand/middleware';
import { zustandStorage } from './mmkvStorage';
import { sanitizePersistedProgressState } from './persistedStateSanitizers';

let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

type ProgressSyncIdentity = {
  expectedUserId: string | undefined;
  expectedGeneration: number | undefined;
};

const getProgressSyncIdentity = (): ProgressSyncIdentity => {
  try {
    const { useAuthStore } = require('./authStore') as typeof import('./authStore');
    const authState = useAuthStore.getState();
    return {
      expectedUserId: authState.user?.uid,
      expectedGeneration: authState.authGeneration,
    };
  } catch {
    return { expectedUserId: undefined, expectedGeneration: undefined };
  }
};

function debouncedSyncProgress() {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  const { expectedUserId, expectedGeneration } = getProgressSyncIdentity();
  if (!expectedUserId) {
    syncDebounceTimer = null;
    return;
  }

  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    void import('../services/sync')
      .then(({ syncProgress }) => syncProgress(expectedUserId, expectedGeneration))
      .catch(() => {});
  }, 2000);
}

interface ProgressState {
  chaptersRead: Record<string, number>; // { "GEN_1": timestamp, ... }
  // Completed listens, keyed like chaptersRead: { "GEN_1": timestamp }. Written
  // only when a chapter's audio plays to its end, so the Home ledger can count
  // chapters covered by ear as well as by eye. Local-only and offline-first —
  // the sync payload still carries reading progress alone.
  chaptersListened: Record<string, number>;
  // Completed listening milliseconds accumulated per local calendar day
  // ({ "2026-09-08": 1_260_000 }). A day key is tiny, survives re-listens that a
  // chapter-keyed map would collapse, and lets any period sum its own minutes.
  listeningMsByDate: Record<string, number>;
  streakDays: number;
  lastReadDate: string | null;

  // Computed getters
  getTodayCount: () => number;
  getWeekCount: () => number;
  getMonthCount: () => number;
  getYearCount: () => number;

  // Actions
  markChapterRead: (bookId: string, chapter: number) => void;
  markChapterListened: (bookId: string, chapter: number, durationMs: number) => void;
  isChapterRead: (bookId: string, chapter: number) => boolean;
  updateStreak: () => void;
  applySyncedProgress: (progress: {
    chaptersRead: Record<string, number>;
    streakDays: number;
    lastReadDate: string | null;
  }) => void;
  // Clears per-user in-memory + persisted state back to initial. Called at the
  // auth boundary (sign-out, and sign-in as a different user) so one account's
  // reading history never leaks into or corrupts another's.
  resetForSignOut: () => void;
}

const initialProgressState: Pick<
  ProgressState,
  'chaptersRead' | 'chaptersListened' | 'listeningMsByDate' | 'streakDays' | 'lastReadDate'
> = {
  chaptersRead: {},
  chaptersListened: {},
  listeningMsByDate: {},
  streakDays: 0,
  lastReadDate: null,
};

// Local-calendar day key (YYYY-MM-DD). Mirrors formatLocalDateKey in
// readingPlanModel.ts so streak day boundaries follow the device's timezone
// rather than UTC (a Kathmandu reader at 05:00 local must not log yesterday).
const formatLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getStartOfDay = (date: Date): number => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const getStartOfWeek = (date: Date): number => {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const getStartOfMonth = (date: Date): number => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const getStartOfYear = (date: Date): number => {
  const d = new Date(date);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// Only these five fields are ever restored (see sanitizePersistedProgressState).
// Without a partialize, zustand serialized the whole store — the four computed
// getters included — on every single mutation.
const selectPersistedProgressState = (state: ProgressState) => ({
  chaptersRead: state.chaptersRead,
  chaptersListened: state.chaptersListened,
  listeningMsByDate: state.listeningMsByDate,
  streakDays: state.streakDays,
  lastReadDate: state.lastReadDate,
});

type PersistedProgressState = ReturnType<typeof selectPersistedProgressState>;
const progressJsonStorage = createJSONStorage<PersistedProgressState>(() => zustandStorage)!;
let lastSavedProgress: StorageValue<PersistedProgressState> | undefined;

function hasSameSavedProgress(
  left: PersistedProgressState,
  right: PersistedProgressState
): boolean {
  // Every persisted field is either a primitive or a map replaced wholesale by
  // an immutable `set`, so reference equality is a sound "nothing changed"
  // check and costs nothing next to serializing chaptersRead.
  for (const key in right) {
    const field = key as keyof PersistedProgressState;
    if (!Object.is(left[field], right[field])) return false;
  }
  return true;
}

// zustand calls storage after every mutation, even ones partialize excludes
// (updateStreak's no-op early return is the common case). Diff before
// serializing so a chapter turn does not re-stringify the whole read ledger
// and cross the native storage boundary for an unchanged payload.
const progressStorage: PersistStorage<PersistedProgressState> = {
  getItem: (name) => {
    lastSavedProgress = undefined;
    return progressJsonStorage.getItem(name);
  },
  removeItem: (name) => {
    lastSavedProgress = undefined;
    return progressJsonStorage.removeItem(name);
  },
  setItem: (name, value) => {
    if (
      lastSavedProgress?.version === value.version &&
      lastSavedProgress &&
      hasSameSavedProgress(lastSavedProgress.state, value.state)
    ) {
      return;
    }
    const result = progressJsonStorage.setItem(name, value);
    // MMKV is synchronous. Only remember successful synchronous saves; an async
    // adapter still works, but must not suppress a write before it has finished.
    lastSavedProgress = result === undefined ? value : undefined;
    return result;
  },
};

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...initialProgressState,

      getTodayCount: () => {
        const { chaptersRead } = get();
        const todayStart = getStartOfDay(new Date());
        return Object.values(chaptersRead).filter((ts) => ts >= todayStart).length;
      },

      getWeekCount: () => {
        const { chaptersRead } = get();
        const weekStart = getStartOfWeek(new Date());
        return Object.values(chaptersRead).filter((ts) => ts >= weekStart).length;
      },

      getMonthCount: () => {
        const { chaptersRead } = get();
        const monthStart = getStartOfMonth(new Date());
        return Object.values(chaptersRead).filter((ts) => ts >= monthStart).length;
      },

      getYearCount: () => {
        const { chaptersRead } = get();
        const yearStart = getStartOfYear(new Date());
        return Object.values(chaptersRead).filter((ts) => ts >= yearStart).length;
      },

      markChapterRead: (bookId, chapter) => {
        const key = `${bookId}_${chapter}`;
        const now = Date.now();
        set((state) => ({
          chaptersRead: {
            ...state.chaptersRead,
            [key]: now,
          },
        }));
        get().updateStreak();
        // Trigger debounced background sync to avoid flooding during rapid navigation
        debouncedSyncProgress();
      },

      markChapterListened: (bookId, chapter, durationMs) => {
        const key = `${bookId}_${chapter}`;
        const now = Date.now();
        const dateKey = formatLocalDateKey(new Date(now));
        const listenedMs =
          Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : 0;
        set((state) => ({
          chaptersListened: {
            ...state.chaptersListened,
            [key]: now,
          },
          listeningMsByDate: listenedMs
            ? {
                ...state.listeningMsByDate,
                [dateKey]: (state.listeningMsByDate[dateKey] ?? 0) + listenedMs,
              }
            : state.listeningMsByDate,
        }));
      },

      isChapterRead: (bookId, chapter) => {
        const { chaptersRead } = get();
        const key = `${bookId}_${chapter}`;
        return key in chaptersRead;
      },

      updateStreak: () => {
        const now = new Date();
        const today = formatLocalDateKey(now);
        const { lastReadDate, streakDays } = get();

        if (lastReadDate === today) {
          return; // Already read today
        }

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = formatLocalDateKey(yesterday);

        // One-time upgrade tolerance: lastReadDate values written before this
        // fix used the UTC date, which can be off by one day from the local
        // date depending on timezone. Accept a two-day-old lastReadDate as
        // "continuing" so legitimate daily readers do not lose their streak on
        // the first read after upgrading.
        const twoDaysAgo = new Date(now);
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        const twoDaysAgoStr = formatLocalDateKey(twoDaysAgo);

        if (lastReadDate === yesterdayStr || lastReadDate === twoDaysAgoStr) {
          // Continuing streak
          set({ streakDays: streakDays + 1, lastReadDate: today });
        } else {
          // Starting new streak
          set({ streakDays: 1, lastReadDate: today });
        }
      },

      applySyncedProgress: (progress) => {
        const state = get();
        const hasChanged =
          state.streakDays !== progress.streakDays ||
          state.lastReadDate !== progress.lastReadDate ||
          Object.keys(state.chaptersRead).length !== Object.keys(progress.chaptersRead).length ||
          Object.entries(progress.chaptersRead).some(
            ([key, value]) => state.chaptersRead[key] !== value
          );

        if (!hasChanged) {
          return;
        }

        set({
          chaptersRead: progress.chaptersRead,
          streakDays: progress.streakDays,
          lastReadDate: progress.lastReadDate,
        });
      },

      resetForSignOut: () => {
        if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
        syncDebounceTimer = null;
        set({ ...initialProgressState });
      },
    }),
    {
      name: 'progress-storage',
      storage: progressStorage,
      partialize: selectPersistedProgressState,
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizePersistedProgressState(persistedState),
      }),
    }
  )
);
