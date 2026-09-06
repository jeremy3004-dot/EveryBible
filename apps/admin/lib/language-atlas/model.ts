import type { FeatureCollection, Point } from 'geojson';
import type {
  AtlasCounts,
  AtlasFilters,
  AtlasLocation,
  AtlasRecord,
  ScriptureStatus,
} from './types';
import { scriptureVisualCategory, type ScriptureVisualCategory } from './presentation';

export const DEFAULT_FILTERS: AtlasFilters = {
  query: '',
  kind: 'varieties',
  country: '',
  scripture: 'all',
  placement: 'all',
  source: '',
};
export const SCRIPTURE_LABELS: Record<ScriptureStatus, string> = {
  bible: 'Complete Bible',
  nt: 'New Testament',
  portions: 'Portions',
  started: 'Translation started',
  needed: 'Translation needed',
  unknown: 'Unknown',
};
export const KIND_LABELS = {
  language: 'Language',
  dialect: 'Dialect / variety',
  'people-group': 'People group',
};
export const PRECISION_LABELS = {
  'language-area': 'Language reference area',
  'dialect-area': 'Dialect reference area',
  'people-group-area': 'People group reference area',
  'related-people-group': 'Related people group location',
  'parent-language': 'Parent-language approximation',
  country: 'Country-center approximation',
};
export const formatCount = (value: number) => new Intl.NumberFormat('en').format(value);

export function scriptureStatus(record: AtlasRecord): ScriptureStatus {
  return record.kind === 'dialect' && record.scriptureScope !== 'dialect'
    ? 'unknown'
    : record.scriptureStatus;
}

function validLocation(location: AtlasLocation | null): location is AtlasLocation {
  return (
    !!location &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude) &&
    Math.abs(location.latitude) <= 90 &&
    Math.abs(location.longitude) <= 180
  );
}
export function recordLocations(record: AtlasRecord): AtlasLocation[] {
  return (record.locations?.length ? record.locations : [record.location]).filter(validLocation);
}
export function hasLocation(record: AtlasRecord): boolean {
  return recordLocations(record).length > 0;
}
export function isApproximate(record: AtlasRecord): boolean {
  const locations = recordLocations(record);
  return (
    locations.length > 0 &&
    locations.every((location) =>
      ['parent-language', 'country', 'related-people-group'].includes(location.precision)
    )
  );
}
export function filterRecords(records: AtlasRecord[], filters: AtlasFilters): AtlasRecord[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return records.filter((record) => {
    if (
      filters.kind !== 'all' &&
      (filters.kind === 'varieties' ? record.kind === 'people-group' : record.kind !== filters.kind)
    )
      return false;
    if (filters.country && !record.countryCodes.includes(filters.country)) return false;
    if (filters.source && !record.sourceIds.includes(filters.source)) return false;
    const status = scriptureStatus(record);
    if (
      filters.scripture !== 'all' &&
      (filters.scripture === 'no-scripture' || filters.scripture === 'unknown'
        ? scriptureVisualCategory(status, record.kind) !== filters.scripture
        : status !== filters.scripture)
    )
      return false;
    if (filters.placement === 'mapped' && !hasLocation(record)) return false;
    if (filters.placement === 'unmapped' && hasLocation(record)) return false;
    if (filters.placement === 'approximate' && !isApproximate(record)) return false;
    return (
      !query ||
      [
        record.name,
        ...record.aliases,
        record.id,
        record.iso6393,
        record.glottocode,
        record.rolvCode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
        .includes(query)
    );
  });
}
export function countRecords(records: AtlasRecord[]): AtlasCounts {
  const counts: AtlasCounts = {
    records: records.length,
    languages: 0,
    dialects: 0,
    peopleGroups: 0,
    mapped: 0,
    approximate: 0,
    unmapped: 0,
    needsReview: 0,
  };
  for (const record of records) {
    counts[
      record.kind === 'language'
        ? 'languages'
        : record.kind === 'dialect'
          ? 'dialects'
          : 'peopleGroups'
    ]++;
    counts[hasLocation(record) ? 'mapped' : 'unmapped']++;
    if (isApproximate(record)) counts.approximate++;
    if (record.needsReview) counts.needsReview++;
  }
  return counts;
}
export type AtlasFeatures = FeatureCollection<
  Point,
  { recordId: string; locationIndex: number; category: ScriptureVisualCategory }
>;
export function buildFeatures(records: AtlasRecord[]): AtlasFeatures {
  return {
    type: 'FeatureCollection',
    features: records.flatMap((record) =>
      recordLocations(record).map((location, index) => ({
        type: 'Feature' as const,
        id: `${record.id}:${index}`,
        geometry: { type: 'Point' as const, coordinates: [location.longitude, location.latitude] },
        properties: {
          recordId: record.id,
          locationIndex: index,
          category: scriptureVisualCategory(scriptureStatus(record), record.kind),
        },
      }))
    ),
  };
}
function csvCell(value: string | number | null): string {
  const text = String(value ?? '');
  const safe = typeof value === 'string' && /^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function exportCsv(records: AtlasRecord[]): string {
  const headers = [
    'Record ID',
    'Kind',
    'Name',
    'Aliases',
    'ISO 639-3',
    'Glottocode',
    'ROLV',
    'Associated countries',
    'Scripture status',
    'Scripture scope',
    'Parent-language context',
    'Location precision',
    'Latitude',
    'Longitude',
    'Sources',
  ];
  const rows = records.map((record) => [
    record.id,
    record.kind,
    record.name,
    record.aliases.join('; '),
    record.iso6393,
    record.glottocode,
    record.rolvCode,
    record.countryCodes.join('; '),
    scriptureStatus(record),
    record.scriptureScope,
    record.languageContextStatus,
    record.location?.precision ?? 'unmapped',
    record.location?.latitude ?? null,
    record.location?.longitude ?? null,
    record.sourceIds.join('; '),
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
export function safeSourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Keep the actual hit authoritative even at the edge of its larger touch target. */
export function resolveMapHitRecords(
  hitRecordIds: string[],
  nearbyRecordIds: string[],
  records: ReadonlyMap<string, AtlasRecord>
): AtlasRecord[] {
  return [...new Set([...hitRecordIds, ...nearbyRecordIds])].flatMap((id) => {
    const record = records.get(id);
    return record ? [record] : [];
  });
}
