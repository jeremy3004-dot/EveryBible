import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './mmkvStorage';
import type { UserReadingPlanProgress } from '../services/plans/types';
import { computeNextDay, isPlanCompleted } from '../services/plans/readingPlanModel';

type PersistedProgressMap = Record<string, UserReadingPlanProgress>;

type ReadingPlansState = {
  savedPlanIds: string[];
  progressByPlanId: PersistedProgressMap;
  startPlan: (planId: string) => UserReadingPlanProgress;
  markDayComplete: (planId: string, dayNumber: number, durationDays: number) => UserReadingPlanProgress | null;
  removePlan: (planId: string) => void;
  savePlan: (planId: string) => void;
  unsavePlan: (planId: string) => void;
  getProgress: (planId?: string) => UserReadingPlanProgress[];
  getSavedPlanIds: () => string[];
  reset: () => void;
};

function buildProgress(planId: string): UserReadingPlanProgress {
  const now = new Date().toISOString();
  return {
    id: planId,
    user_id: 'local-user',
    plan_id: planId,
    started_at: now,
    completed_entries: {},
    current_day: 1,
    is_completed: false,
    completed_at: null,
    synced_at: now,
  };
}

export const useReadingPlansStore = create<ReadingPlansState>()(
  persist(
    (set, get) => ({
      savedPlanIds: [],
      progressByPlanId: {},
      startPlan: (planId) => {
        const existing = get().progressByPlanId[planId];
        if (existing) {
          return existing;
        }

        const created = buildProgress(planId);
        set((state) => ({
          progressByPlanId: {
            ...state.progressByPlanId,
            [planId]: created,
          },
        }));
        return created;
      },
      markDayComplete: (planId, dayNumber, durationDays) => {
        const existing = get().progressByPlanId[planId];
        if (!existing) {
          return null;
        }

        const completedEntries = {
          ...existing.completed_entries,
          [String(dayNumber)]: new Date().toISOString(),
        };
        const completedCount = Object.keys(completedEntries).length;
        const completed = isPlanCompleted(durationDays, completedCount);
        const next: UserReadingPlanProgress = {
          ...existing,
          completed_entries: completedEntries,
          current_day: computeNextDay(existing.current_day, dayNumber),
          is_completed: completed,
          completed_at: completed ? new Date().toISOString() : existing.completed_at,
          synced_at: new Date().toISOString(),
        };

        set((state) => ({
          progressByPlanId: {
            ...state.progressByPlanId,
            [planId]: next,
          },
        }));

        return next;
      },
      removePlan: (planId) => {
        set((state) => {
          const next = { ...state.progressByPlanId };
          delete next[planId];
          return { progressByPlanId: next };
        });
      },
      savePlan: (planId) => {
        set((state) => ({
          savedPlanIds: state.savedPlanIds.includes(planId)
            ? state.savedPlanIds
            : [...state.savedPlanIds, planId],
        }));
      },
      unsavePlan: (planId) => {
        set((state) => ({
          savedPlanIds: state.savedPlanIds.filter((savedId) => savedId !== planId),
        }));
      },
      getProgress: (planId) => {
        const values = Object.values(get().progressByPlanId);
        return planId ? values.filter((progress) => progress.plan_id === planId) : values;
      },
      getSavedPlanIds: () => get().savedPlanIds,
      reset: () => {
        set({ savedPlanIds: [], progressByPlanId: {} });
      },
    }),
    {
      name: 'reading-plans-storage',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);

