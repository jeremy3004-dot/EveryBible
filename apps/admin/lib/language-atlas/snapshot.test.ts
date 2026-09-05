import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { countRecords, recordLocations } from './model';
import type { AtlasDetail, AtlasIndex } from './types';

const base = new URL('../../data/language-atlas/', import.meta.url);
const index = JSON.parse(gunzipSync(readFileSync(new URL('index.json.gz', base))).toString()) as AtlasIndex;
const byId = new Map(index.records.map((record) => [record.id, record]));

test('the full source snapshot retains separate identities, scoped coverage and usable geography', () => {
  assert.equal(byId.size, index.records.length, 'duplicate record IDs');
  assert.deepEqual(countRecords(index.records), index.counts);
  assert.equal(index.records.filter((record) => record.id.startsWith('rolv:')).length, 12407);
  assert.equal(index.records.filter((record) => record.kind === 'dialect' && record.glottocode).length, 13706);
  const sourceIds = new Set(index.sources.map((source) => source.id));
  const countryIds = new Set(index.countries.map((country) => country.code));
  for (const record of index.records) {
    assert.ok(record.name.trim(), `Missing name: ${record.id}`);
    assert.ok(record.sourceIds.length && record.sourceIds.every((id) => sourceIds.has(id)), record.id);
    assert.ok(record.countryCodes.every((code) => countryIds.has(code)), `Unknown country: ${record.id}`);
    if (record.kind === 'dialect') assert.equal(record.scriptureStatus, 'unknown', record.id);
    const ancestors = new Set([record.id]);
    let parent = record.parentId;
    while (parent) {
      assert.ok(byId.has(parent), `Missing parent ${parent}`);
      assert.ok(!ancestors.has(parent), `Cyclic hierarchy: ${record.id}`);
      ancestors.add(parent);
      parent = byId.get(parent)!.parentId;
    }
    for (const location of recordLocations(record)) {
      assert.ok(sourceIds.has(location.sourceId), record.id);
      assert.ok(location.label.trim(), record.id);
      assert.ok(location.latitude !== 0 || location.longitude !== 0, record.id);
    }
  }
});

test('all sixteen detail shards match their record keys, sources, relationships and recorded checksums', () => {
  const report = JSON.parse(readFileSync(new URL('build-report.json', base), 'utf8')) as {
    artifacts: Record<string, { sha256: string; bytes: number }>;
  };
  const filenames = readdirSync(base).filter((filename) => /^details-[0-9a-f]\.json\.gz$/.test(filename));
  assert.equal(filenames.length, 16);
  const found = new Set<string>();
  for (const filename of filenames) {
    const raw = readFileSync(new URL(filename, base));
    assert.equal(createHash('sha256').update(raw).digest('hex'), report.artifacts[filename].sha256);
    const details = JSON.parse(gunzipSync(raw).toString()) as Record<string, AtlasDetail>;
    for (const [id, detail] of Object.entries(details)) {
      assert.ok(byId.has(id), `Unexpected detail: ${id}`);
      assert.equal(detail.id, id);
      assert.equal(filename, `details-${createHash('sha256').update(id).digest('hex')[0]}.json.gz`);
      assert.ok(!found.has(id), `Duplicated detail: ${id}`);
      found.add(id);
      for (const related of detail.related) assert.ok(byId.has(related.id), `Dangling relation: ${related.id}`);
      for (const evidence of detail.evidence) {
        assert.ok(index.sources.some((source) => source.id === evidence.sourceId), `Unknown evidence source: ${id}`);
      }
    }
  }
  assert.equal(found.size, byId.size, 'Each record must have a detail profile');
});
