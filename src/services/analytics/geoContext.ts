interface GeoContext {
  geo_accuracy_km: number | null;
  geo_country_code: string | null;
  geo_latitude: number | null;
  geo_longitude: number | null;
  geo_source: string | null;
  geo_timezone: string | null;
}

type GeoAttachableEvent = {
  geo_accuracy_km?: number | null;
  geo_country_code?: string | null;
  geo_latitude?: number | null;
  geo_longitude?: number | null;
  geo_source?: string | null;
  geo_timezone?: string | null;
};

let cachedGeoContext: GeoContext | null | undefined;
let geoLookupPromise: Promise<GeoContext | null> | null = null;

function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const countryCode = value.trim().toUpperCase();
  if (countryCode === 'XX' || countryCode === 'T1' || countryCode.length === 0) {
    return null;
  }
  return countryCode;
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

export async function resolveGeoContext(): Promise<GeoContext | null> {
  if (cachedGeoContext !== undefined) {
    return cachedGeoContext;
  }

  if (!geoLookupPromise) {
    geoLookupPromise = (async () => {
      try {
        const response = await fetch('https://ipapi.co/json/', {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'EveryBible/mobile-analytics',
          },
        });

        if (!response.ok) {
          return null;
        }

        const payload = (await response.json().catch(() => null)) as
          | {
              country_code?: unknown;
              latitude?: unknown;
              longitude?: unknown;
              timezone?: unknown;
            }
          | null;

        if (!payload) {
          return null;
        }

        const geo: GeoContext = {
          geo_accuracy_km: null,
          geo_country_code: normalizeCountryCode(payload.country_code),
          geo_latitude: normalizeCoordinate(payload.latitude),
          geo_longitude: normalizeCoordinate(payload.longitude),
          geo_source: 'ipapi',
          geo_timezone:
            typeof payload.timezone === 'string' && payload.timezone.trim().length > 0
              ? payload.timezone.trim()
              : null,
        };

        if (!geo.geo_country_code && geo.geo_latitude == null && geo.geo_longitude == null) {
          return null;
        }

        return geo;
      } catch {
        return null;
      } finally {
        geoLookupPromise = null;
      }
    })();
  }

  cachedGeoContext = await geoLookupPromise;
  return cachedGeoContext;
}

export function attachGeoContext<T extends GeoAttachableEvent>(
  event: T,
  geo: GeoContext | null
): T {
  if (!geo) {
    return event;
  }

  return {
    ...event,
    geo_accuracy_km: geo.geo_accuracy_km,
    geo_country_code: geo.geo_country_code,
    geo_latitude: geo.geo_latitude,
    geo_longitude: geo.geo_longitude,
    geo_source: geo.geo_source,
    geo_timezone: geo.geo_timezone,
  };
}
