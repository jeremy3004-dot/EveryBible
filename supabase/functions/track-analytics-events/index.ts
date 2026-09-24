import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  consumeIngestBudget,
  eventPropertiesWithinLimit,
  getClientIp,
  hashIngestUserKey,
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

interface QueuedAnalyticsEvent {
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

interface TrackAnalyticsRequestBody {
  events?: unknown;
}

function getAccessToken(req: Request): string | null {
  const authorization = req.headers.get('authorization');
  if (!authorization) return null;
  return authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : authorization.trim() || null;
}

function getText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
// Tier 3 (approximate): ipinfo.io — used when IPINFO_TOKEN is configured.
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
  // CF returns 'XX' for unknown IPs, 'T1' for Tor — treat both as unresolved.
  if (c === 'XX' || c === 'T1' || c.length === 0) return null;
  return c;
}

function normalizeCoordinate(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
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
    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2000),
    });
    if (!resp.ok) return null;
    const p = (await resp.json().catch(() => null)) as {
      country?: unknown;
      loc?: unknown;
      timezone?: unknown;
      city?: unknown;
      region?: unknown;
    } | null;
    if (!p) return null;
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (typeof p.loc === 'string') {
      const parts = p.loc.split(',');
      const lat = parseFloat(parts[0] ?? '');
      const lng = parseFloat(parts[1] ?? '');
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        latitude = lat;
        longitude = lng;
      }
    }
    return {
      accuracyKm: null,
      countryCode: normalizeCountryCode(p.country),
      latitude,
      longitude,
      source: 'ipinfo',
      timezone: getText(p.timezone),
      city: getText(p.city),
      region: getText(p.region),
      regionCode: null,
    };
  } catch {
    return null;
  }
}

async function lookupViaIpapi(ip: string): Promise<GeoResult | null> {
  // ipapi.co — free, no token, 30 k req/day.
  try {
    const resp = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { Accept: 'application/json', 'User-Agent': 'EveryBible/analytics' },
      signal: AbortSignal.timeout(2000),
    });
    if (!resp.ok) return null;
    const p = (await resp.json().catch(() => null)) as {
      country_code?: unknown;
      latitude?: unknown;
      longitude?: unknown;
      timezone?: unknown;
      city?: unknown;
      region?: unknown;
      region_code?: unknown;
      error?: unknown;
    } | null;
    if (!p || p.error) return null;
    const lat = typeof p.latitude === 'number' ? p.latitude : null;
    const lng = typeof p.longitude === 'number' ? p.longitude : null;
    return {
      accuracyKm: null,
      countryCode: normalizeCountryCode(p.country_code),
      latitude: lat,
      longitude: lng,
      source: 'ipapi',
      timezone: getText(p.timezone),
      city: getText(p.city),
      region: getText(p.region),
      regionCode: getText(p.region_code)?.toUpperCase() ?? null,
    };
  } catch {
    return null;
  }
}

// Same payload-geo rule as track-anonymous-usage-events: only the approximate IP fix from the
// app's own Cloudflare worker is accepted, read from the top-level fields alone (never from
// event_properties), and never a device/GPS fix.
function resolveEventGeo(event: QueuedAnalyticsEvent): GeoResult | null {
  if (event.geo_source !== 'cf-worker') return null;
  return {
    accuracyKm: normalizeAccuracyKm(event.geo_accuracy_km),
    countryCode: normalizeCountryCode(event.geo_country_code),
    latitude: normalizeCoordinate(event.geo_latitude),
    longitude: normalizeCoordinate(event.geo_longitude),
    source: 'cf-worker',
    timezone: getText(event.geo_timezone),
    city: getText(event.geo_city),
    region: getText(event.geo_region_name),
    regionCode: getText(event.geo_region_code)?.toUpperCase() ?? null,
  };
}

