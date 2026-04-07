import {
  READING_PLANS,
  READING_PLAN_BY_ID,
  READING_PLAN_ENTRIES_BY_PLAN_ID,
  TIMED_CHALLENGE_PLAN_IDS,
} from '../../data/readingPlans.generated';
import { useReadingPlansStore } from '../../stores/readingPlansStore';
import type {
  GroupReadingPlan,
  ReadingPlan,
  ReadingPlanEntry,
  UserReadingPlanProgress,
  UserSavedPlan,
} from './types';

export interface PlanServiceResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

function getPlan(planId: string): ReadingPlan | undefined {
  return READING_PLAN_BY_ID.get(planId);
}

export async function listReadingPlans(): Promise<PlanServiceResult<ReadingPlan[]>> {
  return { success: true, data: [...READING_PLANS].sort((a, b) => a.sort_order - b.sort_order) };
}

export async function getPlanEntries(planId: string): Promise<PlanServiceResult<ReadingPlanEntry[]>> {
  return { success: true, data: READING_PLAN_ENTRIES_BY_PLAN_ID.get(planId) ?? [] };
}

export async function enrollInPlan(planId: string): Promise<PlanServiceResult<UserReadingPlanProgress>> {
  const plan = getPlan(planId);
  if (!plan) {
    return { success: false, error: 'Plan not found' };
  }

  const created = useReadingPlansStore.getState().startPlan(planId);
  return { success: true, data: created };
}

export async function markDayComplete(
  planId: string,
  dayNumber: number
): Promise<PlanServiceResult<UserReadingPlanProgress>> {
  const plan = getPlan(planId);
  if (!plan) {
    return { success: false, error: 'Plan not found' };
  }

  const updated = useReadingPlansStore.getState().markDayComplete(planId, dayNumber, plan.duration_days);
  if (!updated) {
    return { success: false, error: 'Plan not started' };
  }

  return { success: true, data: updated };
}

export async function getUserPlanProgress(
  planId?: string
): Promise<PlanServiceResult<UserReadingPlanProgress[]>> {
  return { success: true, data: useReadingPlansStore.getState().getProgress(planId) };
}

export async function unenrollFromPlan(planId: string): Promise<PlanServiceResult> {
  useReadingPlansStore.getState().removePlan(planId);
  return { success: true };
}

export async function assignPlanToGroup(
  _planId: string,
  _groupId: string
): Promise<PlanServiceResult<GroupReadingPlan>> {
  return { success: false, error: 'Group plan assignments are not supported in local mode' };
}

export async function getGroupPlans(_groupId: string): Promise<PlanServiceResult<GroupReadingPlan[]>> {
  return { success: true, data: [] };
}

export async function syncPlanProgress(
  localProgress: UserReadingPlanProgress[]
): Promise<PlanServiceResult<UserReadingPlanProgress[]>> {
  return { success: true, data: localProgress };
}

export async function savePlanForLater(planId: string): Promise<PlanServiceResult<UserSavedPlan>> {
  useReadingPlansStore.getState().savePlan(planId);
  return {
    success: true,
    data: {
      id: planId,
      user_id: 'local-user',
      plan_id: planId,
      saved_at: new Date().toISOString(),
    },
  };
}

export async function unsavePlan(planId: string): Promise<PlanServiceResult> {
  useReadingPlansStore.getState().unsavePlan(planId);
  return { success: true };
}

export async function getSavedPlans(): Promise<PlanServiceResult<ReadingPlan[]>> {
  const savedIds = new Set(useReadingPlansStore.getState().getSavedPlanIds());
  return {
    success: true,
    data: READING_PLANS.filter((plan) => savedIds.has(plan.id)).sort(
      (a, b) => a.sort_order - b.sort_order
    ),
  };
}

export async function getCompletedPlans(): Promise<
  PlanServiceResult<(UserReadingPlanProgress & { plan: ReadingPlan })[]>
> {
  const completed = useReadingPlansStore
    .getState()
    .getProgress()
    .filter((progress) => progress.is_completed)
    .map((progress) => ({
      ...progress,
      plan: getPlan(progress.plan_id)!,
    }))
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

  return { success: true, data: completed };
}

export async function getFeaturedPlans(): Promise<PlanServiceResult<ReadingPlan[]>> {
  return {
    success: true,
    data: READING_PLANS.filter((plan) => plan.featured).sort((a, b) => a.sort_order - b.sort_order),
  };
}

export async function getTimedChallengePlans(): Promise<PlanServiceResult<ReadingPlan[]>> {
  return {
    success: true,
    data: READING_PLANS.filter((plan) => TIMED_CHALLENGE_PLAN_IDS.has(plan.id)).sort(
      (a, b) => a.sort_order - b.sort_order
    ),
  };
}

export async function getPlansByCategory(
  category: string
): Promise<PlanServiceResult<ReadingPlan[]>> {
  return {
    success: true,
    data: READING_PLANS.filter((plan) => plan.category === category).sort(
      (a, b) => a.sort_order - b.sort_order
    ),
  };
}

