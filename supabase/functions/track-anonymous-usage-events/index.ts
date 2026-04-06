import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnonymousUsageEvent {
  app_version: string;
  device_platform: string;
  event_name: string;
  event_properties: Record<string, unknown>;
  queued_at: string;
  session_id: string | null;
}

interface AnonymousUsageRequestBody {
  events?: AnonymousUsageEvent[];
}

interface GeoResult {
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string | null;
  timezone: string | null;
}

// ---------------------------------------------------------------------------
// Geo resolution — three-tier, no mandatory credentials
//
// Tier 1: CF-IPCountry header — always present on Cloudflare-proxied requests,
//   no API call, no rate limit.  Country code only.
//
// Tier 2 (precise, free):  ipapi.co  — 30 k requests/day free, no token.
//   Returns country code + lat/lng + timezone.
//
// Tier 3 (precise, paid):  ipinfo.io — unlimited with IPINFO_TOKEN secret.
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
  if (c === 'XX' || c === 'T1' || c.length === 0) return null;
  return c;
}

function getClientIp(req: Request): string | null {
  const cfIp = req.headers.get('cf-connecting-ip')?.trim();
  if (cfIp && cfIp.length > 0) return cfIp;
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const raw = forwarded || realIp;
  if (!raw) return null;
  return raw.split(/\s*,\s*/)[0]?.trim() || null;
}

async function lookupViaIpinfo(ip: string, token: string): Promise<GeoResult | null> {
  try {
    const url = new URL(`https://ipinfo.io/${encodeURIComponent(ip)}/json`);
    url.searchParams.set('token', token);
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) return null;
    const p = (await resp.json().catch(() => null)) as
      | { country?: unknown; loc?: unknown; timezone?: unknown }
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
      countryCode: normalizeCountryCode(p.country),
      latitude, longitude,
      source: 'ipinfo',
      timezone: typeof p.timezone === 'string' && p.timezone.trim().length > 0 ? p.timezone.trim() : null,
    };
  } catch { return null; }
}

async function lookupViaIpapi(ip: string): Promise<GeoResult | null> {
  // ipapi.co — free, no token, 30 k req/day.
  try {
    const resp = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { Accept: 'application/json', 'User-Agent': 'EveryBible/analytics' },
    });
    if (!resp.ok) return null;
    const p = (await resp.json().catch(() => null)) as
      | { country_code?: unknown; latitude?: unknown; longitude?: unknown; timezone?: unknown; error?: unknown }
      | null;
    if (!p || p.error) return null;
    const lat = typeof p.latitude === 'number' ? p.latitude : null;
    const lng = typeof p.longitude === 'number' ? p.longitude : null;
    return {
      countryCode: normalizeCountryCode(p.country_code),
      latitude: lat, longitude: lng,
      source: 'ipapi',
      timezone: typeof p.timezone === 'string' && p.timezone.trim().length > 0 ? p.timezone.trim() : null,
    };
  } catch { return null; }
}

async function resolveGeo(req: Request): Promise<GeoResult> {
  const cfCountry = normalizeCountryCode(req.headers.get('cf-ipcountry'));

  const clientIp = getClientIp(req);
  if (clientIp) {
    const ipinfoToken = Deno.env.get('IPINFO_TOKEN')?.trim();
    if (ipinfoToken) {
      const result = await lookupViaIpinfo(clientIp, ipinfoToken);
      if (result) return { ...result, countryCode: result.countryCode ?? cfCountry };
    }

    const result = await lookupViaIpapi(clientIp);
    if (result) return { ...result, countryCode: result.countryCode ?? cfCountry };
  }

  return { countryCode: cfCountry, latitude: null, longitude: null, source: cfCountry ? 'cf_ipcountry' : null, timezone: null };
}

function getText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseBatchRequest(body: unknown): AnonymousUsageRequestBody | null {
  if (!body || typeof body !== 'object') return null;
  const events = (body as { events?: unknown }).events;
  if (!Array.isArray(events) || events.length === 0) return null;

  const normalizedEvents: AnonymousUsageEvent[] = [];
  for (const event of events) {
    if (!event || typeof event !== 'object') return null;
    const raw = event as Partial<AnonymousUsageEvent>;
    const eventName = getText(raw.event_name);
    const devicePlatform = getText(raw.device_platform);
    const appVersion = getText(raw.app_version);
    const queuedAt = getText(raw.queued_at);
    if (!eventName || !devicePlatform || !appVersion || !queuedAt) return null;
    normalizedEvents.push({
      app_version: appVersion,
      device_platform: devicePlatform,
      event_name: eventName as AnonymousUsageEvent['event_name'],
      event_properties:
        raw.event_properties && typeof raw.event_properties === 'object' && !Array.isArray(raw.event_properties)
          ? (raw.event_properties as Record<string, unknown>)
          : {},
      queued_at: queuedAt,
      session_id: raw.session_id === null || getText(raw.session_id) === null ? null : getText(raw.session_id),
    });
  }
  return { events: normalizedEvents };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    status,
  });
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
      return jsonResponse({ error: 'Collector environment is missing Supabase credentials' }, 500);
    }

    const batch = parseBatchRequest(await request.json().catch(() => null));
    if (!batch) return jsonResponse({ error: 'Request body must include analytics events' }, 400);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const geo = await resolveGeo(request);

    const rows = batch.events.map((event) => ({
      user_id: null,
      event_name: event.event_name,
      event_properties: event.event_properties,
      session_id: event.session_id,
      device_platform: event.device_platform,
      app_version: event.app_version,
      created_at: event.queued_at,
      geo_accuracy_km: null,
      geo_city: null,
      geo_country_code: geo.countryCode,
      geo_latitude: geo.latitude,
      geo_longitude: geo.longitude,
      geo_region_code: null,
      geo_region_name: null,
      geo_source: geo.source,
      geo_timezone: geo.timezone,
    }));

    const { error } = await supabase.from('analytics_events').insert(rows);
    if (error) return jsonResponse({ error: error.message }, 500);

    return jsonResponse({ inserted: rows.length, ok: true, geo: geo.countryCode, geo_source: geo.source });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unknown anonymous usage collector error' },
      500
    );
  }
});