// Never combine one provider's country with another provider's coordinates (the rule
// track-anonymous-usage-events enforces): a payload fix that carries a country is stored whole,
// so a country-only fix stays country-only; otherwise the request geo is stored whole.
function selectGeo(requestGeo: GeoResult | null, payloadGeo: GeoResult | null): GeoResult {
  if (payloadGeo?.countryCode) return payloadGeo;
  return (
    requestGeo ?? {
      accuracyKm: null,
      countryCode: null,
      latitude: null,
      longitude: null,
      source: null,
      timezone: null,
      city: null,
      region: null,
      regionCode: null,
    }
  );
}

function geoFromCache(cached: Record<string, unknown>): GeoResult {
  return {
    accuracyKm: null,
    countryCode: normalizeCountryCode(cached.countryCode),
    latitude: normalizeCoordinate(cached.latitude),
    longitude: normalizeCoordinate(cached.longitude),
    source: getText(cached.source),
    timezone: getText(cached.timezone),
    city: getText(cached.city),
    region: getText(cached.region),
    regionCode: getText(cached.regionCode),
  };
}

// M1: external lookups (ipinfo is paid) only for the request that claimed this key's lookup;
// otherwise the cached result, otherwise the free CF country.
async function resolveRequestGeo(
  req: Request,
  budget: IngestBudget,
  remember: (geo: GeoResult) => Promise<void>
): Promise<GeoResult> {
  // Tier 1: country from Cloudflare header — free, always present.
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

  // Last resort: CF header country only (no lat/lng).
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
    // Tier 3: ipinfo.io when paid token is configured.
    const ipinfoToken = Deno.env.get('IPINFO_TOKEN')?.trim();
    if (ipinfoToken) {
      const result = await lookupViaIpinfo(clientIp, ipinfoToken);
      if (result)
        return { ...result, accuracyKm: null, countryCode: result.countryCode ?? cfCountry };
    }

    // Tier 2: ipapi.co free fallback — always attempted when no paid token.
    const result = await lookupViaIpapi(clientIp);
    if (result)
      return { ...result, accuracyKm: null, countryCode: result.countryCode ?? cfCountry };
  }
  return null;
}

// M1: the same per-event contract as track-anonymous-usage-events. Previously this endpoint
// stored `queued_at` verbatim (any date, any size), so a signed-in account could rewrite
// historical rollups. Events that break a limit or lack a required field are dropped
// individually and counted: a missing name/platform/version used to reach the NOT NULL
// columns and fail the whole batch with a 500, which the app would then retry forever.
function acceptEvent(raw: unknown, now: number): QueuedAnalyticsEvent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const event = raw as QueuedAnalyticsEvent;
  const eventName = getText(event.event_name);
  const devicePlatform = getText(event.device_platform);
  const appVersion = getText(event.app_version);
  if (!eventName || !devicePlatform || !appVersion) return null;
  const queuedAt =
    typeof event.queued_at === 'string' && event.queued_at.trim().length > 0
      ? resolveQueuedAt(event.queued_at, now)
      : new Date(now).toISOString();
  if (queuedAt === 'invalid' || queuedAt === 'too_old') return null;
  const properties =
    event.event_properties &&
    typeof event.event_properties === 'object' &&
    !Array.isArray(event.event_properties)
      ? event.event_properties
      : {};
  if (!eventPropertiesWithinLimit(properties)) return null;
  const sessionId = getText(event.session_id);
  // Bound what will actually be stored, including any accepted payload geo.
  const geo = resolveEventGeo(event);
  if (
    !textFieldsWithinLimit([
      eventName,
      devicePlatform,
      appVersion,
      sessionId,
      geo?.timezone,
      geo?.city,
      geo?.regionCode,
      geo?.region,
      geo?.countryCode,
    ])
  ) {
    return null;
  }
  return {
    ...event,
    event_name: eventName,
    device_platform: devicePlatform,
    app_version: appVersion,
    event_properties: properties,
    queued_at: queuedAt,
    session_id: sessionId,
  };
}

function coarseCoordinate(value: number | null, limit: number): number | null {
  return value != null && Number.isFinite(value) && Math.abs(value) <= limit
    ? Math.round(value * 10) / 10
    : null;
}

