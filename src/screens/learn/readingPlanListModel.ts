import type { ReadingPlan, UserReadingPlanProgress } from '../../services/supabase/types';

export interface ReadingPlanSectionPlan {
  plan: ReadingPlan;
  progress: UserReadingPlanProgress;
}

export interface ReadingPlanSections {
  activePlans: ReadingPlanSectionPlan[];
  completedPlans: ReadingPlanSectionPlan[];
  browsePlans: ReadingPlan[];
}

export function splitReadingPlanSections(
  plans: ReadingPlan[],
  progressByPlanId: Map<string, UserReadingPlanProgress>
): ReadingPlanSections {
  const activePlans: ReadingPlanSectionPlan[] = [];
  const completedPlans: ReadingPlanSectionPlan[] = [];

  plans.forEach((plan) => {
    const progress = progressByPlanId.get(plan.id);
    if (!progress) {
      return;
    }

    const sectionPlan = { plan, progress };
    if (progress.is_completed) {
      completedPlans.push(sectionPlan);
    } else {
      activePlans.push(sectionPlan);
    }
  });

  return {
    activePlans,
    completedPlans,
    browsePlans: plans,
  };
}
