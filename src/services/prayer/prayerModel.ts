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

export type PrayerInteractionType = 'prayed' | 'encouraged';

interface InteractionState {
  prayed_count: number;
  encouraged_count: number;
  viewer_prayed: boolean;
  viewer_encouraged: boolean;
}

const COUNT_KEY = { prayed: 'prayed_count', encouraged: 'encouraged_count' } as const;
const FLAG_KEY = { prayed: 'viewer_prayed', encouraged: 'viewer_encouraged' } as const;

/**
 * The row once the server has confirmed the viewer's flag for `type` is now `active`. The count
 * moves only when the flag actually changes, so a confirmation that a reload already reflects
 * is not counted twice.
 */
export function applyConfirmedInteraction<T extends InteractionState>(
  row: T,
  type: PrayerInteractionType,
  active: boolean
): T {
  if (row[FLAG_KEY[type]] === active) return row;
  return {
    ...row,
    [FLAG_KEY[type]]: active,
    [COUNT_KEY[type]]: Math.max(0, row[COUNT_KEY[type]] + (active ? 1 : -1)),
  };
}

/**
 * What the wall shows while taps are in flight: each pending target laid over the latest
 * confirmed row. A failed tap just drops its pending entry, so the card falls back to whatever
 * the server last confirmed, including a reload that landed while the tap was in flight.
 */
export function withPendingInteractions<T extends InteractionState>(
  row: T,
  pending: Partial<Record<PrayerInteractionType, boolean>>
): T {
  let shown = row;
  for (const type of ['prayed', 'encouraged'] as const) {
    const target = pending[type];
    if (target !== undefined) shown = applyConfirmedInteraction(shown, type, target);
  }
  return shown;
}

export type PrayerRequestAction = 'edit' | 'markAnswered' | 'report' | 'block' | 'delete';

/**
 * The actions a viewer gets on one request. The author manages their own request. Every
 * other signed-in member can report it or block its author (App Store Guideline 1.2), and
 * the group leader may also remove it (RLS: prayer_delete_creator_or_leader). Edit needs a
 * text prompt, which only iOS has.
 */
export function prayerRequestActions({
  isSignedIn,
  isOwner,
  isLeader,
  isAnswered,
  canEdit,
}: {
  isSignedIn: boolean;
  isOwner: boolean;
  isLeader: boolean;
  isAnswered: boolean;
  canEdit: boolean;
}): PrayerRequestAction[] {
  if (!isSignedIn) return [];
  if (isOwner) {
    return [
      ...(canEdit ? (['edit'] as const) : []),
      ...(isAnswered ? [] : (['markAnswered'] as const)),
      'delete',
    ];
  }
  return ['report', 'block', ...(isLeader ? (['delete'] as const) : [])];
}

/** The reasons report_prayer_request accepts (its CHECK constraint), in display order. */
export const PRAYER_REPORT_REASONS = ['spam', 'abuse', 'sexual', 'harm', 'other'] as const;
export type PrayerReportReason = (typeof PRAYER_REPORT_REASONS)[number];

export type PrayerWriteErrorCode = 'rate_limited' | 'content_rejected' | 'banned';

// Messages raised by the prayer wall triggers and report RPC
// (20260924042617_harden_prayer_wall.sql, 20260924045749_prayer_wall_moderation.sql).
const WRITE_ERROR_CODES: Record<string, PrayerWriteErrorCode> = {
  prayer_request_rate_limited: 'rate_limited',
  prayer_report_rate_limited: 'rate_limited',
  prayer_request_blocked_content: 'content_rejected',
  prayer_wall_banned: 'banned',
};

/** Maps a server refusal to a code the wall explains with its own message. */
export function prayerWriteErrorCode(message: string): PrayerWriteErrorCode | undefined {
  return WRITE_ERROR_CODES[message];
}

/**
 * A request hidden by moderation stays visible to its author only (RLS), so the author is
 * the only viewer who can be shown that it is under review.
 */
export function isUnderReviewForViewer(
  request: { hidden_at?: string | null },
  isOwner: boolean
): boolean {
  return isOwner && Boolean(request.hidden_at);
}
