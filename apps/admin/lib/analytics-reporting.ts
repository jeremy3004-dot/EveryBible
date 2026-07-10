import { getCountryGeography } from './country-geography';

export interface DailyMetricPoint {
  day: string;
  value: number;
}

export interface CountryMetric {
  code: string;
  downloadUnits: number;
  latitude: number;
  listenerCount: number;
  listeningMinutes: number;
  readingMinutes: number;
  longitude: number;
  name: string;
}

export interface CountryMetricRollup {
  code: string;
  downloadUnits: number;
  listenerCount: number;
  listeningMinutes: number;
  readingMinutes?: number;
  name: string;
}

export interface LocationMetricRollup {
  countryCode: string | null;
  countryName?: string | null;
  downloadUnits: number;
  latitude?: number | null;
  listenerCount: number;
  listeningMinutes: number;
  longitude?: number | null;
}

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

const APPROXIMATE_LOCATION_BUCKET_DECIMALS = 1;

function roundCoordinateToBucket(value: number): number {
  const factor = 10 ** APPROXIMATE_LOCATION_BUCKET_DECIMALS;
  return Math.round(value * factor) / factor;
}

function compareCountryMetrics(left: CountryMetric, right: CountryMetric): number {
  if (right.listeningMinutes !== left.listeningMinutes) {
    return right.listeningMinutes - left.listeningMinutes;
  }

  if (right.downloadUnits !== left.downloadUnits) {
    return right.downloadUnits - left.downloadUnits;
  }

  return left.name.localeCompare(right.name);
}

export function mapCountryRollupsToMetrics(countryRollups: CountryMetricRollup[]): CountryMetric[] {
  return countryRollups
    .map((rollup) => {
      const geography = getCountryGeography(rollup.code);
      if (!geography) {
        return null;
      }

      return {
        code: geography.code,
        downloadUnits: Math.max(0, Math.round(Number(rollup.downloadUnits) || 0)),
        latitude: geography.latitude,
        listenerCount: Math.max(0, Math.round(Number(rollup.listenerCount) || 0)),
        listeningMinutes: roundToSingleDecimal(Number(rollup.listeningMinutes) || 0),
        readingMinutes: roundToSingleDecimal(Number(rollup.readingMinutes) || 0),
        longitude: geography.longitude,
        name: geography.name,
      };
    })
    .filter((metric): metric is CountryMetric => metric !== null)
    .sort(compareCountryMetrics);
}

// ---------------------------------------------------------------------------
// Per-translation rollup types (returned by the SQL function)
// ---------------------------------------------------------------------------

export interface TranslationCountryRollup {
  translationId: string;
  code: string;
  name: string;
  listeningMinutes: number;
  readingMinutes: number;
  listenerCount: number;
  downloadUnits: number;
}

export interface TranslationLocationRollup {
  translationId: string;
  countryCode: string | null;
  countryName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  listeningMinutes: number;
  downloadUnits: number;
  listenerCount: number;
}

export interface TranslationListeningRollup {
  listeningMinutes: number;
  translationId: string;
}

/** One entry per translation that had any activity in the window. */
export interface TranslationBreakdownEntry {
  translationId: string;
  listeningMinutes: number;
  readingMinutes: number;
  downloadUnits: number;
  listenerCount: number;
  countryMetrics: CountryMetric[];
  locationMetrics: CountryMetric[];
}

/**
 * Groups flat per-translation rollup arrays into a per-translation breakdown
 * consumable by the globe component.
 */
