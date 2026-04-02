import countries from 'world-countries';

interface WorldCountryRecord {
  cca2?: string;
  latlng?: number[];
  name?: {
    common?: string;
  };
}

export interface CountryGeography {
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
    code,
    latitude,
    longitude,
    name,
  });
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
