import countries from 'world-countries';

interface WorldCountryRecord {
  region?: string;
  subregion?: string;
  cca2?: string;
  latlng?: number[];
  name?: {
    common?: string;
  };
}

export interface CountryGeography {
  region?: string;
  subregion?: string;
  code: string;
  latitude: number;
  longitude: number;
  name: string;
}

const countryGeographyByCode = new Map<string, CountryGeography>();

for (const country of countries as WorldCountryRecord[]) {
  const code = country.cca2?.toUpperCase();
  const latitude = country.latlng?.[0];
  const longitude = country.latlng?.[1];
  const name = country.name?.common;

  if (
    !code ||
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !name
  ) {
    continue;
  }

  countryGeographyByCode.set(code, {
    region: country.region,
    subregion: country.subregion,
    code,
    latitude,
    longitude,
    name,
  });
}

// IP geolocation providers report some traffic under codes that are not
// countries (MaxMind's legacy EU/AP/A1/A2/O1, Cloudflare's XX/T1). They have no
// place on the map but their activity is real.
const PSEUDO_REGION_NAMES: Record<string, string> = {
  A1: 'Anonymous proxy',
  A2: 'Satellite provider',
  AP: 'Asia/Pacific (unspecified)',
  EU: 'Europe (unspecified)',
  O1: 'Unknown region',
  T1: 'Tor network',
  XX: 'Unknown region',
  ZZ: 'Unknown region',
};

/** A readable name for a reported region code that has no known geography. */
export function describeUnplacedRegion(code: string, reportedName?: string | null): string {
  const normalizedCode = code.trim().toUpperCase();
  const known = PSEUDO_REGION_NAMES[normalizedCode];
  if (known) {
    return known;
  }
  const name = reportedName?.trim();
  return name && name.toUpperCase() !== normalizedCode
    ? name
    : `Unknown region (${normalizedCode})`;
}

export function getCountryGeography(
  code: string | null | undefined,
  fallbackName?: string | null
): CountryGeography | null {
  const normalizedCode = code?.toUpperCase();
  if (!normalizedCode) {
    return null;
  }

  const existing = countryGeographyByCode.get(normalizedCode);
  if (!existing) {
    return null;
  }

  return fallbackName
    ? {
        ...existing,
        name: fallbackName,
      }
    : existing;
}
