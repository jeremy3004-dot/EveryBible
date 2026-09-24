// Shared guards for the analytics ingestion edge functions (track-anonymous-usage-events and
// track-analytics-events). Both run with verify_jwt = false and write with the service role,
// so every limit a caller must respect is enforced here, before any write or paid lookup.
//
// Deliberately free of Deno and supabase-js imports so the unit tests can load it directly.

// A real client batch is at most 100 events (usageQueue MAX_BATCH_SIZE) of a few hundred bytes
// each, i.e. well under 100 KB. The largest property bag in production is ~330 bytes.
export const MAX_BODY_BYTES = 512 * 1024;
export const MAX_EVENTS_PER_BATCH = 500;
// ~12x the largest property bag the app has ever sent.
export const MAX_EVENT_PROPERTIES_CHARS = 4096;
// Matches the CHECK constraints on analytics_events text columns (event_name, app_version,
// device_platform, session_id, geo_*). The longest value stored so far is 36 characters.
export const MAX_TEXT_FIELD_CHARS = 128;
// EveryBible is offline-first: a device can sit offline for weeks before its queue drains, so
// replay is accepted for 30 days. Anything older would silently rewrite historical rollups.
export const MAX_QUEUED_AT_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Per-client (hashed IP or user) budget per window. The busiest 10 minutes in production so far
// carried 96 events across ALL clients, so these leave wide headroom for many devices behind
// one carrier-grade NAT while bounding what a single scripted source can write.
export const RATE_WINDOW_SECONDS = 600;
export const MAX_REQUESTS_PER_WINDOW = 300;
export const MAX_EVENTS_PER_WINDOW = 3000;
export const MAX_BYTES_PER_WINDOW = 2 * 1024 * 1024;
// One external geo lookup per client key per TTL, and a global ceiling on paid lookups per
// window so rotating source addresses cannot multiply ipinfo spend either.
export const GEO_CACHE_TTL_SECONDS = 12 * 60 * 60;
export const MAX_GEO_LOOKUPS_PER_WINDOW = 100;

export type BodyReadResult =
  | { ok: true; text: string; bytes: number }
  | { ok: false; reason: 'too_large' };

export async function readBodyWithinLimit(
  request: Request,
  maxBytes: number = MAX_BODY_BYTES
): Promise<BodyReadResult> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: 'too_large' };
  if (!request.body) return { ok: true, text: '', bytes: 0 };

  // Content-Length is optional (chunked uploads), so count while streaming and stop reading
  // the moment the cap is passed instead of buffering an arbitrarily large body.
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, reason: 'too_large' };
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(joined), bytes };
}

export function eventPropertiesWithinLimit(properties: Record<string, unknown>): boolean {
  try {
    return JSON.stringify(properties).length <= MAX_EVENT_PROPERTIES_CHARS;
  } catch {
    // Unserializable (circular / BigInt) property bags are rejected the same way.
    return false;
  }
}

export function textFieldsWithinLimit(values: unknown[]): boolean {
  return values.every((value) => typeof value !== 'string' || value.length <= MAX_TEXT_FIELD_CHARS);
}

/** ISO timestamp to store as created_at, or why the event must not be stored. */
export function resolveQueuedAt(
  queuedAt: unknown,
  now: number = Date.now()
): string | 'too_old' | 'invalid' {
  if (typeof queuedAt !== 'string') return 'invalid';
  const parsed = Date.parse(queuedAt);
  if (!Number.isFinite(parsed)) return 'invalid';
  if (parsed < now - MAX_QUEUED_AT_AGE_MS) return 'too_old';
  return new Date(Math.min(parsed, now)).toISOString();
}

/**
 * The caller's address as stamped by the edge, or null when the edge supplied none.
 *
 * Same trust rule as _shared/passcodeAttempts.ts: cf-connecting-ip and x-real-ip are stamped
 * by the edge, but a client-sent x-forwarded-for reaches the function verbatim. Trusting it
 * would let a flood mint a new throttle key per request, and let a caller choose which address
 * the (paid) geo lookup resolves. It is never used.
 */
