import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useReadingPlansStore } from '../../../stores/readingPlansStore';
import type { ReadingPlan } from '../../../services/plans/types';
import {
  formatPlansHeaderEyebrow,
  getCompletedPlanItems,
  sortProgressNewestFirst,
} from './plansHomeModel';

/** The reader's plans (newest first), the finished ones, and the header's count line. */
export function usePlansProgress(allPlans: ReadingPlan[]) {
  const { t } = useTranslation();
  const progressByPlanId = useReadingPlansStore((state) => state.progressByPlanId);

  const userProgress = useMemo(() => sortProgressNewestFirst(progressByPlanId), [progressByPlanId]);
  const completedPlans = useMemo(
    () => getCompletedPlanItems(allPlans, userProgress),
    [allPlans, userProgress]
  );
  const headerEyebrow = useMemo(
    () => formatPlansHeaderEyebrow(userProgress, allPlans.length, t),
    [allPlans.length, t, userProgress]
  );

  return { userProgress, completedPlans, headerEyebrow };
}
