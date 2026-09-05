import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from '../supabase';
import { attachGeoContext, getCachedGeoContext, resolveGeoContext } from './geoContext';

// ---------------------------------------------------------------------------
// Unified analytics ingestion queue (P1 S2b)
//
// This is the SINGLE queue + flush path for ALL analytics events — both the
// authenticated (analyticsService) and anonymous (anonymousUsageAnalytics)
// facades enqueue here and flush here. Every event is delivered to ONE endpoint,
// `track-anonymous-usage-events`, which is auth-OPTIONAL: when a user is signed
// in we attach their access token (server attributes user_id); when signed out
// no token is attached (server stores user_id null). There is deliberately NO
// batch_track_events RPC fallback — that path bypassed server-side geo
// enrichment and split traffic across two contracts.
// ---------------------------------------------------------------------------

export interface QueuedEvent {
  event_id: string;
  attribution_user_id?: string | null;
  event_name: string;
  event_properties: Record<string, unknown>;
  geo_accuracy_km?: number | null;
  geo_country_code?: string | null;
  geo_latitude?: number | null;
  geo_longitude?: number | null;
  geo_source?: string | null;
  geo_timezone?: string | null;
  geo_city?: string | null;
  geo_region_code?: string | null;
  geo_region_name?: string | null;
  session_id: string | null;
  device_platform: string;
  app_version: string;
  // ISO timestamp captured at queue time so ordering is accurate even before flush
  queued_at: string;
}

export interface UsageFlushResult {
  success: boolean;
  error?: string;
}

// The single unified ingestion endpoint. All analytics events flow here.
export const UNIFIED_USAGE_ENDPOINT = 'track-anonymous-usage-events';

// Retain unacknowledged events on disk, including the in-flight batch. Stable
// event IDs let the collector ignore retries after an ambiguous response/crash.
const eventQueue: QueuedEvent[] = [];
const AUTO_FLUSH_SIZE = 20;
const MAX_QUEUE_SIZE = 500;
const MAX_PERSISTED_EVENTS = MAX_QUEUE_SIZE;
const MAX_BATCH_SIZE = 100;
const QUEUE_CACHE_KEY = 'analytics-usage-queue-v1';
const FLUSH_INTERVAL_MS = 30_000;
let retryDelayMs = FLUSH_INTERVAL_MS;
let flushPromise: Promise<UsageFlushResult> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const REQUIRED_EVENT_FIELDS = [
  'event_name',
  'device_platform',
  'app_version',
  'queued_at',
] as const;
function hasAllRequiredFields(event: unknown): event is QueuedEvent {
  if (!event || typeof event !== 'object') return false;
  const record = event as Record<string, unknown>;
  return (
    REQUIRED_EVENT_FIELDS.every(
      (field) => typeof record[field] === 'string' && record[field].trim().length > 0
    ) && Number.isFinite(Date.parse(record.queued_at as string))
  );
}

function scheduleFlush(delay = FLUSH_INTERVAL_MS): void {
  if (flushTimer || eventQueue.length === 0 || !isSupabaseConfigured()) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushUsageQueue();
  }, delay);
}

// Write-through persistence via a guarded require() so this module's static
// import graph stays intact and the require is a no-op where the native MMKV
// module is unavailable (e.g. node unit tests). This makes the queue durable
// across force-kill/crash; on next launch load-on-init restores it.
function loadPersistedQueue(): QueuedEvent[] {
  try {
    const { mmkvInstance } = require('../../stores/mmkvStorage');
    const raw = mmkvInstance.getString(QUEUE_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Require ALL fields the server requires (not just event_name). A payload
    // written under a different app schema version — or a corrupt MMKV blob —
    // missing any required field would otherwise be restored and 400 the whole
    // batch forever; drop such entries on restore instead of keeping them.
    return parsed
      .filter(hasAllRequiredFields)
      .slice(0, MAX_QUEUE_SIZE)
      .map((event) => ({
        ...event,
        attribution_user_id: event.attribution_user_id ?? null,
        event_id:
          typeof event.event_id === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            event.event_id
          )
            ? event.event_id
            : generateUUID(),
      }));
  } catch {
    return [];
  }
}

function persistQueue(): void {
  try {
    const { mmkvInstance } = require('../../stores/mmkvStorage');
    if (eventQueue.length === 0) {
      mmkvInstance.delete(QUEUE_CACHE_KEY);
      return;
    }
    mmkvInstance.set(QUEUE_CACHE_KEY, JSON.stringify(eventQueue.slice(0, MAX_PERSISTED_EVENTS)));
  } catch {
    // Best-effort — persistence is a crash-safety net, never required for delivery.
  }
}

