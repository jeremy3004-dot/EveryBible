import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useReadingPlansStore } from '../../../stores/readingPlansStore';
import { isPlanOfferedToday } from '../../../services/plans/readingPlanModel';
import type { ReadingPlan } from '../../../services/plans/types';
import {
  formatPlansHeaderEyebrow,
  getActivePlanRows,
  getCompletedPlanItems,
  sortProgressNewestFirst,
} from './plansHomeModel';

/**
 * The reader's plans (newest first), the unfinished and finished ones joined to the
 * catalog, and the header's count line. A seasonal plan is out of My plans between
 * its seasons (see isJoinedPlanShownToday).
 */
export function usePlansProgress(allPlans: ReadingPlan[], today: Date) {
  const { t } = useTranslation();
  const progressByPlanId = useReadingPlansStore((state) => state.progressByPlanId);

  const userProgress = useMemo(() => sortProgressNewestFirst(progressByPlanId), [progressByPlanId]);
  const activePlans = useMemo(
    () => getActivePlanRows(allPlans, userProgress, today),
    [allPlans, today, userProgress]
  );
  const completedPlans = useMemo(
    () => getCompletedPlanItems(allPlans, userProgress),
    [allPlans, userProgress]
  );
  const offeredCount = useMemo(
    () => allPlans.filter((plan) => isPlanOfferedToday(plan, today)).length,
    [allPlans, today]
  );
  const headerEyebrow = useMemo(
    () =>
      formatPlansHeaderEyebrow(
        {
          activeCount: activePlans.length,
          completedCount: completedPlans.length,
          catalogSize: offeredCount,
        },
        t
      ),
    [activePlans.length, completedPlans.length, offeredCount, t]
  );

  return { userProgress, activePlans, completedPlans, headerEyebrow };
}
