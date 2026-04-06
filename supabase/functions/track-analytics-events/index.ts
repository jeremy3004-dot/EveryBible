import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QueuedAnalyticsEvent {
  app_version: string;
  device_platform: string;
  event_name: string;
  event_properties: Record<string, unknown>;
  queued_at: string;
  session_id: string | null;
}

interface GeoResult {
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string | null;
  timezone: string | null;
}

interface TrackAnalyticsRequestBody {
  events?: QueuedAnalyticsEvent[];
}

function getAccessToken(req: Request): string | null {
  const authorization = req.headers.get('authorization');
  if (!authorization) return null;
  return authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : authorization.trim() || null;
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
  // CF returns 'XX' for unknown IPs, 'T1' for Tor — treat both as unresolved.
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
      latitude: lat,
      longitude: lng,
      source: 'ipapi',
      timezone: typeof p.timezone === 'string' && p.timezone.trim().length > 0 ? p.timezone.trim() : null,
    };
  } catch { return null; }
}

async function resolveGeo(req: Request): Promise<GeoResult> {
  // Tier 1: country from Cloudflare header — free, always present.
  const cfCountry = normalizeCountryCode(req.headers.get('cf-ipcountry'));

  const clientIp = getClientIp(req);
  if (clientIp) {
    // Tier 3: ipinfo.io when paid token is configured.
    const ipinfoToken = Deno.env.get('IPINFO_TOKEN')?.trim();
    if (ipinfoToken) {
      const result = await lookupViaIpinfo(clientIp, ipinfoToken);
      if (result) return { ...result, countryCode: result.countryCode ?? cfCountry };
    }

    // Tier 2: ipapi.co free fallback — always attempted when no paid token.
    const result = await lookupViaIpapi(clientIp);
    if (result) return { ...result, countryCode: result.countryCode ?? cfCountry };
  }

  // Last resort: CF header country only (no lat/lng).
  return { countryCode: cfCountry, latitude: null, longitude: null, source: cfCountry ? 'cf_ipcountry' : null, timezone: null };
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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: authError?.message ?? 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json().catch(() => ({}))) as TrackAnalyticsRequestBody;
    const events = Array.isArray(body.events) ? body.events : [];

    if (events.length === 0) {
      return new Response(JSON.stringify({ success: true, inserted: 0, geo: null }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geo = await resolveGeo(req);
    const now = new Date().toISOString();

    const rows = events.map((event) => ({
      app_version: event.app_version,
      created_at: event.queued_at || now,
      device_platform: event.device_platform,
      event_name: event.event_name,
      event_properties: event.event_properties ?? {},
      geo_accuracy_km: null,
      geo_city: null,
      geo_country_code: geo.countryCode,
      geo_latitude: geo.latitude,
      geo_longitude: geo.longitude,
      geo_region_code: null,
      geo_region_name: null,
      geo_source: geo.source,
      geo_timezone: geo.timezone,
      session_id: event.session_id,
      user_id: user.id,
    }));

    const { error } = await supabase.from('analytics_events').insert(rows);

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ success: true, inserted: rows.length, geo: geo.countryCode, geo_source: geo.source }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
