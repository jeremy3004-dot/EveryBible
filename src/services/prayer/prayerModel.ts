import type { InteractionCounts, PrayerRequestWithCounts } from './prayerService';
import type { PrayerRequest } from '../supabase/types';

// ---------------------------------------------------------------------------
// Pure model functions for prayer community — no Supabase dependency.
// These are extracted so they can be unit-tested without network or auth.
// ---------------------------------------------------------------------------

/**
 * Aggregates raw interaction rows (each having request_id and type) into a
 * per-request count map.  Mirrors the aggregation performed inside
 * listPrayerRequests() in prayerService.ts.
 */
export function aggregateInteractionCounts(
  requestIds: string[],
  interactions: Array<{ request_id: string; type: string }>
): Record<string, InteractionCounts> {
  const countMap: Record<string, InteractionCounts> = {};

  for (const id of requestIds) {
    countMap[id] = { prayed: 0, encouraged: 0 };
  }

  for (const interaction of interactions) {
    const counts = countMap[interaction.request_id];
    if (!counts) continue;
    if (interaction.type === 'prayed') {
      counts.prayed += 1;
    } else if (interaction.type === 'encouraged') {
      counts.encouraged += 1;
    }
  }

  return countMap;
}

/**
 * Merges prayer requests with their pre-computed interaction counts into a
 * PrayerRequestWithCounts array.  Mirrors the mapping at the end of
 * listPrayerRequests().
 */
export function attachCountsToPrayerRequests(
  requests: PrayerRequest[],
  countMap: Record<string, InteractionCounts>
): PrayerRequestWithCounts[] {
  return requests.map((request) => ({
    ...request,
    prayed_count: countMap[request.id]?.prayed ?? 0,
    encouraged_count: countMap[request.id]?.encouraged ?? 0,
  }));
}

/**
 * Validates that prayer request content is non-empty after trimming.
 * Returns null when valid, or an error message string when invalid.
 */
export function validatePrayerContent(content: string): string | null {
  if (content.trim().length === 0) {
    return 'Prayer request cannot be empty';
  }
  return null;
}

/**
 * Sorts PrayerRequestWithCounts by answered status (unanswered first) then by
 * creation date descending (newest first within each group).
 *
 * Returns a new array — the input is not mutated.
 */
export function sortPrayerRequests(requests: PrayerRequestWithCounts[]): PrayerRequestWithCounts[] {
  return [...requests].sort((a, b) => {
    // Unanswered (is_answered=false) sorts before answered (is_answered=true)
    if (a.is_answered !== b.is_answered) {
      return a.is_answered ? 1 : -1;
    }
    // Within the same answered status, newest created_at first
    return b.created_at.localeCompare(a.created_at);
  });
}
