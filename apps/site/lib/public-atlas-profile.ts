import { formatCount } from '../../admin/lib/language-atlas/model';
import type { AtlasIndex, AtlasRecord } from '../../admin/lib/language-atlas/types';

export interface PublicProfileCountry {
  code: string;
  name: string;
  flag: string;
}

export interface PublicProfilePopulation {
  label: string;
  value: string;
}

export const PROFILE_COUNTRY_PREVIEW_LIMIT = 3;

/** Return a flag only for a valid uppercase ISO-style country code. */
export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...code.split('').map((character) => 127397 + character.charCodeAt(0)));
}

export function profileCountries(record: AtlasRecord, index: AtlasIndex): PublicProfileCountry[] {
  return record.countryCodes.map((code) => {
    const country = index.countries.find((candidate) => candidate.code === code);
    return {
      code,
      name: country?.name ?? code,
      flag: country ? countryFlag(code) : '',
    };
  });
}

export function profileCountryGroups(record: AtlasRecord, index: AtlasIndex): {
  visible: PublicProfileCountry[];
  remaining: PublicProfileCountry[];
} {
  const countries = profileCountries(record, index);
  return {
    visible: countries.slice(0, PROFILE_COUNTRY_PREVIEW_LIMIT),
    remaining: countries.slice(PROFILE_COUNTRY_PREVIEW_LIMIT),
  };
}

export function parentRecord(record: AtlasRecord, index: AtlasIndex): AtlasRecord | null {
  const byId = new Map(index.records.map((candidate) => [candidate.id, candidate]));
  const visited = new Set([record.id]);
  let parentId = record.parentId;
  while (parentId) {
    if (visited.has(parentId)) return null;
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) return null;
    if (parent.kind === 'language') return parent;
    parentId = parent.parentId;
  }
  return null;
}

export function profileIdentity(record: AtlasRecord, index: AtlasIndex): string {
  if (record.kind === 'dialect') {
    const parent = parentRecord(record, index);
    return parent ? `A variety of ${parent.name}.` : 'A dialect or variety.';
  }
  if (record.kind === 'people-group') return 'A people group.';
  return record.family ? `A language in the ${record.family} family.` : 'A language.';
}

export function profileSpokenLocations(record: AtlasRecord, index: AtlasIndex): string[] {
  const countryNames = new Set(profileCountries(record, index).map((country) => country.name));
  const labels = record.spokenLocations
    ?.map((location) => location.label)
    .filter((label) => label.trim().length > 0 && !countryNames.has(label));
  return labels ? [...new Set(labels)] : [];
}

export function profilePopulation(record: AtlasRecord): PublicProfilePopulation | null {
  if (record.population === null || !Number.isFinite(record.population)) return null;
  return { label: 'Reported population', value: formatCount(record.population) };
}
