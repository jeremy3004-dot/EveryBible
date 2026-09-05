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
  | 'audio_playback_progress'
  | 'reading_ended'
  // Rerouted from the authenticated path (P1 S3) so they work signed-out and
  // pick up server-side geo enrichment via the unified endpoint.
  | 'audio_completed'
  | 'text_translation_download_completed'
  | 'audio_download_completed'
  // Forwarded from bibleExperienceAnalytics (P1 S8) — the product-valuable
  // Bible-experience events that were previously buffered and never sent.
  | 'library_action'
  | 'book_hub_chapter_opened';

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
let sessionStarted = false;

function ensureAnonymousSession(): string {
  if (!currentAnonymousSessionId) {
    currentAnonymousSessionId = generateUUID();
  }
  if (!sessionStarted) {
    enqueueUsageEvent('session_started', { session_kind: 'app' }, currentAnonymousSessionId);
    sessionStarted = true;
  }

  return currentAnonymousSessionId;
}

/**
 * Returns the current anonymous session_id, creating one WITHOUT emitting
 * session_started if none exists.
 *
 * This is the id-provider for event-originated tracking (audio_playback_progress
 * ticks, audio_completed auto-advance, reading_ended). Those events can fire
 * while the app is backgrounded — this app keeps JS running to play audio in the
 * background — AFTER App.tsx has already ended the session on background
 * (endAnonymousUsageSession / clearAnonymousSessionContext null out the id).
 *
 * If such a background event lazily minted-and-emitted a fresh session_started
 * (as ensureAnonymousSession does), it would create an UNPAIRED session_started
 * with no matching session_ended — inflating session counts. Per P1 S4, the
 * single session_started/session_ended pair is owned exclusively by App.tsx's
 * foreground/background orchestration (via startAnonymousUsageSession /
 * analyticsService.startSession). Background-originated events must never
 * originate a session lifecycle event — they only need a valid session_id to
 * carry, so they create the id silently and let the next real foreground start
 * own the session_started.
 */
function ensureAnonymousSessionIdWithoutEmit(): string {
  if (!currentAnonymousSessionId) {
    currentAnonymousSessionId = generateUUID();
    // No session_started event — see doc comment. App.tsx owns the emission.
  }
  return currentAnonymousSessionId;
}

export function trackAnonymousUsageEvent(
  eventName: AnonymousUsageEventName,
  properties: Record<string, unknown> = {}
): void {
  // Event-originated tracking never emits session_started: it can run in the
  // background after the session was ended, and a lazy emission there would
  // produce an unpaired session_started (P1 S4). Get/create the id silently.
  const sessionId = ensureAnonymousSessionIdWithoutEmit();
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
 * We still need an anonymous session_id so that audio_playback_progress and
 * reading_ended — which always flow through trackAnonymousUsageEvent for all
 * users — carry a valid session_id.
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
  sessionStarted = false;
}

export function endAnonymousUsageSession(): void {
  if (!currentAnonymousSessionId) {
    return;
  }

  if (sessionStarted)
    enqueueUsageEvent('session_ended', { session_kind: 'app' }, currentAnonymousSessionId);
  currentAnonymousSessionId = null;
  sessionStarted = false;
}

export function getCurrentAnonymousUsageSessionId(): string | null {
  return currentAnonymousSessionId;
}

export function getPendingAnonymousUsageEventCount(): number {
  return getPendingUsageEventCount();
}
