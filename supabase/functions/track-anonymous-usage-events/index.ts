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

interface GeoLookupResult {
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string | null;
  timezone: string | null;
}

function getClientIp(req: Request): string | null {
  // Supabase Edge Functions run on Deno Deploy (Cloudflare-backed infrastructure).
  // CF-Connecting-IP is the most reliable header — it is set by Cloudflare to the
  // real client IP and cannot be spoofed.  x-forwarded-for and x-real-ip are
  // checked as fallbacks for non-Cloudflare environments.
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    const ip = cfConnectingIp.trim();
    return ip.length > 0 ? ip : null;
  }

  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const raw = forwarded || realIp;
  if (!raw) {
    return null;
  }
  return raw.split(/\s*,\s*/)[0]?.trim() || null;
}

async function lookupGeoByIp(ip: string): Promise<GeoLookupResult | null> {
  const token = Deno.env.get('IPINFO_TOKEN')?.trim();
  const url = new URL(`https://ipinfo.io/${encodeURIComponent(ip)}/json`);
  if (token) {
    url.searchParams.set('token', token);
  }

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as
    | { country?: unknown; loc?: unknown; timezone?: unknown }
    | null;

  if (!payload) {
    return null;
  }

  const countryRaw = typeof payload.country === 'string' ? payload.country.trim().toUpperCase() : null;
  const countryCode = countryRaw && countryRaw.length > 0 ? countryRaw : null;

  let latitude: number | null = null;
  let longitude: number | null = null;
  if (typeof payload.loc === 'string') {
    const parts = payload.loc.split(',');
    const lat = parseFloat(parts[0] ?? '');
    const lng = parseFloat(parts[1] ?? '');
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      latitude = lat;
      longitude = lng;
    }
  }

  return {
    countryCode,
    latitude,
    longitude,
    source: 'ipinfo',
    timezone: typeof payload.timezone === 'string' && payload.timezone.trim().length > 0
      ? payload.timezone.trim()
      : null,
  };
}

function getText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseBatchRequest(body: unknown): AnonymousUsageRequestBody | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const events = (body as { events?: unknown }).events;
  if (!Array.isArray(events) || events.length === 0) {
    return null;
  }

  const normalizedEvents: AnonymousUsageEvent[] = [];
  for (const event of events) {
    if (!event || typeof event !== 'object') {
      return null;
    }

    const raw = event as Partial<AnonymousUsageEvent>;
    const eventName = getText(raw.event_name);
    const devicePlatform = getText(raw.device_platform);
    const appVersion = getText(raw.app_version);
    const queuedAt = getText(raw.queued_at);

    if (!eventName || !devicePlatform || !appVersion || !queuedAt) {
      return null;
    }

    normalizedEvents.push({
      app_version: appVersion,
      device_platform: devicePlatform,
      event_name: eventName as AnonymousUsageEvent['event_name'],
      event_properties:
        raw.event_properties && typeof raw.event_properties === 'object' && !Array.isArray(raw.event_properties)
          ? (raw.event_properties as Record<string, unknown>)
          : {},
      queued_at: queuedAt,
      session_id:
        raw.session_id === null || getText(raw.session_id) === null ? null : getText(raw.session_id),
    });
  }

  return { events: normalizedEvents };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
    status,
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    return jsonResponse({ ok: true, service: 'track-anonymous-usage-events' });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Collector environment is missing Supabase credentials' }, 500);
    }

    const batch = parseBatchRequest(await request.json().catch(() => null));
    if (!batch) {
      return jsonResponse({ error: 'Request body must include analytics events' }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const clientIp = getClientIp(request);
    const geo = clientIp ? await lookupGeoByIp(clientIp) : null;

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
      geo_country_code: geo?.countryCode ?? null,
      geo_latitude: geo?.latitude ?? null,
      geo_longitude: geo?.longitude ?? null,
      geo_region_code: null,
      geo_region_name: null,
      geo_source: geo?.source ?? null,
      geo_timezone: geo?.timezone ?? null,
    }));

    const { error } = await supabase.from('analytics_events').insert(rows);
    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({
      inserted: rows.length,
      ok: true,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Unknown anonymous usage collector error',
      },
      500
    );
  }
});
