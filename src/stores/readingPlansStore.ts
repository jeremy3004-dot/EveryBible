import { createStore, type StoreApi } from 'zustand/vanilla';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { useStore } from 'zustand';

import { computeNextDay, isPlanCompleted } from '../services/plans/readingPlanModel';
import type {
  GroupReadingPlan,
  ReadingPlanProgress,
  ReadingPlanRhythm,
  ReadingPlanRhythmInput,
  ReadingPlanRhythmMutationResult,
  ReadingPlansPersistedState,
  ReadingPlansStoreState,
  RhythmId,
} from '../services/plans/types';

export type ReadingPlansStoreApi = StoreApi<ReadingPlansStoreState>;

let rhythmSequence = 0;

const createEmptyState = (): ReadingPlansPersistedState => ({
  enrolledPlanIds: [],
  savedPlanIds: [],
  completedPlanIds: [],
  progressByPlanId: {},
  planDayResumeByKey: {},
  groupPlansByGroupId: {},
  rhythmsById: {},
  rhythmOrder: [],
});

const buildPlanDayResumeKey = (planId: string, dayNumber: number): string => `${planId}:${dayNumber}`;

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

const createRhythmId = (): RhythmId => `reading-plan-rhythm-${Date.now()}-${(rhythmSequence += 1)}`;

const normalizeRhythmPlanIds = (planIds: string[] = []): string[] => {
  const seen = new Set<string>();

  return planIds.reduce<string[]>((accumulator, planId) => {
    const trimmedPlanId = planId.trim();
    if (!trimmedPlanId || seen.has(trimmedPlanId)) {
      return accumulator;
    }

    seen.add(trimmedPlanId);
    accumulator.push(trimmedPlanId);
    return accumulator;
  }, []);
};

const findRhythmIdForPlan = (
  rhythmsById: Record<RhythmId, ReadingPlanRhythm>,
  planId: string,
  excludeRhythmId?: RhythmId
): RhythmId | null => {
  for (const rhythm of Object.values(rhythmsById)) {
    if (rhythm.id === excludeRhythmId) {
      continue;
    }

    if (rhythm.planIds.includes(planId)) {
      return rhythm.id;
    }
  }

  return null;
};

const getFallbackRhythmTitle = (
  rhythmsById: Record<RhythmId, ReadingPlanRhythm>,
  excludeRhythmId?: RhythmId
): string => {
  const usedTitles = new Set(
    Object.values(rhythmsById)
      .filter((rhythm) => rhythm.id !== excludeRhythmId)
      .map((rhythm) => rhythm.title.trim().toLowerCase())
      .filter(Boolean)
  );

  let fallbackIndex = 1;
  while (usedTitles.has(`rhythm ${fallbackIndex}`)) {
    fallbackIndex += 1;
  }

  return `Rhythm ${fallbackIndex}`;
};

const resolveRhythmTitle = (
  title: string | null | undefined,
  rhythmsById: Record<RhythmId, ReadingPlanRhythm>,
  excludeRhythmId?: RhythmId
): string => {
  const trimmedTitle = title?.trim();
  return trimmedTitle ? trimmedTitle : getFallbackRhythmTitle(rhythmsById, excludeRhythmId);
};

const normalizeRhythmOrder = (
  candidateOrder: RhythmId[],
  rhythmsById: Record<RhythmId, ReadingPlanRhythm>
): RhythmId[] => {
  const nextOrder: RhythmId[] = [];
  const seen = new Set<RhythmId>();

  for (const rhythmId of candidateOrder) {
    if (!rhythmsById[rhythmId] || seen.has(rhythmId)) {
      continue;
    }

    seen.add(rhythmId);
    nextOrder.push(rhythmId);
  }

  for (const rhythmId of Object.keys(rhythmsById)) {
    if (seen.has(rhythmId)) {
      continue;
    }

    seen.add(rhythmId);
    nextOrder.push(rhythmId);
  }

  return nextOrder;
};

