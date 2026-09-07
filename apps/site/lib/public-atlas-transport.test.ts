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
const expected = {
  ...original,
  records: original.records.filter((record) => record.kind !== 'people-group'),
};

test('startup transport restores every public field, optional field, profile and placement exactly', () => {
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
  assert.ok(gzip.byteLength < 20_000_000, 'decoded startup data stays below 20 MB');
  assert.ok(
    readFileSync(new URL(`startup-${version}.json.br`, data)).byteLength < 2_200_000,
    'initial Brotli download stays below 2.2 MB'
  );
});

test('invalid startup formats fail instead of silently displaying an empty atlas', () => {
  assert.throws(() => decodePublicAtlas({ schemaVersion: 1 }), /Invalid atlas/);
  assert.throws(() => decodePublicAtlas({ schemaVersion: 2, records: [] }), /Invalid atlas/);
});
