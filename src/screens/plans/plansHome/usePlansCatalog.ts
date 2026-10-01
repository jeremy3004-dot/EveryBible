import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { reportHandledError } from '../../../services/diagnostics/crashReportQueue';
import { getUserPlanProgress, listReadingPlans } from '../../../services/plans/readingPlanService';
import type { ReadingPlan } from '../../../services/plans/types';

// The server progress read costs two requests (progress rows + unenrol tombstones). Tabbing away
// and back inside this window reuses what the last read already merged into the store; a
// pull-to-refresh always reads.
const PROGRESS_HYDRATE_MIN_INTERVAL_MS = 2 * 60 * 1000;

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

  const lastHydratedAt = useRef<number | null>(null);

  const hydratePlanProgress = useCallback(async (force: boolean) => {
    const last = lastHydratedAt.current;
    if (!force && last !== null && Date.now() - last < PROGRESS_HYDRATE_MIN_INTERVAL_MS) return;
    lastHydratedAt.current = Date.now();
    await getUserPlanProgress().catch(() => {
      // Failed: let the next focus retry rather than waiting out the window.
      lastHydratedAt.current = null;
    });
  }, []);

  const loadAllData = useCallback(
    async (quiet = false, force = false) => {
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

      void hydratePlanProgress(force);
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
    await loadAllData(true, true).catch(() => {});
    setRefreshing(false);
  }, [loadAllData]);

  return { allPlans, loading, refreshing, refresh };
}
