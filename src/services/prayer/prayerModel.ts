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
