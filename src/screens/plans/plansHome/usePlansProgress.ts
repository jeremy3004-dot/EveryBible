import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useReadingPlansStore } from '../../../stores/readingPlansStore';
import type { ReadingPlan } from '../../../services/plans/types';
import {
  formatPlansHeaderEyebrow,
  getActivePlanRows,
  getCompletedPlanItems,
  sortProgressNewestFirst,
} from './plansHomeModel';

/**
 * The reader's plans (newest first), the unfinished and finished ones joined to the
 * catalog, and the header's count line.
 */
export function usePlansProgress(allPlans: ReadingPlan[]) {
  const { t } = useTranslation();
  const progressByPlanId = useReadingPlansStore((state) => state.progressByPlanId);

  const userProgress = useMemo(() => sortProgressNewestFirst(progressByPlanId), [progressByPlanId]);
  const activePlans = useMemo(
    () => getActivePlanRows(allPlans, userProgress),
    [allPlans, userProgress]
  );
  const completedPlans = useMemo(
    () => getCompletedPlanItems(allPlans, userProgress),
    [allPlans, userProgress]
  );
  const headerEyebrow = useMemo(
    () =>
      formatPlansHeaderEyebrow(
        {
          activeCount: activePlans.length,
          completedCount: completedPlans.length,
          catalogSize: allPlans.length,
        },
        t
      ),
    [activePlans.length, allPlans.length, completedPlans.length, t]
  );

  return { userProgress, activePlans, completedPlans, headerEyebrow };
}
