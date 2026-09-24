import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { decodePublicAtlas } from './public-atlas-transport';
import { version } from './public-atlas-version.json';
import {
  buildFeatures,
  filterRecords,
  DEFAULT_FILTERS,
} from '../../admin/lib/language-atlas/model';
import { representativePoints } from '../../admin/components/language-atlas/spread-layout';
import type { AtlasIndex } from '../../admin/lib/language-atlas/types';

const data = new URL('../data/language-atlas/', import.meta.url);
const original = JSON.parse(
  gunzipSync(readFileSync(new URL('index.json.gz', data))).toString()
) as AtlasIndex;
// The startup transport omits the generated `summary` (the public map never
// shows it); the decoder restores the field as an empty string.
const expected = {
  ...original,
  records: original.records
    .filter((record) => record.kind !== 'people-group')
    .map((record) => ({ ...record, summary: '' })),
};

test('startup transport restores every displayed field, optional field, profile and placement exactly', () => {
  const gzip = gunzipSync(readFileSync(new URL(`startup-${version}.json.gz`, data)));
  const brotli = brotliDecompressSync(readFileSync(new URL(`startup-${version}.json.br`, data)));
  assert.deepEqual(brotli, gzip);
  assert.equal(createHash('sha256').update(gzip).digest('hex'), version);
  const decoded = decodePublicAtlas(JSON.parse(gzip.toString()));
  assert.deepEqual(decoded, expected);
  assert.deepEqual(buildFeatures(decoded.records), buildFeatures(expected.records));
  assert.deepEqual(representativePoints(decoded.records), representativePoints(expected.records));
  for (const query of ['Phu', 'Agbirigba', 'Momveda', 'eng', '123']) {
    assert.deepEqual(
      filterRecords(decoded.records, { ...DEFAULT_FILTERS, query }),
      filterRecords(expected.records, { ...DEFAULT_FILTERS, query })
    );
  }
  assert.equal(
    JSON.parse(gzip.toString()).recordFields.flat().includes('summary'),
    false,
    'the startup download does not carry the unused generated summaries'
  );
  assert.ok(gzip.byteLength < 12_000_000, 'decoded startup data stays below 12 MB');
  assert.ok(
    readFileSync(new URL(`startup-${version}.json.br`, data)).byteLength < 1_700_000,
    'initial Brotli download stays below 1.7 MB'
  );
});

test('invalid startup formats fail instead of silently displaying an empty atlas', () => {
  assert.throws(() => decodePublicAtlas({ schemaVersion: 1 }), /Invalid atlas/);
  assert.throws(() => decodePublicAtlas({ schemaVersion: 2, records: [] }), /Invalid atlas/);
  assert.throws(() => decodePublicAtlas(null), /Invalid atlas/);
});

// A tiny packed atlas: rows are [layoutIndex, ...values] against the field
// layouts, and record locations are indexes into the shared location table.
const packed = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  generatedAt: '2026-09-06T00:00:00Z',
  countries: [{ code: 'NP', name: 'Nepal' }],
  sources: [],
  notes: [],
  counts: { records: 2 },
  recordFields: [
    ['id', 'name', 'location'],
    ['id', 'name', 'location', 'locations'],
  ],
  locationFields: [['latitude', 'longitude', 'precision']],
  locations: [
    [0, 27.7, 85.3, 'language-area'],
    [0, 28.1, 84.0, 'country'],
  ],
  records: [
    [0, 'iso:unmapped', 'Unmapped', null],
    [1, 'iso:multi', 'Multi', 0, [0, 1]],
  ],
  ...overrides,
});

test('packed rows unpack by their own layout and share location objects by index', () => {
  const decoded = decodePublicAtlas(packed());

  assert.equal(decoded.schemaVersion, 1);
  assert.deepEqual(decoded.countries, [{ code: 'NP', name: 'Nepal' }]);
  assert.equal('recordFields' in decoded, false);
  assert.equal('locations' in decoded, false);
  assert.deepEqual(decoded.records, [
    { id: 'iso:unmapped', name: 'Unmapped', location: null, summary: '' },
    {
      id: 'iso:multi',
      name: 'Multi',
      summary: '',
      location: { latitude: 27.7, longitude: 85.3, precision: 'language-area' },
      locations: [
        { latitude: 27.7, longitude: 85.3, precision: 'language-area' },
        { latitude: 28.1, longitude: 84.0, precision: 'country' },
      ],
    },
  ]);
  assert.equal(decoded.records[1].location, decoded.records[1].locations?.[0]);
});

test('malformed rows and dangling location references fail loudly', () => {
  for (const [records, message] of [
    [['not-a-row'], /Invalid atlas row/],
    [[[5, 'iso:x', 'X', null]], /Invalid atlas row/],
    [[[0.5, 'iso:x', 'X', null]], /Invalid atlas row/],
    [[[0, 'iso:x', 'X']], /Invalid atlas row/],
    [[[0, 'iso:x', 'X', 9]], /Invalid atlas location/],
    [[[0, 'iso:x', 'X', '0']], /Invalid atlas location/],
    [[[1, 'iso:x', 'X', null, [0, 2]]], /Invalid atlas location/],
  ] as const) {
    assert.throws(() => decodePublicAtlas(packed({ records })), message);
  }
  assert.throws(
    () => decodePublicAtlas(packed({ locations: [[0, 1, 2]] })),
    /Invalid atlas row/,
    'a location row must match its layout too'
  );
});
