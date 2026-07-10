import {
  enqueueUsageEvent,
  flushUsageQueue,
  generateUUID,
  getPendingUsageEventCount,
  type QueuedEvent,
} from './usageQueue';

export type AnonymousUsageEventName =
  | 'session_started'
  | 'session_ended'
  | 'chapter_completed'
  | 'audio_playback_progress'
  | 'reading_ended'
  // Rerouted from the authenticated path (P1 S3) so they work signed-out and
  // pick up server-side geo enrichment via the unified endpoint.
  | 'audio_completed'
  | 'text_translation_download_completed'
  | 'audio_download_completed';

// Compat alias — the queued-event shape now lives in the unified queue module.
export type AnonymousUsageEvent = QueuedEvent;

export interface AnonymousUsageServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// This facade owns ONLY the anonymous session_id lifecycle. Enqueue, flush,
// geo, and delivery are handled by the shared unified queue (usageQueue.ts),
// which attaches a token optionally — so this module never touches the auth
// client and stays independent of sign-in state.

let currentAnonymousSessionId: string | null = null;

function ensureAnonymousSession(): string {
  if (!currentAnonymousSessionId) {
    currentAnonymousSessionId = generateUUID();
    enqueueUsageEvent('session_started', { session_kind: 'app' }, currentAnonymousSessionId);
  }

  return currentAnonymousSessionId;
}

export function trackAnonymousUsageEvent(
  eventName: AnonymousUsageEventName,
  properties: Record<string, unknown> = {}
): void {
  const sessionId = ensureAnonymousSession();
  enqueueUsageEvent(eventName, properties, sessionId);
}

export async function flushAnonymousUsageEvents(): Promise<AnonymousUsageServiceResult> {
  return flushUsageQueue();
}

export function startAnonymousUsageSession(): string {
  return ensureAnonymousSession();
}

/**
 * Establishes the anonymous session_id context WITHOUT emitting a
 * session_started event.
 *
 * Use this for authenticated users who have their own session lifecycle event
 * recorded via the authenticated analytics path (analyticsService.startSession).
 * We still need an anonymous session_id so that audio_playback_progress,
 * reading_ended, and chapter_completed — which always flow through
 * trackAnonymousUsageEvent for all users — carry a valid session_id.
 *
 * Contrast with startAnonymousUsageSession(), which both sets the id AND
 * emits session_started. Calling that for authenticated users produces a
 * duplicate session_started row (one anonymous, one with user_id).
 */
export function initAnonymousSessionContext(): string {
  if (!currentAnonymousSessionId) {
    currentAnonymousSessionId = generateUUID();
    // No session_started event — the authenticated analytics path handles that.
  }
  return currentAnonymousSessionId;
}

/**
 * Clears the anonymous session_id context WITHOUT emitting a session_ended
 * event.
 *
 * Paired with initAnonymousSessionContext() for authenticated users: the
 * session_ended event is owned by analyticsService.endSession(), so we only
 * need to reset the module-level session_id so a fresh id is created on the
 * next foreground transition.
 */
export function clearAnonymousSessionContext(): void {
  currentAnonymousSessionId = null;
}

export function endAnonymousUsageSession(): void {
  if (!currentAnonymousSessionId) {
    return;
  }

  enqueueUsageEvent('session_ended', { session_kind: 'app' }, currentAnonymousSessionId);
  currentAnonymousSessionId = null;
}

export function getCurrentAnonymousUsageSessionId(): string | null {
  return currentAnonymousSessionId;
}

export function getPendingAnonymousUsageEventCount(): number {
  return getPendingUsageEventCount();
}
