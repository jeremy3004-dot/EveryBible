const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type, User-Agent',
  'Access-Control-Max-Age': '86400',
};

interface GeoPayload {
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  city: string | null;
  region: string | null;
  region_code: string | null;
}

function parseCoordinate(value: string | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value: string | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    if (method !== 'GET') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: CORS_HEADERS,
      });
    }

    const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;

    const payload: GeoPayload = cf
      ? {
          country_code: nullableString(cf.country as string | undefined),
          latitude: parseCoordinate(cf.latitude as string | undefined),
          longitude: parseCoordinate(cf.longitude as string | undefined),
          timezone: nullableString(cf.timezone as string | undefined),
          city: nullableString(cf.city as string | undefined),
          region: nullableString(cf.region as string | undefined),
          region_code: nullableString(cf.regionCode as string | undefined),
        }
      : {
          country_code: null,
          latitude: null,
          longitude: null,
          timezone: null,
          city: null,
          region: null,
          region_code: null,
        };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...CORS_HEADERS,
      },
    });
  },
} satisfies ExportedHandler;
