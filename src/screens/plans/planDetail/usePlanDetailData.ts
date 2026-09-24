import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import {
  getPlanEntries,
  getPlansByCategory,
  listReadingPlans,
} from '../../../services/plans/readingPlanService';
import type { ReadingPlan, ReadingPlanEntry } from '../../../services/plans/types';

/** How many other plans in the same category the page suggests. */
const RELATED_PLAN_LIMIT = 5;

/**
 * Loads a plan, its entries and a few related plans. A failed entries refresh
 * keeps rows already shown; it only reports an error when there is nothing to show.
 */
export function usePlanDetailData(planId: string) {
  const { t } = useTranslation();
  const [plan, setPlan] = useState<ReadingPlan | null>(null);
  const [entries, setEntries] = useState<ReadingPlanEntry[]>([]);
  const [relatedPlans, setRelatedPlans] = useState<ReadingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [plansResult, entriesResult] = await Promise.all([
      listReadingPlans(),
      getPlanEntries(planId),
    ]);

    let foundPlan: ReadingPlan | null = null;
    if (plansResult.success) {
      foundPlan = (plansResult.data ?? []).find((p) => p.id === planId) ?? null;
      setPlan(foundPlan);
    } else {
      setError(t('common.error'));
    }

    if (entriesResult.success) {
      setEntries(entriesResult.data ?? []);
    } else {
      // Only surface an error when we have no entries to show; keep any
      // previously loaded rows visible on a transient refresh failure.
      setEntries((prev) => {
        if (prev.length === 0) {
          setError(t('common.error'));
        }
        return prev;
      });
    }

    // Fetch related plans once we know the category
    if (foundPlan?.category) {
      const relatedResult = await getPlansByCategory(foundPlan.category);
      if (relatedResult.success) {
        const filtered = (relatedResult.data ?? [])
          .filter((p) => p.id !== planId)
          .slice(0, RELATED_PLAN_LIMIT);
        setRelatedPlans(filtered);
      }
    }

    setLoading(false);
  }, [planId, t]);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  return { plan, entries, relatedPlans, loading, error, load };
}

/** Today's date, refreshed whenever the screen regains focus (a plan left open overnight). */
export function useFocusedToday(): Date {
  const [today, setToday] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      setToday(new Date());
    }, [])
  );
  return today;
}
