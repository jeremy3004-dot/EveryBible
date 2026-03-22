import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncProgress } from '../services/sync';
import { sanitizePersistedProgressState } from './persistedStateSanitizers';

let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSyncProgress() {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    syncProgress().catch(() => {});
    syncDebounceTimer = null;
  }, 2000);
}

interface ProgressState {
  chaptersRead: Record<string, number>; // { "GEN_1": timestamp, ... }
  streakDays: number;
  lastReadDate: string | null;

  // Computed getters
  getTodayCount: () => number;
  getWeekCount: () => number;
  getMonthCount: () => number;
  getYearCount: () => number;

  // Actions
  markChapterRead: (bookId: string, chapter: number) => void;
  isChapterRead: (bookId: string, chapter: number) => boolean;
  updateStreak: () => void;
  applySyncedProgress: (progress: {
    chaptersRead: Record<string, number>;
    streakDays: number;
    lastReadDate: string | null;
  }) => void;
}

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

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      chaptersRead: {},
      streakDays: 0,
      lastReadDate: null,

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

      isChapterRead: (bookId, chapter) => {
        const { chaptersRead } = get();
        const key = `${bookId}_${chapter}`;
        return key in chaptersRead;
      },

      updateStreak: () => {
        const today = new Date().toISOString().split('T')[0];
        const { lastReadDate, streakDays } = get();

        if (lastReadDate === today) {
          return; // Already read today
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (lastReadDate === yesterdayStr) {
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
          Object.entries(progress.chaptersRead).some(([key, value]) => state.chaptersRead[key] !== value);

        if (!hasChanged) {
          return;
        }

        set({
          chaptersRead: progress.chaptersRead,
          streakDays: progress.streakDays,
          lastReadDate: progress.lastReadDate,
        });
      },
    }),
    {
      name: 'progress-storage',
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizePersistedProgressState(persistedState),
      }),
    }
  )
);
