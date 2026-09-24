import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  consumeIngestBudget,
  eventPropertiesWithinLimit,
  getClientIp,
  hashIngestClientKey,
  type IngestBudget,
  MAX_EVENTS_PER_BATCH,
  readBodyWithinLimit,
  rememberIngestGeo,
  resolveQueuedAt,
  textFieldsWithinLimit,
} from '../_shared/analyticsIngest.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'retry-after',
};

interface AnonymousUsageEvent {
  event_id?: string;
  attribution_user_id?: string | null;
  app_version: string;
  device_platform: string;
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
  queued_at: string;
  session_id: string | null;
}

interface AnonymousUsageRequestBody {
  events: AnonymousUsageEvent[];
  /** S5: how many events in this batch were dropped for being oversized or too old. */
  rejected: number;
}

interface GeoResult {
  accuracyKm: number | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string | null;
  timezone: string | null;
  city: string | null;
  region: string | null;
  regionCode: string | null;
}

// ---------------------------------------------------------------------------
// Geo resolution — three-tier, no mandatory credentials
//
// Tier 1: CF-IPCountry header — always present on Cloudflare-proxied requests,
//   no API call, no rate limit.  Country code only.
//
// Tier 2 (approximate): ipapi.co — optional fallback, no token.
//   Returns country code + lat/lng + timezone.
//
// Tier 3 (approximate, paid):  ipinfo.io — unlimited with IPINFO_TOKEN secret.
//   Used instead of Tier 2 when IPINFO_TOKEN is configured so the paid tier
//   is preferred over the free tier once the key is in place.
//
// Why no profile-country fallback?
//   Profile country = where the user signed up, not where they are now.
//   Using it as a fallback previously caused every listening/reading event to
//   appear in the user's home country when they were abroad, making the heat
//   map actively wrong.
// ---------------------------------------------------------------------------

function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const c = value.trim().toUpperCase();
  if (c === 'XX' || c === 'T1' || !/^[A-Z]{2}$/.test(c)) return null;
  return c;
}

function normalizeCoordinate(value: unknown, limit: number): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? Math.round(parsed * 10) / 10 : null;
}

function normalizeAccuracyKm(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function lookupViaIpinfo(ip: string, token: string): Promise<GeoResult | null> {
  try {
    const url = new URL(`https://ipinfo.io/${encodeURIComponent(ip)}/json`);
    url.searchParams.set('token', token);
    const resp = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(2000) });
    if (!resp.ok) return null;
    const p = (await resp.json().catch(() => null)) as
      | { country?: unknown; loc?: unknown; timezone?: unknown; city?: unknown; region?: unknown }
      | null;
    if (!p) return null;
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (typeof p.loc === 'string') {
      const parts = p.loc.split(',');
      const lat = parseFloat(parts[0] ?? '');
      const lng = parseFloat(parts[1] ?? '');
      if (Number.isFinite(lat) && Number.isFinite(lng)) { latitude = lat; longitude = lng; }
    }
    return {
      accuracyKm: null,
      countryCode: normalizeCountryCode(p.country),
      latitude, longitude,
      source: 'ipinfo',
      timezone: getText(p.timezone),
      city: getText(p.city),
      region: getText(p.region),
      regionCode: null,
    };
  } catch { return null; }
}

async function lookupViaIpapi(ip: string): Promise<GeoResult | null> {
  // Approximate IP fallback. Raw IPs are used for lookup and never stored in events.
  try {
    const resp = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { Accept: 'application/json', 'User-Agent': 'EveryBible/analytics' },
      signal: AbortSignal.timeout(2000),
    });
    if (!resp.ok) return null;
    const p = (await resp.json().catch(() => null)) as
      | {
          country_code?: unknown;
          latitude?: unknown;
          longitude?: unknown;
          timezone?: unknown;
          city?: unknown;
          region?: unknown;
          region_code?: unknown;
          error?: unknown;
        }
      | null;
    if (!p || p.error) return null;
    const lat = typeof p.latitude === 'number' ? p.latitude : null;
    const lng = typeof p.longitude === 'number' ? p.longitude : null;
    return {
      accuracyKm: null,
      countryCode: normalizeCountryCode(p.country_code),
      latitude: lat, longitude: lng,
      source: 'ipapi',
      timezone: getText(p.timezone),
      city: getText(p.city),
      region: getText(p.region),
      regionCode: getText(p.region_code)?.toUpperCase() ?? null,
    };
  } catch { return null; }
}

