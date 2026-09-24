import type { InteractionCounts, PrayerRequestWithCounts } from './prayerService';

export interface ViewerInteractions {
  prayed: boolean;
  encouraged: boolean;
}
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
  countMap: Record<string, InteractionCounts>,
  viewerMap: Record<string, ViewerInteractions> = {}
): PrayerRequestWithCounts[] {
  return requests.map((request) => ({
    ...request,
    prayed_count: countMap[request.id]?.prayed ?? 0,
    encouraged_count: countMap[request.id]?.encouraged ?? 0,
    viewer_prayed: viewerMap[request.id]?.prayed ?? false,
    viewer_encouraged: viewerMap[request.id]?.encouraged ?? false,
  }));
}

/**
 * Which requests the viewer has already prayed for or encouraged. Without this the wall
 * showed every request as untouched after a reload, so a tap looked like a new prayer
 * (the server ignored the duplicate) and the next tap withdrew the real one.
 */
export function viewerInteractionsByRequest(
  viewerId: string,
  interactions: Array<{ request_id: string; type: string; user_id?: string }>
): Record<string, ViewerInteractions> {
  const viewerMap: Record<string, ViewerInteractions> = {};

  for (const interaction of interactions) {
    if (interaction.user_id !== viewerId) continue;
    const entry = (viewerMap[interaction.request_id] ??= { prayed: false, encouraged: false });
    if (interaction.type === 'prayed') entry.prayed = true;
    else if (interaction.type === 'encouraged') entry.encouraged = true;
  }

  return viewerMap;
}

export type PrayerRequestAction = 'edit' | 'markAnswered' | 'delete';

/**
 * The long-press actions a viewer gets on one request. The author manages their own
 * request; the group leader may remove anyone's (RLS: prayer_delete_creator_or_leader),
 * which is the wall's only moderation tool. Edit needs a text prompt, which only iOS has.
 */
export function prayerRequestActions({
  isOwner,
  isLeader,
  isAnswered,
  canEdit,
}: {
  isOwner: boolean;
  isLeader: boolean;
  isAnswered: boolean;
  canEdit: boolean;
}): PrayerRequestAction[] {
  if (isOwner) {
    return [
      ...(canEdit ? (['edit'] as const) : []),
      ...(isAnswered ? [] : (['markAnswered'] as const)),
      'delete',
    ];
  }
  return isLeader ? ['delete'] : [];
}