// Restore persisted events on FIRST use, not at module eval — a static importer
// (e.g. useAudioPlayer) would otherwise pay the MMKV read + JSON.parse at cold
// start, which the startup hot-path rules forbid.
let queueRestored = false;
function ensureQueueRestored(): void {
  if (queueRestored) return;
  queueRestored = true;
  eventQueue.push(...loadPersistedQueue());
}

// Uses the Crypto API available in Hermes / React Native's polyfill.
export function generateUUID(): string {
  const webCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
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
    return Constants?.expoConfig?.version ?? Constants?.manifest?.version ?? '1.0.1';
  } catch {
    return '1.0.1';
  }
}

function collectionUserId(): string | null {
  // Capture identity with the event, not later when a shared device flushes.
  // Lazy access keeps auth/native storage out of module initialization.
  try {
    const { useAuthStore } = require('../../stores/authStore');
    return useAuthStore.getState().user?.id ?? null;
  } catch {
    return null;
  }
}

function buildQueuedEvent(
  eventName: string,
  properties: Record<string, unknown>,
  sessionId: string | null
): QueuedEvent {
  return attachGeoContext<QueuedEvent>(
    {
      event_id: generateUUID(),
      attribution_user_id: collectionUserId(),
      event_name: eventName,
      event_properties: { ...properties, analytics_schema_version: 2 },
      session_id: sessionId,
      device_platform: Platform.OS,
      app_version: getAppVersion(),
      queued_at: new Date().toISOString(),
    },
    getCachedGeoContext()
  );
}

// Only a malformed payload is permanent. Auth expiry, throttling, timeouts,
// relay faults, and unavailable collectors must keep their retryable events.
function isPermanentFlushError(error: unknown): boolean {
  const status = (error as { context?: { status?: number } } | null)?.context?.status;
  return status === 400 || status === 422;
}

export function enqueueUsageEvent(
  eventName: string,
  properties: Record<string, unknown>,
  sessionId: string | null
): void {
  ensureQueueRestored();
  // Keep the oldest pending work (including in-flight events) safe. A bounded
  // queue is essential for months offline; never silently evict an active batch.
  if (eventQueue.length >= MAX_QUEUE_SIZE) {
    scheduleFlush(retryDelayMs);
    return;
  }
  eventQueue.push(buildQueuedEvent(eventName, properties, sessionId));
  persistQueue();
  if (eventQueue.length >= AUTO_FLUSH_SIZE && retryDelayMs === FLUSH_INTERVAL_MS) {
    void flushUsageQueue();
  } else {
    scheduleFlush(retryDelayMs);
  }
}

export async function flushUsageQueue(): Promise<UsageFlushResult> {
  ensureQueueRestored();
  if (flushPromise) return flushPromise;
  if (!isSupabaseConfigured() || eventQueue.length === 0) return { success: true };
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  const snapshot = eventQueue.slice(0, MAX_BATCH_SIZE);
  // Persist IDs assigned to restored legacy events before attempting delivery.
  persistQueue();
  flushPromise = (async (): Promise<UsageFlushResult> => {
    try {
      const geoContext = await resolveGeoContext();
      // Event-time geo wins over the current upload network for delayed events.
      const enrichedSnapshot = snapshot.map((event) =>
        event.geo_source ? event : attachGeoContext(event, geoContext)
      );
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token?.trim();
      const { error } = await supabase.functions.invoke(UNIFIED_USAGE_ENDPOINT, {
        body: { events: enrichedSnapshot },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (error) throw error;
      eventQueue.splice(0, snapshot.length);
      retryDelayMs = FLUSH_INTERVAL_MS;
      persistQueue();
      return { success: true };
    } catch (error) {
      if (isPermanentFlushError(error)) eventQueue.splice(0, snapshot.length);
      retryDelayMs = Math.min(retryDelayMs * 2, 5 * 60_000);
      persistQueue();
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String((error as { message?: unknown })?.message ?? 'Analytics delivery failed'),
      };
    } finally {
      flushPromise = null;
      scheduleFlush(retryDelayMs);
    }
  })();
  return flushPromise;
}

export function getPendingUsageEventCount(): number {
  ensureQueueRestored();
  return eventQueue.length;
}
