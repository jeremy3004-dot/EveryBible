import type { GroupReadingPlan, ReadingPlansStoreState } from '../../services/plans/types';
import {
  createEmptyState,
  removePlanDayResumeEntries,
  removePlanFromCollections,
  withoutKey,
} from './planProgressModel';
import { removePlanFromRhythms } from './rhythmModel';
import type { ReadingPlansSliceCreator } from './readingPlansSliceTypes';

type EnrollmentSlice = Pick<
  ReadingPlansStoreState,
  | 'savePlan'
  | 'unsavePlan'
  | 'unenrollPlan'
  | 'addPendingUnenroll'
  | 'clearPendingUnenroll'
  | 'clearPendingUnenrolls'
  | 'rememberServerLeftAt'
  | 'endPlanLeftElsewhere'
  | 'assignGroupPlan'
  | 'getGroupPlans'
  | 'resetAll'
  | 'resetForSignOut'
>;

/** Everything a plan leaves behind locally: its row, day resumes and rhythm membership. */
const withoutPlan = (state: ReadingPlansStoreState, planId: string) => ({
  ...removePlanFromCollections(state, planId),
  ...removePlanDayResumeEntries(state, planId),
  ...removePlanFromRhythms(state, planId),
});

/**
 * Saved plans, leaving a plan (with the pending-unenroll tombstones the sync retries), group
 * assignments, and the resets.
 */
export const createEnrollmentSlice: ReadingPlansSliceCreator<EnrollmentSlice> = (set, get) => ({
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

  unenrollPlan: (planId) => {
    set((state) => ({
      ...state,
      ...withoutPlan(state, planId),
      // Record a tombstone so a stale remote row cannot re-enroll the user
      // and the remote delete can be retried on the next sync (M12).
      pendingUnenrollPlanIds: state.pendingUnenrollPlanIds.includes(planId)
        ? state.pendingUnenrollPlanIds
        : [...state.pendingUnenrollPlanIds, planId],
      pendingUnenrollAtByPlanId: {
        ...state.pendingUnenrollAtByPlanId,
        [planId]: new Date().toISOString(),
      },
      // This leave supersedes an earlier one's stored time; its own replaces it once confirmed.
      serverLeftAtByPlanId: withoutKey(state.serverLeftAtByPlanId, planId),
    }));
  },

  addPendingUnenroll: (planId) => {
    set((state) =>
      state.pendingUnenrollPlanIds.includes(planId)
        ? state
        : {
            ...state,
            pendingUnenrollPlanIds: [...state.pendingUnenrollPlanIds, planId],
            pendingUnenrollAtByPlanId: {
              ...state.pendingUnenrollAtByPlanId,
              [planId]: state.pendingUnenrollAtByPlanId[planId] ?? new Date().toISOString(),
            },
          }
    );
  },

  clearPendingUnenroll: (planId) => {
    set((state) => ({
      ...state,
      pendingUnenrollPlanIds: state.pendingUnenrollPlanIds.filter((id) => id !== planId),
      pendingUnenrollAtByPlanId: withoutKey(state.pendingUnenrollAtByPlanId, planId),
    }));
  },

  clearPendingUnenrolls: () => {
    set((state) => ({
      ...state,
      pendingUnenrollPlanIds: [],
      pendingUnenrollAtByPlanId: {},
    }));
  },

  rememberServerLeftAt: (planId, storedLeftAt) => {
    set((state) => ({
      ...state,
      serverLeftAtByPlanId: { ...state.serverLeftAtByPlanId, [planId]: storedLeftAt },
    }));
  },

  endPlanLeftElsewhere: (planId, storedLeftAt) => {
    set((state) => ({
      ...state,
      ...withoutPlan(state, planId),
      // A re-join here starts after it, as after this phone's own confirmed leave.
      serverLeftAtByPlanId: { ...state.serverLeftAtByPlanId, [planId]: storedLeftAt },
    }));
  },

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

  resetForSignOut: () => set(createEmptyState()),
});
