import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from '../supabase';
import type { AnalyticsEvent, UserEngagementSummary } from '../supabase/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalyticsServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface QueuedEvent {
  event_name: string;
  event_properties: Record<string, unknown>;
  session_id: string | null;
  device_platform: string;
  app_version: string;
  // ISO timestamp captured at queue time so ordering is accurate even before flush
  queued_at: string;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

// Events are accumulated here until flushed or the queue reaches AUTO_FLUSH_SIZE.
const eventQueue: QueuedEvent[] = [];

const AUTO_FLUSH_SIZE = 20;
const MAX_QUEUE_SIZE = 500;

// Session state — null until startSession() is called.
let currentSessionId: string | null = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Uses the Crypto API available in Hermes / React Native's polyfill.
function generateUUID(): string {
  // eslint-disable-next-line no-undef
  if (typeof crypto !== 'undefined' && typeof (crypto as Crypto).randomUUID === 'function') {
    // eslint-disable-next-line no-undef
    return (crypto as Crypto).randomUUID();
  }

  // Fallback: manual v4 UUID construction via Math.random()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Reads the app version from Expo's Constants or falls back to the value in
// app.json so the import stays side-effect-free in tests.
function getAppVersion(): string {
  try {
    const Constants = require('expo-constants').default;
    return (
      Constants?.expoConfig?.version ??
      Constants?.manifest?.version ??
      '1.0.0'
    );
  } catch {
    return '1.0.0';
  }
}

function buildQueuedEvent(
  eventName: string,
  properties: Record<string, unknown> = {}
): QueuedEvent {
  return {
    event_name: eventName,
    event_properties: properties,
    session_id: currentSessionId,
    device_platform: Platform.OS,
    app_version: getAppVersion(),
    queued_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Enqueues a named event with optional metadata properties.
// Triggers an automatic flush if the queue reaches AUTO_FLUSH_SIZE.
export function trackEvent(
  eventName: string,
  properties: Record<string, unknown> = {}
): void {
  eventQueue.push(buildQueuedEvent(eventName, properties));

  if (eventQueue.length >= AUTO_FLUSH_SIZE) {
    // Fire-and-forget: flush in the background; caller does not need to await.
    flushEvents().catch(() => {
      // Errors are non-fatal — events stay in the queue for the next flush.
    });
  }
}

// Drains the local event queue by sending all accumulated events to Supabase
// in a single batch_track_events RPC call.
// Returns early (success) when Supabase is not configured or no events are queued.
export async function flushEvents(): Promise<AnalyticsServiceResult> {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  if (eventQueue.length === 0) {
    return { success: true };
  }

  // Snapshot and drain before the await so that events arriving mid-flush are
  // NOT lost — they remain in the queue for the next call.
  const snapshot = eventQueue.splice(0, eventQueue.length);

  // Resolve the optional current user (analytics accepts anonymous events).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const payload: Array<Omit<AnalyticsEvent, 'id' | 'created_at'>> = snapshot.map((e) => ({
    event_name: e.event_name,
    event_properties: e.event_properties,
    session_id: e.session_id,
    device_platform: e.device_platform,
    app_version: e.app_version,
    user_id: user?.id ?? null,
  }));

  try {
    const { error } = await supabase.rpc('batch_track_events', { events: payload });

    if (error) {
      // Re-queue the snapshot so events are not silently dropped, but cap total size.
      const spaceLeft = Math.max(0, MAX_QUEUE_SIZE - eventQueue.length);
      if (spaceLeft > 0) {
        eventQueue.unshift(...snapshot.slice(0, spaceLeft));
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    // Re-queue on unexpected failure so events survive the error, but cap total size.
    const spaceLeft = Math.max(0, MAX_QUEUE_SIZE - eventQueue.length);
    if (spaceLeft > 0) {
      eventQueue.unshift(...snapshot.slice(0, spaceLeft));
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
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
export function startSession(): void {
  currentSessionId = generateUUID();
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

// Exposed for testing only — returns a read-only snapshot of the current queue.
export function getPendingEventCount(): number {
  return eventQueue.length;
}