const normalizeRhythmCollections = (
  rhythmsById: Record<RhythmId, ReadingPlanRhythm>,
  rhythmOrder: RhythmId[]
): Pick<ReadingPlansPersistedState, 'rhythmsById' | 'rhythmOrder'> => {
  const nextRhythmsById = { ...rhythmsById };
  const nextRhythmOrder = normalizeRhythmOrder(rhythmOrder, nextRhythmsById);

  return {
    rhythmsById: nextRhythmsById,
    rhythmOrder: nextRhythmOrder,
  };
};

const buildRhythmMutationResult = (
  success: boolean,
  rhythm?: ReadingPlanRhythm,
  error?: string
): ReadingPlanRhythmMutationResult => ({ success, rhythm, error });

const validateRhythmPlans = (
  rhythmsById: Record<RhythmId, ReadingPlanRhythm>,
  planIds: string[],
  excludeRhythmId?: RhythmId
): string | null => {
  for (const planId of planIds) {
    const ownerRhythmId = findRhythmIdForPlan(rhythmsById, planId, excludeRhythmId);
    if (ownerRhythmId) {
      return 'Plan already belongs to another rhythm';
    }
  }

  return null;
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

const removePlanDayResumeEntries = (
  state: ReadingPlansStoreState,
  planId: string
): Pick<ReadingPlansStoreState, 'planDayResumeByKey'> => ({
  planDayResumeByKey: Object.fromEntries(
    Object.entries(state.planDayResumeByKey).filter(([key]) => !key.startsWith(`${planId}:`))
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

const removePlanFromRhythms = (
  state: ReadingPlansStoreState,
  planId: string
): Pick<ReadingPlansStoreState, 'rhythmsById' | 'rhythmOrder'> => {
  const rhythmsById = Object.fromEntries(
    Object.entries(state.rhythmsById)
      .map(([rhythmId, rhythm]) => {
        const nextPlanIds = rhythm.planIds.filter((id) => id !== planId);
        if (nextPlanIds.length === 0) {
          return null;
        }

        return [
          rhythmId,
          nextPlanIds.length === rhythm.planIds.length
            ? rhythm
            : { ...rhythm, planIds: nextPlanIds, updatedAt: new Date().toISOString() },
        ];
      })
      .filter((entry): entry is [RhythmId, ReadingPlanRhythm] => entry !== null)
  );

  return normalizeRhythmCollections(rhythmsById, state.rhythmOrder.filter((id) => rhythmsById[id]));
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

        createRhythm: (input: ReadingPlanRhythmInput = {}) => {
          const planIds = normalizeRhythmPlanIds(input.planIds);
          if (planIds.length === 0) {
            return buildRhythmMutationResult(false, undefined, 'Select at least one plan');
          }

          const state = get();
          const validationError = validateRhythmPlans(state.rhythmsById, planIds);
          if (validationError) {
            return buildRhythmMutationResult(false, undefined, validationError);
          }

          const now = new Date().toISOString();
          const rhythm: ReadingPlanRhythm = {
            id: createRhythmId(),
            title: resolveRhythmTitle(input.title, state.rhythmsById),
            planIds,
            createdAt: now,
            updatedAt: now,
          };

          set((currentState) => ({
            ...currentState,
            ...normalizeRhythmCollections(
              {
                ...currentState.rhythmsById,
                [rhythm.id]: rhythm,
              },
              [...currentState.rhythmOrder, rhythm.id]
            ),
          }));

          return buildRhythmMutationResult(true, rhythm);
        },

        updateRhythm: (rhythmId, input = {}) => {
          const existingRhythm = get().rhythmsById[rhythmId];
          if (!existingRhythm) {
            return buildRhythmMutationResult(false, undefined, 'Rhythm not found');
          }

          const nextPlanIds =
            input.planIds !== undefined
              ? normalizeRhythmPlanIds(input.planIds)
              : existingRhythm.planIds;

          if (nextPlanIds.length === 0) {
            return buildRhythmMutationResult(false, undefined, 'Select at least one plan');
          }

          const state = get();
          const validationError = validateRhythmPlans(state.rhythmsById, nextPlanIds, rhythmId);
          if (validationError) {
            return buildRhythmMutationResult(false, undefined, validationError);
          }

          const rhythm: ReadingPlanRhythm = {
            ...existingRhythm,
            title: resolveRhythmTitle(input.title, state.rhythmsById, rhythmId),
            planIds: nextPlanIds,
            updatedAt: new Date().toISOString(),
          };

          set((currentState) => ({
            ...currentState,
            ...normalizeRhythmCollections(
              {
                ...currentState.rhythmsById,
                [rhythmId]: rhythm,
              },
              currentState.rhythmOrder
            ),
          }));

          return buildRhythmMutationResult(true, rhythm);
        },

        deleteRhythm: (rhythmId) => {
          set((state) => {
            if (!state.rhythmsById[rhythmId]) {
              return state;
            }

            const rhythmsById = { ...state.rhythmsById };
            delete rhythmsById[rhythmId];
            return {
              ...state,
              ...normalizeRhythmCollections(rhythmsById, state.rhythmOrder.filter((id) => id !== rhythmId)),
            };
          });
        },

        reorderRhythms: (rhythmOrder) => {
          set((state) => ({
            ...state,
            ...normalizeRhythmCollections(state.rhythmsById, rhythmOrder),
          }));
        },

        moveRhythmPlan: (rhythmId, planId, direction) => {
          set((state) => {
            const rhythm = state.rhythmsById[rhythmId];
            if (!rhythm) {
              return state;
            }

            const currentIndex = rhythm.planIds.indexOf(planId);
            if (currentIndex < 0) {
              return state;
            }

            const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (nextIndex < 0 || nextIndex >= rhythm.planIds.length) {
              return state;
            }

            const planIds = [...rhythm.planIds];
            const [movedPlanId] = planIds.splice(currentIndex, 1);
            planIds.splice(nextIndex, 0, movedPlanId);

            return {
              ...state,
              rhythmsById: {
                ...state.rhythmsById,
                [rhythmId]: {
                  ...rhythm,
                  planIds,
                  updatedAt: new Date().toISOString(),
                },
              },
            };
          });
        },

        getRhythm: (rhythmId) => get().rhythmsById[rhythmId] ?? null,

        getRhythmForPlan: (planId) =>
          get()
            .rhythmOrder.map((rhythmId) => get().rhythmsById[rhythmId] ?? null)
            .find((rhythm): rhythm is ReadingPlanRhythm => rhythm !== null && rhythm.planIds.includes(planId)) ?? null,

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

        setPlanDayResume: (planId, dayNumber, bookId, chapter) => {
          if (!bookId || !Number.isInteger(chapter) || chapter < 1) {
            return;
          }

          const resumeKey = buildPlanDayResumeKey(planId, dayNumber);
          set((state) => ({
            ...state,
            planDayResumeByKey: {
              ...state.planDayResumeByKey,
              [resumeKey]: { bookId, chapter },
            },
          }));
        },

        getPlanDayResume: (planId, dayNumber) =>
          get().planDayResumeByKey[buildPlanDayResumeKey(planId, dayNumber)] ?? null,

        clearPlanDayResume: (planId, dayNumber) => {
          const resumeKey = buildPlanDayResumeKey(planId, dayNumber);
          set((state) => ({
            ...state,
            planDayResumeByKey: Object.fromEntries(
              Object.entries(state.planDayResumeByKey).filter(([key]) => key !== resumeKey)
            ),
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
            ...removePlanDayResumeEntries(state, planId),
            ...removePlanFromRhythms(state, planId),
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
          planDayResumeByKey: state.planDayResumeByKey,
          groupPlansByGroupId: state.groupPlansByGroupId,
          rhythmsById: state.rhythmsById,
          rhythmOrder: state.rhythmOrder,
        }),
        merge: (persistedState, currentState) => {
          const mergedState = {
            ...currentState,
            ...(persistedState as Partial<ReadingPlansPersistedState>),
          };

          return {
            ...mergedState,
            ...normalizeRhythmCollections(mergedState.rhythmsById, mergedState.rhythmOrder),
          };
        },
      }
    )
  );
}

export const readingPlansStore = createReadingPlansStore();

export function useReadingPlansStore<T>(selector: (state: ReadingPlansStoreState) => T): T {
  return useStore(readingPlansStore, selector);
}
