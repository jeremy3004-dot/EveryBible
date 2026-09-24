import { useCallback, useEffect, useRef, useState } from 'react';
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
  // Mirrors `entries` so a failed refresh can check what was already on screen
  // without reading state from inside a setState updater (a side effect there
  // can run more than once under StrictMode/concurrent rendering).
  const entriesRef = useRef<ReadingPlanEntry[]>(entries);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [plansResult, entriesResult] = await Promise.all([
      listReadingPlans(),
      getPlanEntries(planId),
    ]);

    let foundPlan: ReadingPlan | null = null;
    let nextError: string | null = null;
    if (plansResult.success) {
      foundPlan = (plansResult.data ?? []).find((p) => p.id === planId) ?? null;
      setPlan(foundPlan);
      if (!foundPlan) {
        // A persisted or notification-supplied id can outlive its catalog entry. Without
        // this the page rendered an empty ledger under a Start plan button that enrolled
        // the reader in a plan that does not exist.
        nextError = t('common.error');
      }
    } else {
      nextError = t('common.error');
    }

    if (entriesResult.success) {
      entriesRef.current = entriesResult.data ?? [];
      setEntries(entriesRef.current);
    } else if (entriesRef.current.length === 0) {
      // Only surface an error when we have no entries to show; keep any
      // previously loaded rows visible on a transient refresh failure.
      nextError = t('common.error');
    }

    if (nextError) setError(nextError);

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
