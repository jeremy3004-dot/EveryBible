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

// Fallback dead-letter guard: even a 5xx/network fault should not requeue the
// SAME batch forever. Once a batch has been retried this many times we drop it
// so a permanently-failing (but non-4xx-reporting) endpoint can't loop the queue
// indefinitely. Tracked out-of-band on the in-flight snapshot, not persisted —
// worst case a cross-launch retry gets a fresh budget, which is acceptable.
const MAX_BATCH_RETRIES = 8;
// How many times the current head-of-queue batch has been requeued after a
// transient failure. The live `eventQueue` array identity never changes (only its
// contents are spliced/unshifted), so a simple counter tracks the retry budget of
// whatever batch currently sits at the head. Reset to 0 on any successful flush.
let headBatchRetries = 0;

// The four fields the server's parseBatchRequest requires on EVERY event
// (track-anonymous-usage-events 400s the whole batch if any event is missing
// one). Restore validation must enforce all four so a cross-version or corrupt
// persisted payload can't poison the queue into a permanent 400 loop.
const REQUIRED_EVENT_FIELDS = [
  'event_name',
  'device_platform',
  'app_version',
  'queued_at',
] as const;

function hasAllRequiredFields(event: unknown): event is QueuedEvent {
  if (!event || typeof event !== 'object') return false;
  const record = event as Record<string, unknown>;
  return REQUIRED_EVENT_FIELDS.every((field) => typeof record[field] === 'string');
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
    return parsed.filter(hasAllRequiredFields);
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

// Classifies a supabase functions.invoke error as permanent (drop the batch) or
// transient (requeue and retry). functions.invoke surfaces non-2xx responses as
// a FunctionsHttpError whose `.context` is the raw Response, so `.context.status`
// carries the HTTP status; network faults arrive as FunctionsFetchError (no
// status) and MUST retry. We treat any 4xx as permanent — the server's
// parseBatchRequest 400s a malformed batch and it will 400 identically on every
// retry, so requeuing only poisons the queue. Anything else (5xx, relay, network,
// or a status we can't read) is treated as transient and retried.
function isPermanentFlushError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const context = (error as { context?: unknown }).context;
  const status =
    context && typeof context === 'object'
      ? (context as { status?: unknown }).status
      : undefined;
  return typeof status === 'number' && status >= 400 && status < 500;
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
  // Retry budget already spent by the batch currently at the head of the queue.
  const retriesSoFar = headBatchRetries;
  // Mirror the drained queue immediately so a crash mid-flight doesn't resurrect
  // already-sent events; requeue-on-failure below re-persists if delivery fails.
  persistQueue();

  // Requeues the batch for a later retry unless it's a permanent client error or
  // has exhausted its retry budget, in which case it is DROPPED (dead-lettered)
  // so a single poison batch can never loop the queue forever.
  const requeueUnlessPoison = (error: unknown): void => {
    if (isPermanentFlushError(error) || retriesSoFar + 1 >= MAX_BATCH_RETRIES) {
      // Drop the batch: don't requeue, don't re-persist it, and clear the retry
      // budget so the next distinct batch starts fresh.
      headBatchRetries = 0;
      return;
    }
    requeueSnapshot(snapshot);
    headBatchRetries = retriesSoFar + 1;
  };

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
      // 4xx = permanent (drop); 5xx/relay = transient (requeue). See
      // isPermanentFlushError.
      requeueUnlessPoison(error);
      persistQueue();
      return { success: false, error: error.message };
    }

    // Successful delivery — the head batch is gone; reset the retry budget.
    headBatchRetries = 0;
    return { success: true };
  } catch (error) {
    // Thrown errors here are network/geo/session faults — transient by nature —
    // so requeue and retry (still bounded by the dead-letter cap).
    requeueUnlessPoison(error);
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
