import { getCountryGeography } from './country-geography';

export interface AnalyticsEventRow {
  created_at: string;
  event_properties: Record<string, unknown> | null;
  geo_accuracy_km: number | null;
  geo_city: string | null;
  geo_country_code: string | null;
  geo_latitude: number | null;
  geo_longitude: number | null;
  geo_region_code: string | null;
  geo_region_name: string | null;
  geo_source?: string | null;
  geo_timezone?: string | null;
  session_id: string | null;
  user_id: string | null;
}

export interface AnalyticsSummaryRow {
  engagement_score: number | null;
  total_listening_minutes: number | null;
  user_id: string;
}

export interface DailyMetricPoint {
  day: string;
  value: number;
}

export interface LocationMetricRollup {
  code: string;
  accuracyKm: number | null;
  city: string | null;
  countryCode: string | null;
  downloadUnits: number;
  latitude: number | null;
  listenerCount: number;
  listeningMinutes: number;
  longitude: number | null;
  name?: string | null;
  regionCode: string | null;
  regionName: string | null;
}

export interface LocationMetric extends LocationMetricRollup {
  accuracyKm: number;
  latitude: number;
  longitude: number;
  name: string;
}

export interface AnalyticsOverviewModel {
  activeLocationCount: number;
  averageEngagementScore: number;
  dailyDownloadUnits: DailyMetricPoint[];
  dailyListeningMinutes: DailyMetricPoint[];
  listeningTotalMinutes: number;
  locationMetrics: LocationMetric[];
  totalDownloadUnits: number;
  totalTrackedSessions: number;
  userCountWithListening: number;
}

type LocationMetricAccumulator = Omit<LocationMetricRollup, 'accuracyKm' | 'latitude' | 'longitude'> & {
  accuracyKm: number;
  latitude: number;
  longitude: number;
  listeners: Set<string>;
};

function toPositiveNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function compareLocationMetrics(left: LocationMetric, right: LocationMetric): number {
  if (right.listeningMinutes !== left.listeningMinutes) {
    return right.listeningMinutes - left.listeningMinutes;
  }

  if (right.downloadUnits !== left.downloadUnits) {
    return right.downloadUnits - left.downloadUnits;
  }

  return left.name.localeCompare(right.name);
}

