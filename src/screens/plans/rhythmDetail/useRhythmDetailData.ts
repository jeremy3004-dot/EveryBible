import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPlanEntries, listReadingPlans } from '../../../services/plans/readingPlanService';
import type { ReadingPlan, ReadingPlanEntry } from '../../../services/plans/types';

const PLAN_ID_SEPARATOR = '\n';

/**
 * Loads the plan catalog and the entries of each plan in the rhythm.
 *
 * Keyed on the plan ids' contents, not the array: the rhythm is re-read from the
 * store on every edit, and retitling it or reordering passages must not refetch
 * the catalog behind a spinner.
 */
export function useRhythmDetailData(planIds: readonly string[]) {
  const { t } = useTranslation();
  const planIdsKey = planIds.join(PLAN_ID_SEPARATOR);
  const [allPlans, setAllPlans] = useState<ReadingPlan[]>([]);
  const [planEntriesById, setPlanEntriesById] = useState<Record<string, ReadingPlanEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const ids = planIdsKey ? planIdsKey.split(PLAN_ID_SEPARATOR) : [];

    const load = async () => {
      setLoading(true);
      setError(null);

      const plansResult = await listReadingPlans();
      if (!mounted) {
        return;
      }

      if (!plansResult.success || !plansResult.data) {
        setError(t('common.error', { defaultValue: 'Error' }));
        setLoading(false);
        return;
      }

      setAllPlans(plansResult.data);

      const entryResults = await Promise.all(
        ids.map(async (planId) => [planId, await getPlanEntries(planId)] as const)
      );
      if (!mounted) {
        return;
      }

      const planMap: Record<string, ReadingPlanEntry[]> = {};
      for (const [planId, result] of entryResults) {
        planMap[planId] = result.success && result.data ? result.data : [];
      }

      setPlanEntriesById(planMap);
      setLoading(false);
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [planIdsKey, t]);

  return { allPlans, planEntriesById, loading, error };
}
