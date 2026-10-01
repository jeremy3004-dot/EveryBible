import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { reportHandledError } from '../../../services/diagnostics/crashReportQueue';
import { getUserPlanProgress, listReadingPlans } from '../../../services/plans/readingPlanService';
import type { ReadingPlan } from '../../../services/plans/types';

/**
 * The bundled plan catalog, loaded once on first open and reloaded quietly (no
 * skeleton) each time the screen regains focus or is pulled to refresh. The first
 * open is also a focus, so it is the focus effect alone that drives the initial
 * load — an extra mount effect would double it. The reader's progress is hydrated
 * from the server in the background; the catalog never waits for it.
 */
export function usePlansCatalog() {
  const [allPlans, setAllPlans] = useState<ReadingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnce = useRef(false);

  const hydratePlanProgress = useCallback(async () => {
    await getUserPlanProgress().catch(() => {});
  }, []);

  const loadAllData = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);

      // A rejection (a lazy catalog chunk that cannot load) still ends the first-load
      // skeleton; the callers swallow it, which used to leave the skeleton up for good.
      try {
        const allPlansResult = await listReadingPlans();
        if (allPlansResult.success && allPlansResult.data) {
          setAllPlans(allPlansResult.data);
        }
      } catch (error) {
        reportHandledError('plans.catalog', error);
      } finally {
        if (!quiet) setLoading(false);
      }

      void hydratePlanProgress();
    },
    [hydratePlanProgress]
  );

  useFocusEffect(
    useCallback(() => {
      // Quiet from the second focus onward; the very first focus (the initial
      // open) still shows the skeleton until the catalog resolves.
      const quiet = hasLoadedOnce.current;
      hasLoadedOnce.current = true;
      loadAllData(quiet).catch(() => {});
    }, [loadAllData])
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllData(true).catch(() => {});
    setRefreshing(false);
  }, [loadAllData]);

  return { allPlans, loading, refreshing, refresh };
}