function resolveEventGeo(event: AnonymousUsageEvent): GeoResult | null {
  // Accept only approximate IP-derived payloads, never device/GPS fixes.
  if (event.geo_source !== 'cf-worker') return null;
  const countryCode = normalizeCountryCode(event.geo_country_code);
  const latitude = normalizeCoordinate(event.geo_latitude, 90);
  const longitude = normalizeCoordinate(event.geo_longitude, 180);
  const source = getText(event.geo_source);
  const timezone = getText(event.geo_timezone);
  const accuracyKm = normalizeAccuracyKm(event.geo_accuracy_km);
  const city = getText(event.geo_city);
  const region = getText(event.geo_region_name);
  const regionCode = getText(event.geo_region_code)?.toUpperCase() ?? null;

  if (
    countryCode == null &&
    latitude == null &&
    longitude == null &&
    source == null &&
    timezone == null &&
    accuracyKm == null &&
    city == null &&
    region == null &&
    regionCode == null
  ) {
    return null;
  }

  return {
    accuracyKm,
    countryCode,
    latitude,
    longitude,
    source,
    timezone,
    city,
    region,
    regionCode,
  };
}

function geoFromCache(cached: Record<string, unknown>): GeoResult {
  const text = (value: unknown) => getText(value);
  return {
    accuracyKm: null,
    countryCode: normalizeCountryCode(cached.countryCode),
    latitude: normalizeCoordinate(cached.latitude, 90),
    longitude: normalizeCoordinate(cached.longitude, 180),
    source: text(cached.source),
    timezone: text(cached.timezone),
    city: text(cached.city),
    region: text(cached.region),
    regionCode: text(cached.regionCode),
  };
}

// M1: the external lookup is the one per-request cost a credential-free caller could multiply
// (ipinfo is paid). The budget RPC returns this client's cached result, or grants exactly one
// request per client key the right to look it up; everyone else gets the free CF country.
async function resolveRequestGeo(
  req: Request,
  budget: IngestBudget,
  remember: (geo: GeoResult) => Promise<void>
): Promise<GeoResult> {
  const cfCountry = normalizeCountryCode(req.headers.get('cf-ipcountry'));
  if (budget.cachedGeo) {
    const cached = geoFromCache(budget.cachedGeo);
    return { ...cached, countryCode: cached.countryCode ?? cfCountry };
  }
  const resolved = budget.mayLookupGeo ? await lookupRequestGeo(req, cfCountry) : null;
  if (resolved) {
    await remember(resolved);
    return resolved;
  }
  return {
    accuracyKm: null,
    countryCode: cfCountry,
    latitude: null,
    longitude: null,
    source: cfCountry ? 'cf_ipcountry' : null,
    timezone: null,
    city: null,
    region: null,
    regionCode: null,
  };
}

async function lookupRequestGeo(req: Request, cfCountry: string | null): Promise<GeoResult | null> {
  // Only edge-stamped addresses (cf-connecting-ip, x-real-ip) are trusted; a caller-sent
  // x-forwarded-for would let the caller pick which address is geolocated.
  const clientIp = getClientIp(req);
  if (clientIp !== 'unknown') {
    const ipinfoToken = Deno.env.get('IPINFO_TOKEN')?.trim();
    if (ipinfoToken) {
      const result = await lookupViaIpinfo(clientIp, ipinfoToken);
      if (result) return { ...result, countryCode: result.countryCode ?? cfCountry };
    }

    const result = await lookupViaIpapi(clientIp);
    if (result) return { ...result, countryCode: result.countryCode ?? cfCountry };
  }
  return null;
}

function mergeGeo(requestGeo: GeoResult, payloadGeo: GeoResult | null): GeoResult {
  // Never combine one provider's country with another provider's coordinates.
  // A country-only event-time fix remains country-only if the upload moved.
  const geo = payloadGeo?.countryCode ? payloadGeo : requestGeo;
  const latitude = normalizeCoordinate(geo.latitude, 90);
  const longitude = normalizeCoordinate(geo.longitude, 180);
  return { ...geo, latitude: longitude == null ? null : latitude,
    longitude: latitude == null ? null : longitude };
}

function getText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ---------------------------------------------------------------------------
// Optional auth attribution
//
// This endpoint is the UNIFIED analytics ingestion path: it accepts events from
// both signed-out and signed-in clients. supabase-js `functions.invoke` always
// attaches an Authorization header — the anon apikey when signed out, or the
// user's access token when signed in. We attribute user_id ONLY when a genuine
// user token is present; anything else (anon key, service key, malformed, or
// absent token) resolves to null. We NEVER reject a request on a bad/absent
// token, so app builds <=1.0.4 (which send anon-only traffic here) keep working.
// ---------------------------------------------------------------------------

