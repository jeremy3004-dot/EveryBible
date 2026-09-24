import type { ReadingPlansStoreApi } from '../../../stores/readingPlansStore';
import type {
  GroupReadingPlan,
  PlanSessionKey,
  ReadingPlan,
  ReadingPlanEntry,
  UserReadingPlanProgress,
} from '../types';
import type { SyncIdentityBoundary } from '../../sync/syncIdentity';
import { getBundledPlanEntries, getPlan, getSortedPlans } from './planCatalog';
import { completePlanDayInStore, completePlanSessionInStore } from './planCompletion';
import { getLocalProgressList } from './planLiveStore';
import type { PlanServiceResult } from './planServiceResult';

export interface ReadingPlanService {
  listReadingPlans(): Promise<PlanServiceResult<ReadingPlan[]>>;
  getPlanEntries(planId: string): Promise<PlanServiceResult<ReadingPlanEntry[]>>;
  enrollInPlan(planId: string): Promise<PlanServiceResult<UserReadingPlanProgress>>;
  markDayComplete(
    planId: string,
    dayNumber: number
  ): Promise<PlanServiceResult<UserReadingPlanProgress>>;
  markPlanSessionComplete(
    planId: string,
    dayNumber: number,
    sessionKey: PlanSessionKey
  ): Promise<PlanServiceResult<UserReadingPlanProgress>>;
  getUserPlanProgress(
    planId?: string,
    expectedUserId?: string,
    expectedGeneration?: number,
    prevalidatedIdentity?: SyncIdentityBoundary
  ): Promise<PlanServiceResult<UserReadingPlanProgress[]>>;
  unenrollFromPlan(planId: string): Promise<PlanServiceResult>;
  assignPlanToGroup(planId: string, groupId: string): Promise<PlanServiceResult<GroupReadingPlan>>;
  getGroupPlans(groupId: string): Promise<PlanServiceResult<GroupReadingPlan[]>>;
  syncPlanProgress(
    localProgress: UserReadingPlanProgress[],
    expectedUserId?: string,
    expectedGeneration?: number
  ): Promise<PlanServiceResult<UserReadingPlanProgress[]>>;
}

/**
 * The plan service over a given store with no server: every call is answered from the bundled
 * catalog and that store. Used where there is no account to sync (and by tests).
 */
export function createReadingPlanService(store: ReadingPlansStoreApi): ReadingPlanService {
  return {
    listReadingPlans: async () => ({
      success: true,
      data: getSortedPlans(),
    }),

    getPlanEntries: async (planId: string) => ({
      success: true,
      data: getBundledPlanEntries(planId),
    }),

    enrollInPlan: async (planId: string) => {
      const plan = getPlan(planId);
      if (!plan) {
        return { success: false, error: 'Plan not found' };
      }

      return {
        success: true,
        data: store.getState().enrollPlan(planId),
      };
    },

    markDayComplete: async (planId: string, dayNumber: number) => {
      const plan = getPlan(planId);
      const updated = plan ? completePlanDayInStore(store, plan, dayNumber) : null;

      if (!updated) {
        return { success: false, error: 'Not enrolled in this plan' };
      }

      return { success: true, data: updated };
    },

    markPlanSessionComplete: async (
      planId: string,
      dayNumber: number,
      sessionKey: PlanSessionKey
    ) => {
      const plan = getPlan(planId);
      if (!plan) {
        return { success: false, error: 'Plan not found' };
      }

      const outcome = completePlanSessionInStore(store, plan, dayNumber, sessionKey);
      if (!outcome.found) {
        return { success: false, error: 'Plan session not found' };
      }
      if (!outcome.progress) {
        return { success: false, error: 'Not enrolled in this plan' };
      }

      return { success: true, data: outcome.progress };
    },

    getUserPlanProgress: async (planId?: string) => ({
      success: true,
      data: getLocalProgressList(store, planId),
    }),

    unenrollFromPlan: async (planId: string) => {
      store.getState().unenrollPlan(planId);
      return { success: true };
    },

    assignPlanToGroup: async (planId: string, groupId: string) => ({
      success: true,
      data: store.getState().assignGroupPlan(groupId, planId),
    }),

    getGroupPlans: async (groupId: string) => ({
      success: true,
      data: store.getState().getGroupPlans(groupId),
    }),

    syncPlanProgress: async (localProgress: UserReadingPlanProgress[]) => {
      localProgress.forEach((progress) => {
        store.getState().upsertProgress(progress);
      });

      return { success: true, data: localProgress };
    },
  };
}
