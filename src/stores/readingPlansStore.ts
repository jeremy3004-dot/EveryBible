import { createStore, type StoreApi } from 'zustand/vanilla';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { useStore } from 'zustand';

import { computeNextDay, isPlanCompleted } from '../services/plans/readingPlanModel';
import type {
  GroupReadingPlan,
  ReadingPlanProgress,
  ReadingPlansPersistedState,
  ReadingPlansStoreState,
} from '../services/plans/types';

export type ReadingPlansStoreApi = StoreApi<ReadingPlansStoreState>;

const createEmptyState = (): ReadingPlansPersistedState => ({
  enrolledPlanIds: [],
  savedPlanIds: [],
  completedPlanIds: [],
  progressByPlanId: {},
  groupPlansByGroupId: {},
});

const createProgressRecord = (planId: string): ReadingPlanProgress => {
  const now = new Date().toISOString();

  return {
    id: `reading-plan-progress-${planId}`,
    plan_id: planId,
    started_at: now,
    completed_entries: {},
    current_day: 1,
    is_completed: false,
    completed_at: null,
    synced_at: now,
  };
};

const applyProgressUpdate = (
  state: ReadingPlansStoreState,
  progress: ReadingPlanProgress
): Pick<
  ReadingPlansStoreState,
  'enrolledPlanIds' | 'completedPlanIds' | 'progressByPlanId'
> => {
  const enrolledPlanIds = state.enrolledPlanIds.includes(progress.plan_id)
    ? state.enrolledPlanIds
    : [...state.enrolledPlanIds, progress.plan_id];

  const completedPlanIds = progress.is_completed
    ? state.completedPlanIds.includes(progress.plan_id)
      ? state.completedPlanIds
      : [...state.completedPlanIds, progress.plan_id]
    : state.completedPlanIds.filter((planId) => planId !== progress.plan_id);

  return {
    enrolledPlanIds,
    completedPlanIds,
    progressByPlanId: {
      ...state.progressByPlanId,
      [progress.plan_id]: progress,
    },
  };
};

const removePlanFromCollections = (
  state: ReadingPlansStoreState,
  planId: string
): Pick<
  ReadingPlansStoreState,
  'enrolledPlanIds' | 'completedPlanIds' | 'progressByPlanId'
> => ({
  enrolledPlanIds: state.enrolledPlanIds.filter((id) => id !== planId),
  completedPlanIds: state.completedPlanIds.filter((id) => id !== planId),
  progressByPlanId: Object.fromEntries(
    Object.entries(state.progressByPlanId).filter(([id]) => id !== planId)
  ),
});

const replaceProgressCollections = (
  progressList: ReadingPlanProgress[]
): Pick<
  ReadingPlansStoreState,
  'enrolledPlanIds' | 'completedPlanIds' | 'progressByPlanId'
> => {
  const progressByPlanId = Object.fromEntries(
    progressList.map((progress) => [progress.plan_id, progress])
  );

  return {
    enrolledPlanIds: progressList.map((progress) => progress.plan_id),
    completedPlanIds: progressList
      .filter((progress) => progress.is_completed)
      .map((progress) => progress.plan_id),
    progressByPlanId,
  };
};

const lazyDefaultStorage: StateStorage = {
  setItem: async (name, value) => {
    const { zustandStorage } = await import('./mmkvStorage');
    return zustandStorage.setItem(name, value);
  },
  getItem: async (name) => {
    const { zustandStorage } = await import('./mmkvStorage');
    return zustandStorage.getItem(name);
  },
  removeItem: async (name) => {
    const { zustandStorage } = await import('./mmkvStorage');
    return zustandStorage.removeItem(name);
  },
};

export function createReadingPlansStore(storage: StateStorage = lazyDefaultStorage): ReadingPlansStoreApi {
  return createStore<ReadingPlansStoreState>()(
    persist(
      (set, get) => ({
        ...createEmptyState(),

        enrollPlan: (planId) => {
          const progress = createProgressRecord(planId);
          set((state) => ({
            ...state,
            ...applyProgressUpdate(state, progress),
          }));
          return progress;
        },

        savePlan: (planId) => {
          set((state) =>
            state.savedPlanIds.includes(planId)
              ? state
              : { ...state, savedPlanIds: [...state.savedPlanIds, planId] }
          );
        },

        unsavePlan: (planId) => {
          set((state) => ({
            ...state,
            savedPlanIds: state.savedPlanIds.filter((id) => id !== planId),
          }));
        },

        upsertProgress: (progress) => {
          set((state) => ({
            ...state,
            ...applyProgressUpdate(state, progress),
          }));
          return progress;
        },

        replaceProgress: (progressList) => {
          set((state) => ({
            ...state,
            ...replaceProgressCollections(progressList),
          }));
        },

        markDayComplete: (planId, dayNumber, totalDays) => {
          const existing = get().progressByPlanId[planId];
          if (!existing) {
            return null;
          }

          const now = new Date().toISOString();
          const completed_entries: Record<string, string> = {
            ...existing.completed_entries,
            [String(dayNumber)]: now,
          };

          const updatedProgress: ReadingPlanProgress = {
            ...existing,
            completed_entries,
            current_day: computeNextDay(existing.current_day, dayNumber),
            is_completed: isPlanCompleted(totalDays, Object.keys(completed_entries).length),
            completed_at: isPlanCompleted(totalDays, Object.keys(completed_entries).length)
              ? now
              : null,
            synced_at: now,
          };

          set((state) => ({
            ...state,
            ...applyProgressUpdate(state, updatedProgress),
          }));

          return updatedProgress;
        },

        unenrollPlan: (planId) => {
          set((state) => ({
            ...state,
            ...removePlanFromCollections(state, planId),
          }));
        },

        getProgress: (planId) => get().progressByPlanId[planId] ?? null,

        assignGroupPlan: (groupId, planId, assignedBy = 'local-user') => {
          const createdAt = new Date().toISOString();
          const groupPlan: GroupReadingPlan = {
            id: `group-plan-${groupId}-${planId}-${Date.now()}`,
            group_id: groupId,
            plan_id: planId,
            assigned_by: assignedBy,
            started_at: createdAt,
          };

          set((state) => ({
            ...state,
            groupPlansByGroupId: {
              ...state.groupPlansByGroupId,
              [groupId]: [...(state.groupPlansByGroupId[groupId] ?? []), groupPlan],
            },
          }));

          return groupPlan;
        },

        getGroupPlans: (groupId) => get().groupPlansByGroupId[groupId] ?? [],

        resetAll: () => set(createEmptyState()),
      }),
      {
        name: 'reading-plans-storage',
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({
          enrolledPlanIds: state.enrolledPlanIds,
          savedPlanIds: state.savedPlanIds,
          completedPlanIds: state.completedPlanIds,
          progressByPlanId: state.progressByPlanId,
          groupPlansByGroupId: state.groupPlansByGroupId,
        }),
        merge: (persistedState, currentState) => ({
          ...currentState,
          ...(persistedState as Partial<ReadingPlansPersistedState>),
        }),
      }
    )
  );
}

export const readingPlansStore = createReadingPlansStore();

export function useReadingPlansStore<T>(selector: (state: ReadingPlansStoreState) => T): T {
  return useStore(readingPlansStore, selector);
}
