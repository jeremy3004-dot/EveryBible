import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from '../supabase';
import { attachGeoContext, resolveGeoContext } from './geoContext';

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

// Events accumulate here until flushed or the queue reaches AUTO_FLUSH_SIZE.
const eventQueue: QueuedEvent[] = [];

const AUTO_FLUSH_SIZE = 20;
const MAX_QUEUE_SIZE = 500;
// Cap on how many queued events we mirror to disk so a force-kill/crash doesn't
// lose everything. Kept well under MAX_QUEUE_SIZE to bound the MMKV write size.
const MAX_PERSISTED_EVENTS = 200;
const QUEUE_CACHE_KEY = 'analytics-usage-queue-v1';

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
    return parsed.filter(
      (event): event is QueuedEvent =>
        !!event && typeof event === 'object' && typeof event.event_name === 'string'
    );
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

function buildQueuedEvent(
  eventName: string,
  properties: Record<string, unknown>,
  sessionId: string | null
): QueuedEvent {
  return {
    event_name: eventName,
    event_properties: properties,
    session_id: sessionId,
    device_platform: Platform.OS,
    app_version: getAppVersion(),
    queued_at: new Date().toISOString(),
  };
}

function requeueSnapshot(snapshot: QueuedEvent[]): void {
  const spaceLeft = Math.max(0, MAX_QUEUE_SIZE - eventQueue.length);
  if (spaceLeft > 0) {
    eventQueue.unshift(...snapshot.slice(0, spaceLeft));
  }
}

// Enqueues a named event carrying the caller-supplied session id. Triggers an
// automatic background flush when the queue reaches AUTO_FLUSH_SIZE.
export function enqueueUsageEvent(
  eventName: string,
  properties: Record<string, unknown>,
  sessionId: string | null
): void {
  ensureQueueRestored();
  eventQueue.push(buildQueuedEvent(eventName, properties, sessionId));
  persistQueue();

  if (eventQueue.length >= AUTO_FLUSH_SIZE) {
    // Fire-and-forget: flush in the background; caller does not need to await.
    flushUsageQueue().catch(() => {
      // Errors are non-fatal — events stay in the queue for the next flush.
    });
  }
}

// Drains the queue to the unified auth-optional ingestion endpoint. When a user
// session exists we forward its access token so the server attributes user_id;
// otherwise the request is anonymous. Events arriving mid-flush are preserved.
export async function flushUsageQueue(): Promise<UsageFlushResult> {
  ensureQueueRestored();

  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  if (eventQueue.length === 0) {
    return { success: true };
  }

  // Snapshot and drain before the await so that events arriving mid-flush are
  // NOT lost — they remain in the queue for the next call.
  const snapshot = eventQueue.splice(0, eventQueue.length);
  // Mirror the drained queue immediately so a crash mid-flight doesn't resurrect
  // already-sent events; requeue-on-failure below re-persists if delivery fails.
  persistQueue();

  try {
    const geoContext = await resolveGeoContext();
    const enrichedSnapshot = snapshot.map((event) => attachGeoContext(event, geoContext));

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token?.trim();

    const { error } = await supabase.functions.invoke(UNIFIED_USAGE_ENDPOINT, {
      body: { events: enrichedSnapshot },
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });

    if (error) {
      requeueSnapshot(snapshot);
      persistQueue();
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    requeueSnapshot(snapshot);
    persistQueue();
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Exposed for testing / diagnostics only.
export function getPendingUsageEventCount(): number {
  ensureQueueRestored();
  return eventQueue.length;
}
