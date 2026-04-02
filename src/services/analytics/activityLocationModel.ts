export interface RawAnalyticsLocationSnapshot {
  accuracyMeters: number | null;
  countryCode: string | null;
  countryName: string | null;
  label: string | null;
  latitude: number;
  longitude: number;
}

export interface AnalyticsLocationSnapshot {
  accuracyMeters: number | null;
  countryCode: string | null;
  countryName: string | null;
  label: string | null;
  latitudeBucket: number;
  longitudeBucket: number;
  source: 'device';
}

const LOCATION_BUCKET_DEGREES = 2;

function roundToBucket(value: number): number {
  return Math.round(value / LOCATION_BUCKET_DEGREES) * LOCATION_BUCKET_DEGREES;
}

function normalizeCountryCode(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function normalizeLabel(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? `Approximate area near ${trimmed}` : null;
}

export function normalizeAnalyticsLocationSnapshot(
  snapshot: RawAnalyticsLocationSnapshot
): AnalyticsLocationSnapshot {
  return {
    accuracyMeters:
      typeof snapshot.accuracyMeters === 'number' && Number.isFinite(snapshot.accuracyMeters)
        ? snapshot.accuracyMeters
        : null,
    countryCode: normalizeCountryCode(snapshot.countryCode),
    countryName: snapshot.countryName?.trim() || null,
    label: normalizeLabel(snapshot.label),
    latitudeBucket: roundToBucket(snapshot.latitude),
    longitudeBucket: roundToBucket(snapshot.longitude),
    source: 'device',
  };
}

export function buildAnalyticsLocationEventProperties(snapshot: AnalyticsLocationSnapshot) {
  return {
    geo_accuracy_meters: snapshot.accuracyMeters,
    geo_country_code: snapshot.countryCode,
    geo_country_name: snapshot.countryName,
    geo_label: snapshot.label,
    geo_latitude_bucket: snapshot.latitudeBucket,
    geo_longitude_bucket: snapshot.longitudeBucket,
    geo_source: snapshot.source,
  };
}
