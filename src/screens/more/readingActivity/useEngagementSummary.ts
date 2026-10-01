import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getEngagementSummary,
  refreshEngagement,
} from '../../../services/analytics/analyticsService';
import type { UserEngagementSummary } from '../../../services/supabase/types';

// Tab-hopping refocuses this screen often; a summary this fresh is reused rather than refetched.
const SUMMARY_FRESH_MS = 60_000;

/**
 * The signed-in reader's cloud totals, refreshed first so the row is current.
 * Signed out, or while it loads or if it fails, this is null and the screen
 * falls back to what this device recorded. A summary belongs to the account that
 * loaded it: after a sign-out or an account switch it is never shown for another.
 */
export function useEngagementSummary(
  isAuthenticated: boolean,
  userId: string | null = null
): UserEngagementSummary | null {
  const owner = isAuthenticated ? (userId ?? '') : null;
  const [loaded, setLoaded] = useState<{
    owner: string;
    summary: UserEngagementSummary;
  } | null>(null);

  const fetchedRef = useRef<{ owner: string; at: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) return;
      const fetched = fetchedRef.current;
      if (fetched?.owner === (owner ?? '') && Date.now() - fetched.at < SUMMARY_FRESH_MS) return;
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
            fetchedRef.current = { owner: owner ?? '', at: Date.now() };
            setLoaded({ owner: owner ?? '', summary: result.data });
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [isAuthenticated, owner])
  );

  return owner !== null && loaded?.owner === owner ? loaded.summary : null;
}