function getAccessToken(req: Request): string | null {
  const authorization = req.headers.get('authorization');
  if (!authorization) return null;
  return authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : authorization.trim() || null;
}

// Cheap, unverified peek at the JWT payload so we skip the getUser() round-trip
// for the anon/service keys (which have no user subject). getUser() below still
// cryptographically verifies before we trust the id.
function looksLikeUserToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { role?: unknown; sub?: unknown };
    return payload.role === 'authenticated' && typeof payload.sub === 'string' && payload.sub.length > 0;
  } catch {
    return false;
  }
}

// Structural type: just the getUser surface we use, so this helper stays
// decoupled from the exact supabase-js generic parameterization.
type AuthCapableClient = {
  auth: {
    getUser: (jwt: string) => Promise<{
      data: { user: { id: string } | null };
      error: { message?: string } | null;
    }>;
  };
};

async function resolveUserId(
  req: Request,
  supabase: AuthCapableClient
): Promise<string | null> {
  const token = getAccessToken(req);
  if (!token || !looksLikeUserToken(token)) return null;
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}

// S5/M1 limits (4 KB properties, 128-char text fields, 30-day queued_at floor clamped to now,
// 500-event batches, 512 KB bodies) live in _shared/analyticsIngest.ts so the authenticated
// track-analytics-events endpoint enforces exactly the same contract.

function parseBatchRequest(body: unknown): AnonymousUsageRequestBody | null {
  if (!body || typeof body !== 'object') return null;
  const events = (body as { events?: unknown }).events;
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX_EVENTS_PER_BATCH) return null;

  const normalizedEvents: AnonymousUsageEvent[] = [];
  // S5: oversized / too-old events are DROPPED individually rather than failing the batch.
  // Failing the batch would punish a device for one bad event by making it retry the whole
  // queue forever; dropping keeps the good events and reports the count back to the client.
  let rejected = 0;
  for (const event of events) {
    if (!event || typeof event !== 'object') return null;
    const raw = event as Partial<AnonymousUsageEvent>;
    const eventName = getText(raw.event_name);
    const devicePlatform = getText(raw.device_platform);
    const appVersion = getText(raw.app_version);
    const queuedAt = getText(raw.queued_at);
    if (!eventName || !devicePlatform || !appVersion || !queuedAt || !Number.isFinite(Date.parse(queuedAt))) return null;
    const eventId = getText(raw.event_id);
    if (eventId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) return null;
    const createdAt = resolveQueuedAt(queuedAt);
    if (createdAt === 'invalid') return null;
    // Oversized strings would otherwise fail the analytics_events CHECK constraints and turn
    // the whole batch into a retried 500.
    if (
      createdAt === 'too_old' ||
      !textFieldsWithinLimit([
        raw.event_name, raw.device_platform, raw.app_version, raw.session_id, raw.attribution_user_id,
        raw.geo_source, raw.geo_timezone, raw.geo_city, raw.geo_region_code, raw.geo_region_name,
      ])
    ) {
      rejected += 1;
      continue;
    }
    const eventProperties =
      raw.event_properties && typeof raw.event_properties === 'object' && !Array.isArray(raw.event_properties)
        ? (raw.event_properties as Record<string, unknown>)
        : {};
    if (!eventPropertiesWithinLimit(eventProperties)) {
      rejected += 1;
      continue;
    }
    normalizedEvents.push({
      event_id: eventId ?? undefined,
      attribution_user_id: raw.attribution_user_id === undefined ? undefined : getText(raw.attribution_user_id),
      app_version: appVersion,
      device_platform: devicePlatform,
      event_name: eventName as AnonymousUsageEvent['event_name'],
      event_properties: eventProperties,
      geo_accuracy_km:
        raw.geo_accuracy_km == null ? null : normalizeAccuracyKm(raw.geo_accuracy_km),
      geo_country_code:
        raw.geo_country_code == null ? null : normalizeCountryCode(raw.geo_country_code),
      geo_latitude: raw.geo_latitude == null ? null : normalizeCoordinate(raw.geo_latitude, 90),
      geo_longitude: raw.geo_longitude == null ? null : normalizeCoordinate(raw.geo_longitude, 180),
      geo_source: raw.geo_source == null ? null : getText(raw.geo_source),
      geo_timezone: raw.geo_timezone == null ? null : getText(raw.geo_timezone),
      geo_city: raw.geo_city == null ? null : getText(raw.geo_city),
      geo_region_code: raw.geo_region_code == null ? null : getText(raw.geo_region_code),
      geo_region_name: raw.geo_region_name == null ? null : getText(raw.geo_region_name),
      queued_at: createdAt,
      session_id: raw.session_id === null || getText(raw.session_id) === null ? null : getText(raw.session_id),
    });
  }
  return { events: normalizedEvents, rejected };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    status,
  });
}

