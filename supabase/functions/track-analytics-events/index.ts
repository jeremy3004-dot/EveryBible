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

interface GeoLookupResult {
  countryCode: string | null;
  source: string | null;
  timezone: string | null;
}

interface TrackAnalyticsRequestBody {
  events?: QueuedAnalyticsEvent[];
}

function getAccessToken(req: Request): string | null {
  const authorization = req.headers.get('authorization');
  if (!authorization) {
    return null;
  }

  return authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : authorization.trim() || null;
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const raw = forwarded || realIp;

  if (!raw) {
    return null;
  }

  return raw.split(/\s*,\s*/)[0]?.trim() || null;
}

function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

async function lookupCountryByIp(ip: string): Promise<GeoLookupResult | null> {
  const token = Deno.env.get('IPINFO_TOKEN')?.trim();
  const url = new URL(`https://ipinfo.io/${encodeURIComponent(ip)}/json`);
  if (token) {
    url.searchParams.set('token', token);
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as
    | { country?: unknown; timezone?: unknown }
    | null;

  if (!payload) {
    return null;
  }

  return {
    countryCode: normalizeCountryCode(payload.country),
    source: 'ipinfo',
    timezone: typeof payload.timezone === 'string' && payload.timezone.trim().length > 0
      ? payload.timezone.trim()
      : null,
  };
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

    const clientIp = getClientIp(req);
    const geo = clientIp ? await lookupCountryByIp(clientIp) : null;
    const now = new Date().toISOString();

    const rows = events.map((event) => ({
      app_version: event.app_version,
      created_at: event.queued_at || now,
      device_platform: event.device_platform,
      event_name: event.event_name,
      event_properties: event.event_properties ?? {},
      geo_accuracy_km: null,
      geo_city: null,
      geo_country_code: geo?.countryCode ?? null,
      geo_latitude: null,
      geo_longitude: null,
      geo_region_code: null,
      geo_region_name: null,
      geo_source: geo?.source ?? null,
      geo_timezone: geo?.timezone ?? null,
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
      JSON.stringify({
        success: true,
        inserted: rows.length,
        geo: geo?.countryCode ?? null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
