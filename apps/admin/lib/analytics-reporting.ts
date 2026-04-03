import { getCountryGeography } from './country-geography';

export interface AnalyticsEventRow {
  created_at: string;
  event_properties: Record<string, unknown> | null;
  session_id: string | null;
  user_id: string | null;
}

export interface AnalyticsSummaryRow {
  engagement_score: number | null;
  total_listening_minutes: number | null;
  user_id: string;
}

export interface PreferenceCountryRow {
  country_code: string | null;
  country_name: string | null;
  user_id: string;
}

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
  longitude: number;
  name: string;
}

export interface CountryMetricRollup {
  code: string;
  downloadUnits: number;
  listenerCount: number;
  listeningMinutes: number;
  name: string;
}

export interface LocationMetricRollup {
  countryCode: string | null;
  countryName?: string | null;
  downloadUnits: number;
  listenerCount: number;
  listeningMinutes: number;
}

export interface AnalyticsOverviewModel {
  activeCountryCount: number;
  averageEngagementScore: number;
  countryMetrics: CountryMetric[];
  dailyDownloadUnits: DailyMetricPoint[];
  dailyListeningMinutes: DailyMetricPoint[];
  listeningTotalMinutes: number;
  totalDownloadUnits: number;
  totalTrackedSessions: number;
  userCountWithListening: number;
}

function toPositiveNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
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

function buildDateWindow(since: Date, totalDays: number): string[] {
  const firstDay = new Date(since);
  firstDay.setUTCHours(0, 0, 0, 0);

  return Array.from({ length: totalDays }, (_, index) => {
    const day = new Date(firstDay);
    day.setUTCDate(firstDay.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

export function buildAnalyticsOverviewModel({
  audioEvents,
  downloadEvents,
  preferences,
  since,
  summaries,
  totalDays = 30,
}: {
  audioEvents: AnalyticsEventRow[];
  downloadEvents: AnalyticsEventRow[];
  preferences: PreferenceCountryRow[];
  since: Date;
  summaries: AnalyticsSummaryRow[];
  totalDays?: number;
}): AnalyticsOverviewModel {
  const days = buildDateWindow(since, totalDays);
  const listeningByDay = new Map(days.map((day) => [day, 0]));
  const downloadsByDay = new Map(days.map((day) => [day, 0]));
  const sessionIds = new Set<string>();
  const userIdsWithListening = new Set<string>();
  const listenersByCountry = new Map<string, Set<string>>();
  const countryMetrics = new Map<string, CountryMetric>();

  const countryByUserId = new Map<string, ReturnType<typeof getCountryGeography>>();
  for (const preference of preferences) {
    const geography = getCountryGeography(preference.country_code, preference.country_name);
    if (!geography) {
      continue;
    }

    countryByUserId.set(preference.user_id, geography);
  }

  const ensureCountryMetric = (userId: string | null | undefined) => {
    if (!userId) {
      return null;
    }

    const geography = countryByUserId.get(userId);
    if (!geography) {
      return null;
    }

    const existing = countryMetrics.get(geography.code);
    if (existing) {
      return existing;
    }

    const created: CountryMetric = {
      code: geography.code,
      downloadUnits: 0,
      latitude: geography.latitude,
      listenerCount: 0,
      listeningMinutes: 0,
      longitude: geography.longitude,
      name: geography.name,
    };
    countryMetrics.set(geography.code, created);
    return created;
  };

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
      const metric = ensureCountryMetric(row.user_id);
      if (metric) {
        metric.listeningMinutes += minutes;
        const listeners = listenersByCountry.get(metric.code) ?? new Set<string>();
        listeners.add(row.user_id);
        listenersByCountry.set(metric.code, listeners);
      }
    }
  }

  let totalDownloadUnits = 0;
  for (const row of downloadEvents) {
    const day = new Date(row.created_at).toISOString().slice(0, 10);
    const downloadUnits = Math.max(1, Math.round(toPositiveNumber(row.event_properties?.download_units) || 1));
    downloadsByDay.set(day, (downloadsByDay.get(day) ?? 0) + downloadUnits);
    totalDownloadUnits += downloadUnits;

    const metric = ensureCountryMetric(row.user_id);
    if (metric) {
      metric.downloadUnits += downloadUnits;
    }
  }

  for (const [code, listeners] of listenersByCountry.entries()) {
    const metric = countryMetrics.get(code);
    if (metric) {
      metric.listenerCount = listeners.size;
    }
  }

  const averageEngagementScore =
    summaries.length > 0
      ? Math.round(
          summaries.reduce((sum, row) => sum + Number(row.engagement_score ?? 0), 0) / summaries.length
        )
      : 0;

  return {
    activeCountryCount: Array.from(countryMetrics.values()).filter(
      (metric) => metric.listeningMinutes > 0 || metric.downloadUnits > 0
    ).length,
    averageEngagementScore,
    countryMetrics: Array.from(countryMetrics.values()).sort(compareCountryMetrics),
    dailyDownloadUnits: days.map((day) => ({
      day,
      value: Math.round(downloadsByDay.get(day) ?? 0),
    })),
    dailyListeningMinutes: days.map((day) => ({
      day,
      value: roundToSingleDecimal(listeningByDay.get(day) ?? 0),
    })),
    listeningTotalMinutes: Math.round(totalListeningMinutes),
    totalDownloadUnits,
    totalTrackedSessions: sessionIds.size,
    userCountWithListening: userIdsWithListening.size,
  };
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
        longitude: geography.longitude,
        name: geography.name,
      };
    })
    .filter((metric): metric is CountryMetric => metric !== null)
    .sort(compareCountryMetrics);
}

export function mapLocationRollupsToMetrics(
  locationRollups: LocationMetricRollup[]
): CountryMetric[] {
  const countryMetrics = new Map<string, CountryMetric>();

  for (const rollup of locationRollups) {
    const geography = getCountryGeography(rollup.countryCode);
    if (!geography) {
      continue;
    }

    const existing = countryMetrics.get(geography.code);
    if (existing) {
      existing.downloadUnits += Math.max(0, Math.round(Number(rollup.downloadUnits) || 0));
      existing.listenerCount += Math.max(0, Math.round(Number(rollup.listenerCount) || 0));
      existing.listeningMinutes += roundToSingleDecimal(Number(rollup.listeningMinutes) || 0);
      continue;
    }

    countryMetrics.set(geography.code, {
      code: geography.code,
      downloadUnits: Math.max(0, Math.round(Number(rollup.downloadUnits) || 0)),
      listenerCount: Math.max(0, Math.round(Number(rollup.listenerCount) || 0)),
      listeningMinutes: roundToSingleDecimal(Number(rollup.listeningMinutes) || 0),
      longitude: geography.longitude,
      name: geography.name,
      latitude: geography.latitude,
    });
  }

  return Array.from(countryMetrics.values()).sort(compareCountryMetrics);
}
