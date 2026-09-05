export type AtlasRecordKind = 'language' | 'dialect' | 'people-group';
export type ScriptureStatus = 'bible' | 'nt' | 'portions' | 'started' | 'needed' | 'unknown';
export type ScriptureScope = 'language' | 'dialect' | 'primary-language' | 'unknown';
export type LocationPrecision =
  | 'language-area'
  | 'dialect-area'
  | 'people-group-area'
  | 'related-people-group'
  | 'parent-language'
  | 'country';

export interface AtlasLocation {
  /** Provider entity/region or map-row identifier for auditing this point. */
  sourceRecordId?: string;
  latitude: number;
  longitude: number;
  precision: LocationPrecision;
  sourceId: string;
  label: string;
  countryCode: string | null;
}

/** Search/map fields only. Source evidence is loaded separately on selection. */
export interface AtlasRecord {
  id: string;
  kind: AtlasRecordKind;
  name: string;
  aliases: string[];
  iso6393: string | null;
  glottocode: string | null;
  rolvCode: string | null;
  parentId: string | null;
  family: string | null;
  countryCodes: string[];
  population: number | null;
  scriptureStatus: ScriptureStatus;
  scriptureScope: ScriptureScope;
  languageContextStatus: ScriptureStatus | null;
  location: AtlasLocation | null;
  /** Additional source placements; includes the primary location when present. */
  locations?: AtlasLocation[];
  sourceIds: string[];
  summary: string;
  needsReview: boolean;
}

export interface AtlasSource {
  id: string;
  name: string;
  url: string;
  retrievedAt: string;
  version: string;
  license: string;
  attribution: string;
  note: string;
  recordCount: number;
}

export interface AtlasCounts {
  records: number;
  languages: number;
  dialects: number;
  peopleGroups: number;
  mapped: number;
  approximate: number;
  unmapped: number;
  needsReview: number;
}

export interface AtlasIndex {
  schemaVersion: 1;
  generatedAt: string;
  records: AtlasRecord[];
  countries: { code: string; name: string }[];
  sources: AtlasSource[];
  counts: AtlasCounts;
  notes: string[];
}

export interface AtlasEvidence {
  label: string;
  value: string;
  sourceId: string;
  url: string;
  scope?: string;
}

export interface AtlasRelatedRecord {
  id: string;
  name: string;
  kind: AtlasRecordKind;
  relationship: string;
}

export interface AtlasDetail {
  id: string;
  biography: string;
  evidence: AtlasEvidence[];
  related: AtlasRelatedRecord[];
  notes: string[];
  links: { label: string; url: string; sourceId: string }[];
}

export interface AtlasFilters {
  query: string;
  kind: 'all' | AtlasRecordKind;
  country: string;
  scripture: 'all' | ScriptureStatus;
  placement: 'all' | 'mapped' | 'unmapped' | 'approximate';
  source: string;
}