// verify_jwt is off, so anyone can reach this handler. Database details go to the function
// log, never into the response (audit 2026-09-24 L7).
function internalErrorResponse(context: string, detail: unknown): Response {
  console.error(`[track-analytics-events] ${context}`, detail);
  return new Response(
    JSON.stringify({ success: false, error: 'Unable to record analytics events right now.' }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: 'Missing auth token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // M1: cap the body while streaming it, before verifying the token or parsing.
    const body = await readBodyWithinLimit(req);
    if (!body.ok) {
      return new Response(JSON.stringify({ success: false, error: 'Request body is too large' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 400 only when the body as a whole is unusable; individual bad events are dropped below.
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(body.text);
    } catch {
      parsed = null;
    }
    const rawEvents =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as TrackAnalyticsRequestBody).events
        : undefined;
    if (!Array.isArray(rawEvents)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Request body must include an events list' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (rawEvents.length === 0) {
      return new Response(JSON.stringify({ success: true, inserted: 0, geo: null }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // S5: match the 500-event batch ceiling that track-anonymous-usage-events already
    // enforces (parseBatchRequest). This endpoint requires a verified user token, so the
    // exposure is smaller, but a single authenticated account could still drive an unbounded
    // service-role insert from one request. The app batches far below this in practice.
    if (rawEvents.length > MAX_EVENTS_PER_BATCH) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `A batch may contain at most ${MAX_EVENTS_PER_BATCH} events`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const receivedAt = Date.now();
    const events = rawEvents
      .map((event) => acceptEvent(event, receivedAt))
      .filter((event): event is QueuedAnalyticsEvent => event !== null);
    const rejected = rawEvents.length - events.length;

    // M1: per-account budget and geo cache, shared with the anonymous collector's limiter.
    const clientKey = await hashIngestUserKey(user.id, serviceRoleKey);
    const budget = await consumeIngestBudget(supabase, clientKey, {
      events: events.length,
      bytes: body.bytes,
    });
    if (!budget.allowed) {
      return new Response(
        JSON.stringify({ success: false, error: 'Too many analytics requests; retry later' }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(budget.retryAfterSeconds),
          },
        }
      );
    }

    if (events.length === 0) {
      return new Response(JSON.stringify({ success: true, inserted: 0, rejected, geo: null }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payloadGeos = events.map((event) => resolveEventGeo(event));
    const requiresRequestGeo = payloadGeos.some((geo) => !geo?.countryCode);
    const requestGeo = requiresRequestGeo
      ? await resolveRequestGeo(req, budget, (geo) =>
          rememberIngestGeo(supabase, clientKey, { ...geo })
        )
      : null;
    const now = new Date(receivedAt).toISOString();

    const rows = events.map((event, index) => {
      const geo = selectGeo(requestGeo, payloadGeos[index]);

      return {
        app_version: event.app_version,
        created_at: event.queued_at,
        received_at: now,
        device_platform: event.device_platform,
        event_name: event.event_name,
        event_properties: event.event_properties ?? {},
        geo_accuracy_km: null, // No measured radius supplied by IP providers.
        geo_city: geo.city,
        geo_country_code: geo.countryCode,
        geo_latitude:
          coarseCoordinate(geo.longitude, 180) == null ? null : coarseCoordinate(geo.latitude, 90),
        geo_longitude:
          coarseCoordinate(geo.latitude, 90) == null ? null : coarseCoordinate(geo.longitude, 180),
        geo_region_code: geo.regionCode,
        geo_region_name: geo.region,
        geo_source: geo.source,
        geo_timezone: geo.timezone,
        session_id: event.session_id,
        user_id: user.id,
      };
    });

    const { error } = await supabase.from('analytics_events').insert(rows);

    if (error) {
      return internalErrorResponse('analytics_events insert failed', error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        inserted: rows.length,
        rejected,
        geo: requestGeo?.countryCode ?? payloadGeos[0]?.countryCode ?? null,
        geo_source: requestGeo?.source ?? payloadGeos[0]?.source ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return internalErrorResponse('unhandled error', error);
  }
});