export function getTrustedClientIp(request: Request): string | null {
  return (
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    null
  );
}

export function getClientIp(request: Request): string {
  return getTrustedClientIp(request) ?? 'unknown';
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Throttle key for a request's source address. Salted with a server secret so the stored key
 * cannot be reversed by hashing the IPv4 space.
 */
export function hashIngestClientKey(request: Request, salt: string): Promise<string> {
  return sha256Hex(`analytics-ingest:${salt}:${getClientIp(request)}`);
}

/** Throttle key for a verified user (track-analytics-events). */
export function hashIngestUserKey(userId: string, salt: string): Promise<string> {
  return sha256Hex(`analytics-ingest-user:${salt}:${userId}`);
}

export interface IngestBudget {
  allowed: boolean;
  retryAfterSeconds: number;
  /** Geo previously resolved for this client key, still within its TTL. */
  cachedGeo: Record<string, unknown> | null;
  /** True only for the one request that claimed this key's external lookup. */
  mayLookupGeo: boolean;
  /** The limiter could not be consulted; ingestion proceeds without paid lookups. */
  degraded: boolean;
}

// Structural client type so this module does not import supabase-js.
export interface IngestServiceClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: unknown }>;
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => PromiseLike<{ error: unknown }>;
    };
  };
}

export async function consumeIngestBudget(
  service: IngestServiceClient,
  clientKey: string,
  usage: { events: number; bytes: number }
): Promise<IngestBudget> {
  const degraded: IngestBudget = {
    allowed: true,
    retryAfterSeconds: 0,
    cachedGeo: null,
    mayLookupGeo: false,
    degraded: true,
  };
  try {
    const { data, error } = await service.rpc('consume_analytics_ingest_budget', {
      p_client_key: clientKey,
      p_event_count: usage.events,
      p_byte_count: usage.bytes,
      p_window_seconds: RATE_WINDOW_SECONDS,
      p_max_requests: MAX_REQUESTS_PER_WINDOW,
      p_max_events: MAX_EVENTS_PER_WINDOW,
      p_max_bytes: MAX_BYTES_PER_WINDOW,
      p_geo_ttl_seconds: GEO_CACHE_TTL_SECONDS,
      p_max_geo_lookups: MAX_GEO_LOOKUPS_PER_WINDOW,
    });
    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          allowed?: unknown;
          retry_after_seconds?: unknown;
          cached_geo?: unknown;
          claim_geo_lookup?: unknown;
        }
      | null
      | undefined;
    // Fail open for writes (analytics is best-effort and the body/batch caps still apply) but
    // closed for the paid lookup, so a limiter outage cannot turn into an ipinfo bill.
    if (error || !row || typeof row.allowed !== 'boolean') {
      console.warn('analytics ingest limiter unavailable; skipping paid geo lookups');
      return degraded;
    }
    const cachedGeo =
      row.cached_geo && typeof row.cached_geo === 'object' && !Array.isArray(row.cached_geo)
        ? (row.cached_geo as Record<string, unknown>)
        : null;
    return {
      allowed: row.allowed,
      retryAfterSeconds: row.allowed ? 0 : Math.max(1, Number(row.retry_after_seconds) || 1),
      cachedGeo,
      mayLookupGeo: row.allowed && cachedGeo == null && row.claim_geo_lookup === true,
      degraded: false,
    };
  } catch {
    console.warn('analytics ingest limiter unavailable; skipping paid geo lookups');
    return degraded;
  }
}

export async function rememberIngestGeo(
  service: IngestServiceClient,
  clientKey: string,
  geo: Record<string, unknown>
): Promise<void> {
  try {
    await service
      .from('analytics_ingest_throttle')
      .update({ geo, geo_cached_at: new Date().toISOString() })
      .eq('client_key', clientKey);
  } catch {
    // Best effort: a missed cache write only costs one more lookup after the claim expires.
  }
}
