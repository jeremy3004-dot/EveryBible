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

test('reviewed Jumli varieties have one identity each while distinct varieties stay separate', () => {
  for (const [rolv, glottocode, oldName] of [
    ['26074', 'assi1246', 'Assi'],
    ['26075', 'chau1257', 'Chaudhabis'],
    ['26076', 'paac1238', 'Paachsai'],
    ['26077', 'sinj1240', 'Sinja'],
  ]) {
    const canonical = byId.get(`rolv:${rolv}`)!;
    assert.ok(canonical, rolv);
    assert.equal(canonical.glottocode, glottocode);
    assert.ok(canonical.alternateIds?.includes(`glottolog:${glottocode}`));
    assert.ok(canonical.aliases.includes(oldName));
    assert.ok(!byId.has(`glottolog:${glottocode}`));
    assert.equal(canonical.parentId, 'iso:jml');
    assert.equal(canonical.scriptureStatus, 'unknown');
    assert.equal(canonical.languageContextStatus, 'portions');
  }
  assert.ok(byId.has('iso:jml'));
  assert.ok(byId.has('el:18230236-977a-4f37-a433-fdcf36c72804'), 'Jumleli remains distinct pending classification review');
});

test('retained source identifiers resolve to exactly one canonical record', () => {
  const identities = new Set(byId.keys());
  for (const record of index.records) {
    for (const id of record.alternateIds ?? []) {
      assert.ok(!identities.has(id), `Ambiguous retained identity: ${id}`);
      identities.add(id);
    }
  }
});

test('reviewed Mwini identity preserves disputed geography and the separate Baravenes record', () => {
  const mwini = byId.get('rolv:16982')!;
  assert.equal(mwini.glottocode, 'mwin1241');
  assert.ok(mwini.alternateIds?.includes('glottolog:mwin1241'));
  assert.deepEqual(mwini.countryCodes, ['SO', 'TZ']);
  assert.equal(mwini.needsReview, true);
  assert.equal(mwini.scriptureStatus, 'unknown');
  assert.ok(recordLocations(mwini).some((point) => point.latitude === 0.93435 && point.longitude === 43.56061));
  assert.ok(byId.has('rolv:22701'));
});

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


test('second-pass named village varieties reconcile without flattening distinct dialects', () => {
  const groups = [
    ['10196', 'jaga1246', 'ghh'], ['10197', 'khor1243', 'ghh'],
    ['10198', 'nyak1258', 'ghh'], ['10199', 'phil1244', 'ghh'],
    ['10200', 'uiya1236', 'ghh'], ['26424', 'chuk1269', 'skj'],
    ['26425', 'tang1333', 'skj'], ['26426', 'teta1238', 'skj'],
  ];
  for (const [rolv, glottocode, parent] of groups) {
    const record = byId.get(`rolv:${rolv}`)!;
    assert.equal(record.glottocode, glottocode);
    assert.ok(record.alternateIds?.includes(`glottolog:${glottocode}`));
    assert.ok(!byId.has(`glottolog:${glottocode}`));
    assert.equal(record.parentId, `iso:${parent}`);
    assert.equal(record.scriptureStatus, 'unknown');
  }
  assert.equal(new Set(groups.map(([id]) => byId.get(`rolv:${id}`))).size, 8);
  for (const id of ['rolv:00673', 'glottolog:solu1238', 'glottolog:khum1246',
    'rolv:15082', 'glottolog:lhoo1238', 'rolv:02692', 'glottolog:bagl1238']) {
    assert.ok(byId.has(id), `Uncertain scope or hierarchy must stay separate: ${id}`);
  }
});


test('second-pass Australian aliases resolve to one variety with retained spellings', () => {
  for (const [rolv, glottocode, alias] of [
    ['09317', 'ngal1294', 'Ngaliwerra'], ['14875', 'bili1250', 'Pilinara'],
    ['18137', 'djuw1238', 'Tjuwalinj'], ['18142', 'binb1242', 'Binbinga'],
  ]) {
    const record = byId.get(`rolv:${rolv}`)!;
    assert.equal(record.glottocode, glottocode);
    assert.ok(record.alternateIds?.includes(`glottolog:${glottocode}`));
    assert.ok(record.aliases.includes(alias));
    assert.deepEqual(record.countryCodes, ['AU']);
    assert.equal(record.scriptureStatus, 'unknown');
  }
});


test('equivalent Kyrgyz labels reconcile while north, south and China remain distinct', () => {
  for (const [rolv, glotto, spelling] of [
    ['12042', 'nort2693', 'Northern Kirghiz'],
    ['26797', 'sout2702', 'Southern Kirghiz'],
  ]) {
    const record = byId.get(`rolv:${rolv}`)!;
    assert.equal(record.glottocode, glotto);
    assert.ok(record.alternateIds?.includes(`glottolog:${glotto}`));
    assert.ok(record.aliases.includes(spelling));
    assert.equal(record.parentId, 'iso:kir');
    assert.equal(record.scriptureStatus, 'unknown');
    assert.equal(record.languageContextStatus, 'bible');
  }
  assert.ok(byId.has('rolv:12041'), 'China scope is not identical to Northern Kyrgyz');
  assert.notEqual(byId.get('rolv:12042'), byId.get('rolv:26797'));
});


test('every reviewed identity group resolves to its declared canonical record', () => {
  const decisions = JSON.parse(readFileSync(new URL('../../../../data/language-atlas/reconciliation-decisions.json', import.meta.url), 'utf8')) as {
    groups: Array<{ canonicalId: string; duplicateIds: string[] }>;
  };
  for (const group of decisions.groups) {
    const canonical = byId.get(group.canonicalId);
    assert.ok(canonical, `Missing canonical ${group.canonicalId}`);
    for (const duplicateId of group.duplicateIds) {
      assert.ok(!byId.has(duplicateId), `Unreconciled approved duplicate ${duplicateId}`);
      assert.ok(canonical.alternateIds?.includes(duplicateId), `Lost source identity ${duplicateId}`);
    }
  }
});