export function buildTranslationBreakdown(
  countryRollups: TranslationCountryRollup[],
  locationRollups: TranslationLocationRollup[],
  listeningRollups: TranslationListeningRollup[] = [],
): TranslationBreakdownEntry[] {
  const byTranslation = new Map<
    string,
    {
      listeningMinutes: number;
      locationListeningMinutes: number;
      readingMinutes: number;
      downloadUnits: number;
      listenerCount: number;
      countryRollups: CountryMetricRollup[];
      locationRollups: LocationMetricRollup[];
    }
  >();
  const listeningMinutesByTranslation = new Map<string, number>();

  const ensure = (id: string) => {
    let entry = byTranslation.get(id);
    if (!entry) {
      entry = {
        listeningMinutes: 0,
        locationListeningMinutes: 0,
        readingMinutes: 0,
        downloadUnits: 0,
        listenerCount: 0,
        countryRollups: [],
        locationRollups: [],
      };
      byTranslation.set(id, entry);
    }
    return entry;
  };

  for (const row of listeningRollups) {
    listeningMinutesByTranslation.set(row.translationId, Math.max(0, Number(row.listeningMinutes) || 0));
    ensure(row.translationId);
  }

  for (const row of countryRollups) {
    const entry = ensure(row.translationId);
    entry.listeningMinutes += Number(row.listeningMinutes) || 0;
    entry.readingMinutes += Number(row.readingMinutes) || 0;
    entry.downloadUnits += Math.round(Number(row.downloadUnits) || 0);
    entry.listenerCount = Math.max(entry.listenerCount, Number(row.listenerCount) || 0);
    entry.countryRollups.push({
      code: row.code,
      name: row.name,
      listeningMinutes: Number(row.listeningMinutes) || 0,
      readingMinutes: Number(row.readingMinutes) || 0,
      downloadUnits: Math.round(Number(row.downloadUnits) || 0),
      listenerCount: Math.round(Number(row.listenerCount) || 0),
    });
  }

  for (const row of locationRollups) {
    const entry = ensure(row.translationId);
    entry.locationListeningMinutes += Number(row.listeningMinutes) || 0;
    entry.locationRollups.push({
      countryCode: row.countryCode,
      countryName: row.countryName,
      latitude: row.latitude,
      longitude: row.longitude,
      listeningMinutes: Number(row.listeningMinutes) || 0,
      downloadUnits: Math.round(Number(row.downloadUnits) || 0),
      listenerCount: Math.round(Number(row.listenerCount) || 0),
    });
  }

  return Array.from(byTranslation.entries())
    .map(([translationId, entry]) => {
      const locationMetrics = mapLocationRollupsToMetrics(entry.locationRollups);
      const countryMetrics = mapCountryRollupsToMetrics(entry.countryRollups);

      return {
        translationId,
        listeningMinutes: Math.round(
          listeningMinutesByTranslation.get(translationId) ??
            Math.max(entry.listeningMinutes, entry.locationListeningMinutes)
        ),
        readingMinutes: Math.round(entry.readingMinutes),
        downloadUnits: entry.downloadUnits,
        listenerCount: entry.listenerCount,
        countryMetrics: countryMetrics.length > 0 ? countryMetrics : locationMetrics,
        locationMetrics,
      };
    })
    .sort((a, b) => b.listeningMinutes - a.listeningMinutes || a.translationId.localeCompare(b.translationId));
}

export function mapLocationRollupsToMetrics(
  locationRollups: LocationMetricRollup[]
): CountryMetric[] {
  const bucketedMetrics = new Map<string, CountryMetric>();

  for (const rollup of locationRollups) {
    const hasCoords = rollup.latitude != null && rollup.longitude != null;
    const geography = getCountryGeography(rollup.countryCode, rollup.countryName);
    const latitude = hasCoords ? (rollup.latitude as number) : geography?.latitude;
    const longitude = hasCoords ? (rollup.longitude as number) : geography?.longitude;

    if (latitude == null || longitude == null) {
      continue;
    }

    // The admin map is built from privacy-safe approximate IP geolocation, not
    // device GPS. Bucket nearby points so mobile-network jitter does not make a
    // single stationary listener look like several distinct heatmap hotspots.
    const bucketLatitude = roundCoordinateToBucket(latitude);
    const bucketLongitude = roundCoordinateToBucket(longitude);
    const bucketKey = [
      geography?.code ?? rollup.countryCode ?? 'UNKNOWN',
      bucketLatitude.toFixed(APPROXIMATE_LOCATION_BUCKET_DECIMALS),
      bucketLongitude.toFixed(APPROXIMATE_LOCATION_BUCKET_DECIMALS),
    ].join(':');

    const listeningMinutes = roundToSingleDecimal(Number(rollup.listeningMinutes) || 0);
    const downloadUnits = Math.max(0, Math.round(Number(rollup.downloadUnits) || 0));
    const listenerCount = Math.max(0, Math.round(Number(rollup.listenerCount) || 0));

    const existing = bucketedMetrics.get(bucketKey);
    if (existing) {
      existing.listeningMinutes = roundToSingleDecimal(existing.listeningMinutes + listeningMinutes);
      existing.downloadUnits += downloadUnits;
      // Rollups are already deduped upstream per raw coordinate, so when we
      // merge nearby approximate buckets client-side we keep the conservative
      // maximum instead of summing and risking duplicate-listener inflation.
      existing.listenerCount = Math.max(existing.listenerCount, listenerCount);
      continue;
    }

    bucketedMetrics.set(bucketKey, {
      code: geography?.code ?? bucketKey,
      downloadUnits,
      latitude: bucketLatitude,
      listenerCount,
      listeningMinutes,
      // Reading is not IP-geolocated onto the map; location metrics carry no
      // reading minutes (country rollups do — see mapCountryRollupsToMetrics).
      readingMinutes: 0,
      longitude: bucketLongitude,
      name: geography?.name ?? rollup.countryName ?? 'Unknown location',
    });
  }

  return Array.from(bucketedMetrics.values()).sort(compareCountryMetrics);
}