function buildDateWindow(since: Date, totalDays: number): string[] {
  const firstDay = new Date(since);
  firstDay.setUTCHours(0, 0, 0, 0);

  return Array.from({ length: totalDays }, (_, index) => {
    const day = new Date(firstDay);
    day.setUTCDate(firstDay.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

function buildLocationCode(location: {
  city: string | null;
  countryCode: string | null;
  regionCode: string | null;
}): string {
  const code = [location.countryCode, location.regionCode, location.city]
    .map((part) => normalizeText(part))
    .filter((part): part is string => part !== null)
    .join('|');

  return code.length > 0 ? code : 'unknown';
}

function buildLocationName(location: Pick<LocationMetricRollup, 'city' | 'countryCode' | 'regionName'>): string {
  const city = normalizeText(location.city);
  const regionName = normalizeText(location.regionName);
  const countryCode = normalizeCode(location.countryCode);
  const countryName = countryCode ? getCountryGeography(countryCode)?.name ?? countryCode : null;

  if (city && regionName) {
    return `${city}, ${regionName}`;
  }

  if (city) {
    return countryName ? `${city}, ${countryName}` : city;
  }

  if (regionName) {
    return countryName ? `${regionName}, ${countryName}` : regionName;
  }

  return countryName ?? 'Unknown location';
}

function getDefaultAccuracyKm(location: {
  city: string | null;
  countryCode: string | null;
  regionCode: string | null;
  regionName: string | null;
}): number {
  if (location.city) {
    return 50;
  }

  if (location.regionCode || location.regionName) {
    return 150;
  }

  if (location.countryCode) {
    return 800;
  }

  return 1000;
}

function buildLocationAccumulator(
  location: Pick<
    LocationMetricRollup,
    'accuracyKm' | 'city' | 'countryCode' | 'latitude' | 'longitude' | 'regionCode' | 'regionName'
  >
): LocationMetricAccumulator {
  const countryCode = normalizeCode(location.countryCode);
  const regionCode = normalizeCode(location.regionCode);
  const regionName = normalizeText(location.regionName);
  const city = normalizeText(location.city);
  const geography = countryCode ? getCountryGeography(countryCode, null) : null;

  return {
    accuracyKm: toPositiveNumber(location.accuracyKm) || getDefaultAccuracyKm({ city, countryCode, regionCode, regionName }),
    city,
    code: buildLocationCode({ city, countryCode, regionCode }),
    countryCode,
    downloadUnits: 0,
    latitude: toFiniteNumber(location.latitude) ?? geography?.latitude ?? 0,
    listenerCount: 0,
    listeningMinutes: 0,
    longitude: toFiniteNumber(location.longitude) ?? geography?.longitude ?? 0,
    regionCode,
    regionName,
    listeners: new Set<string>(),
  };
}

function finalizeLocationMetrics(metrics: LocationMetricAccumulator[]): LocationMetric[] {
  return metrics
    .map((metric) => ({
      accuracyKm: metric.accuracyKm,
      city: metric.city,
      code: metric.code,
      countryCode: metric.countryCode,
      downloadUnits: Math.max(0, Math.round(metric.downloadUnits)),
      latitude: metric.latitude,
      listenerCount: metric.listeners.size,
      listeningMinutes: roundToSingleDecimal(metric.listeningMinutes),
      longitude: metric.longitude,
      name: buildLocationName(metric),
      regionCode: metric.regionCode,
      regionName: metric.regionName,
    }))
    .sort(compareLocationMetrics);
}

function ensureLocationAccumulator(
  locationMap: Map<string, LocationMetricAccumulator>,
  location: Pick<
    LocationMetricRollup,
    'accuracyKm' | 'city' | 'countryCode' | 'latitude' | 'longitude' | 'regionCode' | 'regionName'
  >
): LocationMetricAccumulator {
  const code = buildLocationCode({
    city: normalizeText(location.city),
    countryCode: normalizeCode(location.countryCode),
    regionCode: normalizeCode(location.regionCode),
  });

  const existing = locationMap.get(code);
  if (existing) {
    return existing;
  }

  const created = buildLocationAccumulator(location);
  locationMap.set(created.code, created);
  return created;
}

function aggregateLocationMetrics({
  audioEvents,
  downloadEvents,
}: {
  audioEvents: AnalyticsEventRow[];
  downloadEvents: AnalyticsEventRow[];
}): LocationMetric[] {
  const locationMap = new Map<string, LocationMetricAccumulator>();

  for (const row of audioEvents) {
    const metric = ensureLocationAccumulator(locationMap, {
      accuracyKm: row.geo_accuracy_km,
      city: row.geo_city,
      countryCode: row.geo_country_code,
      latitude: row.geo_latitude,
      longitude: row.geo_longitude,
      regionCode: row.geo_region_code,
      regionName: row.geo_region_name,
    });

    const minutes = toPositiveNumber(row.event_properties?.duration_ms) / 60000;
    metric.listeningMinutes += minutes;

    if (row.user_id) {
      metric.listeners.add(row.user_id);
    }
  }

  for (const row of downloadEvents) {
    const metric = ensureLocationAccumulator(locationMap, {
      accuracyKm: row.geo_accuracy_km,
      city: row.geo_city,
      countryCode: row.geo_country_code,
      latitude: row.geo_latitude,
      longitude: row.geo_longitude,
      regionCode: row.geo_region_code,
      regionName: row.geo_region_name,
    });

    const downloadUnits = Math.max(1, Math.round(toPositiveNumber(row.event_properties?.download_units) || 1));
    metric.downloadUnits += downloadUnits;
  }

  return finalizeLocationMetrics(Array.from(locationMap.values()));
}

export function buildAnalyticsOverviewModel({
  audioEvents,
  downloadEvents,
  since,
  summaries,
  totalDays = 30,
}: {
  audioEvents: AnalyticsEventRow[];
  downloadEvents: AnalyticsEventRow[];
  since: Date;
  summaries: AnalyticsSummaryRow[];
  totalDays?: number;
}): AnalyticsOverviewModel {
  const days = buildDateWindow(since, totalDays);
  const listeningByDay = new Map(days.map((day) => [day, 0]));
  const downloadsByDay = new Map(days.map((day) => [day, 0]));
  const sessionIds = new Set<string>();
  const userIdsWithListening = new Set<string>();

  let totalListeningMinutes = 0;
  for (const row of audioEvents) {
    const day = new Date(row.created_at).toISOString().slice(0, 10);
    const minutes = toPositiveNumber(row.event_properties?.duration_ms) / 60000;
    listeningByDay.set(day, (listeningByDay.get(day) ?? 0) + minutes);
    totalListeningMinutes += minutes;

    if (row.session_id) {
      sessionIds.add(row.session_id);
    }

    if (row.user_id) {
      userIdsWithListening.add(row.user_id);
    }
  }

  let totalDownloadUnits = 0;
  for (const row of downloadEvents) {
    const day = new Date(row.created_at).toISOString().slice(0, 10);
    const downloadUnits = Math.max(1, Math.round(toPositiveNumber(row.event_properties?.download_units) || 1));
    downloadsByDay.set(day, (downloadsByDay.get(day) ?? 0) + downloadUnits);
    totalDownloadUnits += downloadUnits;
  }

  const averageEngagementScore =
    summaries.length > 0
      ? Math.round(
          summaries.reduce((sum, row) => sum + Number(row.engagement_score ?? 0), 0) / summaries.length
        )
      : 0;
  const locationMetrics = aggregateLocationMetrics({ audioEvents, downloadEvents });

  return {
    activeLocationCount: locationMetrics.length,
    averageEngagementScore,
    dailyDownloadUnits: days.map((day) => ({
      day,
      value: Math.round(downloadsByDay.get(day) ?? 0),
    })),
    dailyListeningMinutes: days.map((day) => ({
      day,
      value: roundToSingleDecimal(listeningByDay.get(day) ?? 0),
    })),
    listeningTotalMinutes: Math.round(totalListeningMinutes),
    locationMetrics,
    totalDownloadUnits,
    totalTrackedSessions: sessionIds.size,
    userCountWithListening: userIdsWithListening.size,
  };
}

export function mapLocationRollupsToMetrics(locationRollups: LocationMetricRollup[]): LocationMetric[] {
  return locationRollups
    .map((rollup) => {
      const countryCode = normalizeCode(rollup.countryCode);
      const geography = countryCode ? getCountryGeography(countryCode, null) : null;

      return {
        accuracyKm: toPositiveNumber(rollup.accuracyKm) || getDefaultAccuracyKm({
          city: normalizeText(rollup.city),
          countryCode,
          regionCode: normalizeCode(rollup.regionCode),
          regionName: normalizeText(rollup.regionName),
        }),
        city: normalizeText(rollup.city),
        code: normalizeText(rollup.code) ?? buildLocationCode({
          city: normalizeText(rollup.city),
          countryCode,
          regionCode: normalizeCode(rollup.regionCode),
        }),
        countryCode,
        downloadUnits: Math.max(0, Math.round(Number(rollup.downloadUnits) || 0)),
        latitude: toFiniteNumber(rollup.latitude) ?? geography?.latitude ?? 0,
        listenerCount: Math.max(0, Math.round(Number(rollup.listenerCount) || 0)),
        listeningMinutes: roundToSingleDecimal(Number(rollup.listeningMinutes) || 0),
        longitude: toFiniteNumber(rollup.longitude) ?? geography?.longitude ?? 0,
        name: buildLocationName({
          city: normalizeText(rollup.city),
          countryCode,
          regionName: normalizeText(rollup.regionName),
        }),
        regionCode: normalizeCode(rollup.regionCode),
        regionName: normalizeText(rollup.regionName),
      };
    })
    .sort(compareLocationMetrics);
}
