import type { ReadingPlan, UserReadingPlanProgress } from '../../services/plans/types';

export interface HomeContinuePlan {
  plan: ReadingPlan;
  progress: UserReadingPlanProgress;
}

export function selectHomeContinuePlans(
  plans: ReadingPlan[],
  progressByPlanId: Record<string, UserReadingPlanProgress>,
  limit = 2
): HomeContinuePlan[] {
  return plans
    .map((plan) => {
      const progress = progressByPlanId[plan.id];
      return progress ? { plan, progress } : null;
    })
    .filter((item): item is HomeContinuePlan => item !== null && !item.progress.is_completed)
    .sort((left, right) => {
      if (right.progress.current_day !== left.progress.current_day) {
        return right.progress.current_day - left.progress.current_day;
      }

      return right.progress.started_at.localeCompare(left.progress.started_at);
    })
    .slice(0, Math.max(0, limit));
}
