import { supabase, isSupabaseConfigured } from '../supabase';
import type { UserEngagementSummary } from '../supabase/types';
import {
  enqueueUsageEvent,
  flushUsageQueue,
  generateUUID,
  getPendingUsageEventCount,
  type QueuedEvent,
} from './usageQueue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalyticsServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// Re-exported for existing importers; the queued-event shape lives in the
// unified queue module now.
export type { QueuedEvent };

// ---------------------------------------------------------------------------
// Session state — null until startSession() is called.
// ---------------------------------------------------------------------------

let currentSessionId: string | null = null;

// ---------------------------------------------------------------------------
// Public API — thin facade over the unified usage queue (see usageQueue.ts).
// ---------------------------------------------------------------------------

// Enqueues a named event with optional metadata properties, tagged with the
// current authenticated session id. Delivery + auto-flush are handled by the
// shared queue.
export function trackEvent(eventName: string, properties: Record<string, unknown> = {}): void {
  enqueueUsageEvent(eventName, properties, currentSessionId);
}

// Drains the shared event queue to the unified ingestion endpoint.
export async function flushEvents(): Promise<AnalyticsServiceResult> {
  return flushUsageQueue();
}

// Fetches the pre-computed engagement summary row for the current user.
export async function getEngagementSummary(): Promise<
  AnalyticsServiceResult<UserEngagementSummary>
> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'EveryBible backend is not configured for this build yet.' };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { success: false, error: authError.message };
  }

  if (!user) {
    return { success: false, error: 'You must be signed in to view engagement data' };
  }

  try {
    const { data, error } = await supabase
      .from('user_engagement_summary')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: 'No engagement summary found' };
    }

    return { success: true, data: data as UserEngagementSummary };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Triggers the refresh_my_engagement Postgres function which recomputes the
// user_engagement_summary row from raw event data server-side.
export async function refreshEngagement(): Promise<AnalyticsServiceResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'EveryBible backend is not configured for this build yet.' };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { success: false, error: authError.message };
  }

  if (!user) {
    return { success: false, error: 'You must be signed in to refresh engagement data' };
  }

  try {
    const { error } = await supabase.rpc('refresh_my_engagement');

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Generates a fresh session ID and immediately enqueues a session_started event.
// Call this once when the app moves to the foreground or the user opens the app.
export function startSession(sessionId = generateUUID()): void {
  currentSessionId = sessionId;
  trackEvent('session_started');
}

// Enqueues a session_ended event and clears the current session ID.
// Call this when the app moves to the background or the user signs out.
// Flush explicitly after calling endSession() to ensure the event is delivered.
export function endSession(): void {
  if (!currentSessionId) {
    return;
  }

  trackEvent('session_ended');
  currentSessionId = null;
}

// Exposed for testing / diagnostics only.
export function getCurrentSessionId(): string | null {
  return currentSessionId;
}

// Exposed for testing only — returns the current shared queue depth.
export function getPendingEventCount(): number {
  return getPendingUsageEventCount();
}
