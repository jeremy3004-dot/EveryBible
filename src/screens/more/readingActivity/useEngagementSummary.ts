import { useEffect, useState } from 'react';
import {
  getEngagementSummary,
  refreshEngagement,
} from '../../../services/analytics/analyticsService';
import type { UserEngagementSummary } from '../../../services/supabase/types';

/**
 * The signed-in reader's cloud totals, refreshed first so the row is current.
 * Signed out, or while it loads or if it fails, this is null and the screen
 * falls back to what this device recorded.
 */
export function useEngagementSummary(isAuthenticated: boolean): UserEngagementSummary | null {
  const [engagement, setEngagement] = useState<UserEngagementSummary | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    // Fire-and-forget refresh so the summary row is up-to-date before we read it
    refreshEngagement()
      .catch(() => {})
      .then(() => {
        if (cancelled) return;
        return getEngagementSummary();
      })
      .then((result) => {
        if (!cancelled && result?.success && result.data) {
          setEngagement(result.data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return engagement;
}
