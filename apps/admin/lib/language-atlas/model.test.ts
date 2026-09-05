import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFeatures,
  countRecords,
  DEFAULT_FILTERS,
  exportCsv,
  filterRecords,
  hasLocation,
  scriptureStatus,
  resolveMapHitRecords,
} from './model';
import type { AtlasRecord } from './types';

const record = (patch: Partial<AtlasRecord> = {}): AtlasRecord => ({
  id: 'grn:00123',
  kind: 'language',
  name: 'Example',
  aliases: ['Local name'],
  iso6393: 'abc',
  glottocode: 'exam1234',
  rolvCode: '00123',
  parentId: null,
  family: 'Example family',
  countryCodes: ['NP'],
  population: null,
  scriptureStatus: 'bible',
  scriptureScope: 'language',
  languageContextStatus: null,
  location: {
    latitude: 28,
    longitude: 84,
    precision: 'language-area',
    sourceId: 'grn',
    label: 'Reference area',
    countryCode: 'NP',
  },
  sourceIds: ['grn'],
  summary: 'A language record.',
  needsReview: false,
  ...patch,
});

test('search finds aliases and exact identifier strings without losing ROLV zeros', () => {
  for (const query of ['LOCAL NAME', 'abc', 'exam1234', '00123', 'grn:00123']) {
    assert.equal(filterRecords([record()], { ...DEFAULT_FILTERS, query }).length, 1);
  }
  assert.equal(filterRecords([record()], { ...DEFAULT_FILTERS, query: 'missing' }).length, 0);
});

test('country uses source associations, not representative dot country, and filters combine', () => {
  const row = record({ countryCodes: ['IN', 'NP'] });
  assert.equal(
    filterRecords([row], { ...DEFAULT_FILTERS, country: 'IN', source: 'grn', scripture: 'bible' })
      .length,
    1
  );
  assert.equal(filterRecords([row], { ...DEFAULT_FILTERS, country: 'IN', source: 'jp' }).length, 0);
  assert.equal(filterRecords([row], { ...DEFAULT_FILTERS, kind: 'dialect' }).length, 0);
});

test('dialects never inherit a verified Scripture claim from language scope', () => {
  const dialect = record({
    kind: 'dialect',
    scriptureScope: 'language',
    languageContextStatus: 'bible',
  });
  assert.equal(scriptureStatus(dialect), 'unknown');
  assert.equal(
    filterRecords([dialect], { ...DEFAULT_FILTERS, kind: 'all', scripture: 'unknown' }).length,
    1
  );
  assert.equal(buildFeatures([dialect]).features[0].properties.category, 'unknown');
  assert.equal(scriptureStatus(record({ kind: 'dialect', scriptureScope: 'dialect' })), 'bible');
});

test('no-scripture filter groups progress states but keeps unknown dialect evidence separate', () => {
  const rows = [
    record({ id: 'started', scriptureStatus: 'started' }),
    record({ id: 'needed', scriptureStatus: 'needed' }),
    record({ id: 'unknown', scriptureStatus: 'unknown' }),
    record({
      id: 'inherited-dialect',
      kind: 'dialect',
      scriptureStatus: 'needed',
      scriptureScope: 'language',
    }),
  ];

  assert.deepEqual(
    filterRecords(rows, { ...DEFAULT_FILTERS, kind: 'all', scripture: 'no-scripture' }).map(
      (row) => row.id
    ),
    ['started', 'needed']
  );
  assert.deepEqual(
    filterRecords(rows, { ...DEFAULT_FILTERS, kind: 'all', scripture: 'unknown' }).map(
      (row) => row.id
    ),
    ['unknown', 'inherited-dialect']
  );
});

test('invalid and missing coordinates remain searchable and count as unmapped', () => {
  const rows = [
    record(),
    record({ id: 'missing', location: null }),
    record({ id: 'bad', location: { ...record().location!, latitude: 91 } }),
  ];
  assert.equal(hasLocation(rows[2]), false);
  assert.equal(buildFeatures(rows).features.length, 1);
  assert.equal(filterRecords(rows, { ...DEFAULT_FILTERS, placement: 'unmapped' }).length, 2);
  assert.equal(countRecords(rows).unmapped, 2);
  assert.equal(hasLocation(record({ location: { ...record().location!, longitude: NaN } })), false);
});

test('approximate locations are a mapped subset and counts are records', () => {
  const rows = [
    record(),
    record({
      id: 'dialect',
      kind: 'dialect',
      location: { ...record().location!, precision: 'parent-language' },
    }),
    record({ id: 'pg', kind: 'people-group', location: null }),
  ];
  assert.deepEqual(countRecords(rows), {
    records: 3,
    languages: 1,
    dialects: 1,
    peopleGroups: 1,
    mapped: 2,
    approximate: 1,
    unmapped: 1,
    needsReview: 0,
  });
  assert.equal(
    filterRecords(rows, { ...DEFAULT_FILTERS, kind: 'all', placement: 'approximate' }).length,
    1
  );
});

test('coincident records remain separate lightweight map features', () => {
  const features = buildFeatures([record(), record({ id: 'second' })]).features;
  assert.equal(features.length, 2);
  assert.deepEqual(features[0].geometry.coordinates, features[1].geometry.coordinates);
  assert.deepEqual(Object.keys(features[0].properties).sort(), [
    'category',
    'locationIndex',
    'recordId',
  ]);
});

test('CSV escapes formulas, quotes and line breaks, and separates Scripture context', () => {
  const csv = exportCsv([
    record({
      name: '=HYPERLINK("bad")',
      summary: 'Line one\nLine two',
      kind: 'dialect',
      languageContextStatus: 'nt',
    }),
  ]);
  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/);
  assert.match(csv, /"00123"/);
  assert.match(csv, /"unknown","language","nt"/);
  assert.match(exportCsv([record({ name: '\t=BAD' })]), /"'\t=BAD"/);
});

test('all source placements are retained with stable identities and valid bounds', () => {
  const row = record({
    locations: [
      record().location!,
      { ...record().location!, longitude: 12 },
      { ...record().location!, latitude: Infinity },
    ],
  });
  const features = buildFeatures([row]).features;
  assert.equal(features.length, 2);
  assert.notEqual(features[0].id, features[1].id);
  assert.equal(features[1].properties.locationIndex, 1);
  assert.equal(countRecords([row]).mapped, 1);
});

test('CSV keeps valid negative coordinate numbers numeric while escaping text formulas', () => {
  const csv = exportCsv([record({ location: { ...record().location!, longitude: -84 } })]);
  assert.match(csv, /"28","-84"/);
  assert.doesNotMatch(csv, /"'-84"/);
});

test('a valid touch-target edge hit selects even when the visible-dot query is empty', () => {
  const row = record();
  const records = new Map([[row.id, row]]);
  assert.deepEqual(resolveMapHitRecords([row.id], [], records), [row]);
});

test('the actual hit stays first while overlapping locations merge into unique records', () => {
  const first = record();
  const second = record({ id: 'other-location' });
  const records = new Map([
    [first.id, first],
    [second.id, second],
  ]);
  assert.deepEqual(
    resolveMapHitRecords([first.id], [second.id, first.id, second.id, 'stale-id'], records),
    [first, second]
  );
});
