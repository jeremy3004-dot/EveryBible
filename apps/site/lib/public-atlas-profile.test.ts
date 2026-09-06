import assert from 'node:assert/strict';
import test from 'node:test';
import type { AtlasIndex, AtlasRecord } from '../../admin/lib/language-atlas/types';
import {
  countryFlag,
  parentRecord,
  profileCountryGroups,
  profileCountries,
  profileIdentity,
  profilePopulation,
  profileSpokenLocations,
} from './public-atlas-profile';

type SpokenLocation = { label: string; countryCode: string | null; sourceId: string };
type RecordOverrides = Partial<AtlasRecord> & { spokenLocations?: SpokenLocation[] };

const record = (overrides: RecordOverrides = {}): AtlasRecord => ({
  id: 'glottolog:test',
  kind: 'dialect',
  name: 'Momveda',
  aliases: [],
  iso6393: 'pae',
  glottocode: 'momv1238',
  rolvCode: null,
  parentId: 'iso:pae',
  family: 'Atlantic-Congo',
  countryCodes: ['CD'],
  population: null,
  scriptureStatus: 'unknown',
  scriptureScope: 'unknown',
  languageContextStatus: 'nt',
  location: null,
  sourceIds: ['glottolog'],
  summary: 'Raw provider summary with exact-variety status wording.',
  needsReview: false,
  ...overrides,
});

const index = (records: AtlasRecord[]): AtlasIndex => ({
  schemaVersion: 1,
  generatedAt: '2026-09-06T00:00:00Z',
  records,
  countries: [
    { code: 'CD', name: 'DR Congo' },
    { code: 'NP', name: 'Nepal' },
    { code: 'BAD', name: 'Uncoded place' },
  ],
  sources: [],
  counts: {
    records: records.length,
    languages: 1,
    dialects: 1,
    peopleGroups: 0,
    mapped: 0,
    approximate: 0,
    unmapped: records.length,
    needsReview: 0,
  },
  notes: [],
});

test('dialects use resolved parent identity and keep parent Scripture scope separate', () => {
  const parent = record({
    id: 'iso:pae',
    kind: 'language',
    name: 'Pagibete',
    parentId: null,
    languageContextStatus: null,
    scriptureStatus: 'nt',
    scriptureScope: 'language',
  });
  const momveda = record();
  const atlas = index([momveda, parent]);
  assert.equal(parentRecord(momveda, atlas)?.name, 'Pagibete');
  assert.equal(profileIdentity(momveda, atlas), 'A variety of Pagibete.');
});

test('country display preserves names while omitting flags for invalid codes', () => {
  const momveda = record({ countryCodes: ['CD', 'NP', 'BAD', 'ZZ'] });
  const countries = profileCountries(momveda, index([momveda]));
  assert.deepEqual(countries, [
    { code: 'CD', name: 'DR Congo', flag: '🇨🇩' },
    { code: 'NP', name: 'Nepal', flag: '🇳🇵' },
    { code: 'BAD', name: 'Uncoded place', flag: '' },
    { code: 'ZZ', name: 'ZZ', flag: '' },
  ]);
  assert.equal(countryFlag('bad'), '');
  assert.equal(countryFlag('??'), '');
});

test('dialect ancestry resolves the nearest language ancestor, not an intermediate dialect', () => {
  const tigre = record({
    id: 'iso:tig',
    kind: 'language',
    name: 'Tigre',
    parentId: null,
    scriptureStatus: 'bible',
    scriptureScope: 'language',
    languageContextStatus: null,
  });
  const northWestern = record({
    id: 'glottolog:nort3292',
    name: 'North-Western Tigre',
    parentId: tigre.id,
    languageContextStatus: 'bible',
  });
  const algaden = record({
    id: 'glottolog:alga1234',
    name: 'Algaden',
    parentId: northWestern.id,
    scriptureStatus: 'unknown',
    scriptureScope: 'unknown',
    languageContextStatus: 'bible',
  });
  const atlas = index([algaden, northWestern, tigre]);
  assert.equal(parentRecord(algaden, atlas)?.name, 'Tigre');
  assert.equal(profileIdentity(algaden, atlas), 'A variety of Tigre.');
  assert.equal(algaden.scriptureStatus, 'unknown');
});

test('missing and cyclic parent chains have no guessed ancestor', () => {
  const missing = record({ parentId: 'iso:missing' });
  assert.equal(parentRecord(missing, index([missing])), null);
  const first = record({ id: 'dialect:first', parentId: 'dialect:second' });
  const second = record({ id: 'dialect:second', parentId: first.id });
  assert.equal(parentRecord(first, index([first, second])), null);
  assert.equal(profileIdentity(first, index([first, second])), 'A dialect or variety.');
});

test('country preview keeps the first three in source order and groups the remainder', () => {
  const language = record({
    kind: 'language',
    parentId: null,
    countryCodes: ['CD', 'NP', 'BAD', 'US'],
  });
  const atlas = index([language]);
  atlas.countries.push({ code: 'US', name: 'United States' });
  const groups = profileCountryGroups(language, atlas);
  assert.deepEqual(groups.visible.map((country) => country.code), ['CD', 'NP', 'BAD']);
  assert.deepEqual(groups.remaining.map((country) => country.code), ['US']);
  assert.equal(profileCountryGroups(record(), index([record()])).remaining.length, 0);
});

test('language identity uses its known family while keeping a concise fallback', () => {
  const language = record({
    id: 'iso:pae',
    kind: 'language',
    parentId: null,
    family: 'Atlantic-Congo',
  });
  assert.equal(profileIdentity(language, index([language])), 'A language in the Atlantic-Congo family.');
  const unclassified = { ...language, family: null };
  assert.equal(profileIdentity(unclassified, index([unclassified])), 'A language.');
});

test('spoken locations use only record labels, preserve order, and deduplicate exact repeats', () => {
  const momveda = record({
    countryCodes: ['CD'],
    spokenLocations: [
      { label: 'Bas-Uele', countryCode: 'CD', sourceId: 'grn' },
      { label: 'DR Congo', countryCode: 'CD', sourceId: 'grn' },
      { label: 'Likati', countryCode: 'CD', sourceId: 'grn' },
      { label: 'Bas-Uele', countryCode: 'CD', sourceId: 'everylanguage' },
    ],
  });
  const atlas = index([momveda]);
  assert.deepEqual(profileSpokenLocations(momveda, atlas), ['Bas-Uele', 'Likati']);
  assert.deepEqual(profileSpokenLocations(record(), index([record()])), []);
});

test('population stays omitted when unsupported and does not inherit from parent', () => {
  const parent = record({ id: 'iso:pae', kind: 'language', population: 8000 });
  const momveda = record({ population: null });
  assert.equal(profilePopulation(momveda), null);
  assert.equal(profilePopulation(parent)?.value, '8,000');
});
