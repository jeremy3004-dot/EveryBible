import type { CountryMetric, TranslationBreakdownEntry } from './analytics-reporting';

export type AtlasMetric = 'listeningMinutes' | 'readingMinutes' | 'downloadUnits';
export const ATLAS_METRICS: { key: AtlasMetric; label: string; unit: string }[] = [
  { key: 'listeningMinutes', label: 'Listening', unit: 'listening min' },
  { key: 'readingMinutes', label: 'Reading', unit: 'reading min' },
  { key: 'downloadUnits', label: 'Downloads', unit: 'download units' },
];
export const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
export const metricLabel = (mode: AtlasMetric) =>
  ATLAS_METRICS.find((item) => item.key === mode)!.unit;
export const pointId = (point: CountryMetric) =>
  `${point.locationKind ?? 'approximate'}:${point.code}:${point.latitude}:${point.longitude}`;
export const isValidPoint = (point: CountryMetric) =>
  Number.isFinite(point.latitude) &&
  Number.isFinite(point.longitude) &&
  Math.abs(point.latitude) <= 90 &&
  Math.abs(point.longitude) <= 180;

export function getAtlasScope(
  analytics: {
    countryMetrics: CountryMetric[];
    locationMetrics: CountryMetric[];
    translationBreakdown: TranslationBreakdownEntry[];
  },
  translationId: string | null
) {
  const translation = translationId
    ? analytics.translationBreakdown.find((entry) => entry.translationId === translationId)
    : null;
  return {
    countries: translationId ? (translation?.countryTableMetrics ?? []) : analytics.countryMetrics,
    locations: translationId ? (translation?.locationMetrics ?? []) : analytics.locationMetrics,
    translation,
  };
}

export function getAtlasPoints(
  scope: { countries: CountryMetric[]; locations: CountryMetric[] },
  mode: AtlasMetric
): CountryMetric[] {
  const points = scope.locations.filter((point) => isValidPoint(point) && point[mode] > 0);
  // Country-only events are real activity too. Show their additive remainder
  // at the country center, alongside known buckets, without duplicating totals.
  const locatedByCountry = new Map<string, number>();
  for (const point of points)
    locatedByCountry.set(point.code, (locatedByCountry.get(point.code) ?? 0) + point[mode]);
  for (const country of scope.countries) {
    const remainder =
      Math.round((country[mode] - (locatedByCountry.get(country.code) ?? 0)) * 10) / 10;
    if (remainder <= 0 || !isValidPoint(country)) continue;
    points.push({
      ...country,
      locationKind: 'country',
      listeningMinutes: 0,
      readingMinutes: 0,
      downloadUnits: 0,
      listenerCount: 0,
      [mode]: remainder,
    });
  }
  return points;
}

// Log normalization keeps smaller communities visible when the largest bucket
// is orders of magnitude larger. This is a relative scale, never a headcount.
export function getMetricWeight(value: number, maximum: number): number {
  return value > 0 ? Math.min(1, Math.log1p(value) / Math.log1p(Math.max(maximum, value, 1))) : 0;
}

export function buildAtlasFeatures(points: CountryMetric[], mode: AtlasMetric) {
  const valid = points.filter((point) => isValidPoint(point) && point[mode] > 0);
  const maximum = Math.max(1, ...valid.map((point) => point[mode]));
  return {
    type: 'FeatureCollection' as const,
    features: valid.map((point) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] },
      properties: {
        ...point,
        pointId: pointId(point),
        weight: getMetricWeight(point[mode], maximum),
        value: point[mode],
      },
    })),
  };
}

export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((value) => {
          if (typeof value === 'number') return String(value);
          const safe = /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
          return `"${safe.replaceAll('"', '""')}"`;
        })
        .join(',')
    )
    .join('\r\n');
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function buildDailySeries(
  listening: { day: string; minutes: number }[],
  reading: { day: string; minutes: number }[],
  downloads: { day: string; value: number }[]
) {
  const rows = new Map<
    string,
    { day: string; listeningMinutes: number; readingMinutes: number; downloadUnits: number }
  >();
  for (const [points, metric, field] of [
    [listening, 'listeningMinutes', 'minutes'],
    [reading, 'readingMinutes', 'minutes'],
    [downloads, 'downloadUnits', 'value'],
  ] as const) {
    for (const point of points) {
      const day = point.day.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day))) continue;
      const row = rows.get(day) ?? {
        day,
        listeningMinutes: 0,
        readingMinutes: 0,
        downloadUnits: 0,
      };
      row[metric] += Number((point as unknown as Record<string, unknown>)[field]) || 0;
      rows.set(day, row);
    }
  }
  const days = [...rows.keys()].sort();
  if (!days.length) return [];
  const result = [];
  for (
    let date = Date.parse(days[0]);
    date <= Date.parse(days[days.length - 1]);
    date += 86400000
  ) {
    const day = new Date(date).toISOString().slice(0, 10);
    result.push(rows.get(day) ?? { day, listeningMinutes: 0, readingMinutes: 0, downloadUnits: 0 });
  }
  return result;
}
