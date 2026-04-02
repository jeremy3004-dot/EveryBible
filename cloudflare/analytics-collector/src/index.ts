export interface Env {
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_URL: string;
}

interface RequestWithCf extends Request {
  cf?: {
    city?: string;
    country?: string;
    latitude?: number | string;
    longitude?: number | string;
    region?: string;
    regionCode?: string;
    timezone?: string;
  };
}

interface AnalyticsEventInput {
  app_version: string;
  created_at: string;
  device_platform: string;
  event_name: string;
  event_properties: Record<string, unknown>;
  session_id: string | null;
}

interface AnalyticsRequestBody {
  events?: unknown;
}

interface ResolvedLocation {
  geo_accuracy_km: number | null;
  geo_city: string | null;
  geo_country_code: string | null;
  geo_latitude: number | null;
  geo_longitude: number | null;
  geo_region_code: string | null;
  geo_region_name: string | null;
  geo_source: string | null;
  geo_timezone: string | null;
}

interface SupabaseUser {
  id: string;
}

const corsHeaders = {
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS,POST',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  extraHeaders: HeadersInit = {}
): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders,
      ...extraHeaders,
    },
    status,
  });
}

function textResponse(status: number, body: string, extraHeaders: HeadersInit = {}): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...corsHeaders,
      ...extraHeaders,
    },
    status,
  });
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCode(value: unknown): string | null {
  const text = normalizeText(value);
  return text ? text.toUpperCase() : null;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function getDefaultAccuracyKm(location: {
  city: string | null;
  countryCode: string | null;
  regionCode: string | null;
  regionName: string | null;
}): number | null {
  if (location.city) {
    return 50;
  }

  if (location.regionCode || location.regionName) {
    return 150;
  }

  if (location.countryCode) {
    return 800;
  }

  return null;
}

function resolveLocation(request: Request): ResolvedLocation {
  const cf = (request as RequestWithCf).cf;
  if (!cf) {
    return {
      geo_accuracy_km: null,
      geo_city: null,
      geo_country_code: null,
      geo_latitude: null,
      geo_longitude: null,
      geo_region_code: null,
      geo_region_name: null,
      geo_source: null,
      geo_timezone: null,
    };
  }

  const geoCountryCode = normalizeCode(cf.country);
  const geoRegionCode = normalizeCode(cf.regionCode);
  const geoRegionName = normalizeText(cf.region);
  const geoCity = normalizeText(cf.city);
  const geoLatitude = toFiniteNumber(cf.latitude);
  const geoLongitude = toFiniteNumber(cf.longitude);
  const geoTimezone = normalizeText(cf.timezone);

  return {
    geo_accuracy_km: getDefaultAccuracyKm({
      city: geoCity,
      countryCode: geoCountryCode,
      regionCode: geoRegionCode,
      regionName: geoRegionName,
    }),
    geo_city: geoCity,
    geo_country_code: geoCountryCode,
    geo_latitude: geoLatitude,
    geo_longitude: geoLongitude,
    geo_region_code: geoRegionCode,
    geo_region_name: geoRegionName,
    geo_source: 'cloudflare_request_cf',
    geo_timezone: geoTimezone,
  };
}

function normalizeEvent(raw: unknown): AnalyticsEventInput | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const eventName = normalizeText(candidate.event_name);
  const devicePlatform = normalizeText(candidate.device_platform);
  const appVersion = normalizeText(candidate.app_version);
  const createdAt = normalizeText(candidate.created_at) ?? new Date().toISOString();
  const sessionId = candidate.session_id == null ? null : normalizeText(candidate.session_id);
  const eventProperties =
    typeof candidate.event_properties === 'object' && candidate.event_properties !== null
      ? (candidate.event_properties as Record<string, unknown>)
      : {};

  if (!eventName || !devicePlatform || !appVersion) {
    return null;
  }

  return {
    app_version: appVersion,
    created_at: createdAt,
    device_platform: devicePlatform,
    event_name: eventName,
    event_properties: eventProperties,
    session_id: sessionId,
  };
}

function normalizeEvents(body: AnalyticsRequestBody): AnalyticsEventInput[] {
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return [];
  }

  const events: AnalyticsEventInput[] = [];
  for (const raw of body.events) {
    const event = normalizeEvent(raw);
    if (!event) {
      return [];
    }

    events.push(event);
  }

  return events;
}

async function authenticateUser(env: Env, authorization: string | null): Promise<SupabaseUser | null> {
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const accessToken = authorization.slice('Bearer '.length).trim();
  if (!accessToken) {
    return null;
  }

  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: env.SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json().catch(() => null)) as { id?: unknown } | null;
  const userId = normalizeText(data?.id);

  return userId ? { id: userId } : null;
}

async function insertAnalyticsRows({
  env,
  events,
  location,
  user,
}: {
  env: Env;
  events: AnalyticsEventInput[];
  location: ResolvedLocation;
  user: SupabaseUser;
}): Promise<void> {
  const rows = events.map((event) => ({
    app_version: event.app_version,
    created_at: event.created_at,
    device_platform: event.device_platform,
    event_name: event.event_name,
    event_properties: event.event_properties,
    geo_accuracy_km: location.geo_accuracy_km,
    geo_city: location.geo_city,
    geo_country_code: location.geo_country_code,
    geo_latitude: location.geo_latitude,
    geo_longitude: location.geo_longitude,
    geo_region_code: location.geo_region_code,
    geo_region_name: location.geo_region_name,
    geo_source: location.geo_source,
    geo_timezone: location.geo_timezone,
    session_id: event.session_id,
    user_id: user.id,
  }));

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/analytics_events`, {
    body: JSON.stringify(rows),
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
    method: 'POST',
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || `Supabase insert failed with HTTP ${response.status}`);
  }
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'OPTIONS') {
    return textResponse(204, '');
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    return jsonResponse(200, {
      ok: true,
      service: 'everybible-analytics-collector',
    });
  }

  if (path !== '/analytics' && path !== '/') {
    return textResponse(404, 'Not found');
  }

  if (request.method !== 'POST') {
    return textResponse(405, 'Method not allowed');
  }

  const user = await authenticateUser(env, request.headers.get('Authorization'));
  if (!user) {
    return jsonResponse(401, { error: 'Not authenticated' });
  }

  const body = (await request.json().catch(() => ({}))) as AnalyticsRequestBody;
  const events = normalizeEvents(body);
  if (events.length === 0) {
    return jsonResponse(400, { error: 'Expected a non-empty events array' });
  }

  const location = resolveLocation(request);

  try {
    await insertAnalyticsRows({
      env,
      events,
      location,
      user,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Failed to store analytics events',
    });
  }

  return jsonResponse(200, {
    insertedCount: events.length,
    location: {
      accuracyKm: location.geo_accuracy_km,
      city: location.geo_city,
      countryCode: location.geo_country_code,
      regionCode: location.geo_region_code,
      regionName: location.geo_region_name,
    },
    ok: true,
  });
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