// This collector accepts unauthenticated traffic, so database and configuration details go to
// the function log, never into the response (audit 2026-09-24 L7).
function internalErrorResponse(context: string, detail: unknown): Response {
  console.error(`[track-anonymous-usage-events] ${context}`, detail);
  return jsonResponse({ error: 'Unable to record usage events right now.' }, 500);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method === 'GET' || request.method === 'HEAD') {
    return jsonResponse({ ok: true, service: 'track-anonymous-usage-events' });
  }
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!supabaseUrl || !serviceRoleKey) {
      return internalErrorResponse('missing configuration', 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set');
    }

    // M1: cap the body while streaming it, before JSON parsing or any database work.
    const body = await readBodyWithinLimit(request);
    if (!body.ok) return jsonResponse({ error: 'Request body is too large' }, 413);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(body.text);
    } catch {
      parsed = null;
    }
    const batch = parseBatchRequest(parsed);
    if (!batch) return jsonResponse({ error: 'Request body must include analytics events' }, 400);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // M1: per-source budget (salted IP hash; this endpoint has no required credential). An
    // over-budget request is refused before any write or geo lookup; the app keeps the batch
    // queued and retries with backoff.
    const clientKey = await hashIngestClientKey(request, serviceRoleKey);
    const budget = await consumeIngestBudget(supabase, clientKey, {
      events: batch.events.length,
      bytes: body.bytes,
    });
    if (!budget.allowed) {
      return new Response(JSON.stringify({ error: 'Too many analytics requests; retry later' }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json; charset=utf-8',
          'Retry-After': String(budget.retryAfterSeconds),
        },
        status: 429,
      });
    }

    // S5: the whole batch may have been dropped by the per-event caps. Nothing to write, and
    // no reason to spend a geo lookup — acknowledge so the client clears its queue instead of
    // retrying the same rejected events forever.
    if (batch.events.length === 0) {
      return jsonResponse({ inserted: 0, rejected: batch.rejected, ok: true, attributed: false, geo: null, geo_source: null });
    }

    const needsRequestGeo = batch.events.some(event => !resolveEventGeo(event)?.countryCode);
    const requestGeo: GeoResult = needsRequestGeo
      ? await resolveRequestGeo(request, budget, (geo) =>
          rememberIngestGeo(supabase, clientKey, { ...geo }))
      : {
      accuracyKm: null, countryCode: null, latitude: null, longitude: null,
      source: null, timezone: null, city: null, region: null, regionCode: null,
    };
    // Auth-optional: attribute user_id when a genuine user token is present.
    const userId = await resolveUserId(request, supabase);

    const rows = batch.events.map((event) => {
      const geo = mergeGeo(requestGeo, resolveEventGeo(event));

      return {
        id: event.event_id ?? crypto.randomUUID(),
        user_id: event.attribution_user_id === undefined || event.attribution_user_id === userId ? userId : null,
        event_name: event.event_name,
        event_properties: event.event_properties,
        session_id: event.session_id,
        device_platform: event.device_platform,
        app_version: event.app_version,
        created_at: event.queued_at,
        received_at: new Date().toISOString(),
        geo_accuracy_km: null, // IP providers here supply no measured accuracy radius.
        geo_city: geo.city,
        geo_country_code: geo.countryCode,
        geo_latitude: geo.latitude,
        geo_longitude: geo.longitude,
        geo_region_code: geo.regionCode,
        geo_region_name: geo.region,
        geo_source: geo.source,
        geo_timezone: geo.timezone,
      };
    });

    const { error } = await supabase.from('analytics_events').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    if (error) return internalErrorResponse('analytics_events write failed', error);

    return jsonResponse({
      inserted: rows.length,
      rejected: batch.rejected,
      ok: true,
      attributed: userId != null,
      geo: requestGeo.countryCode,
      geo_source: requestGeo.source,
    });
  } catch (error) {
    return internalErrorResponse('unhandled error', error);
  }
});
