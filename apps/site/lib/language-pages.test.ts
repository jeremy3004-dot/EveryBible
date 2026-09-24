import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

import type { AtlasIndex, AtlasRecord } from '../../admin/lib/language-atlas/types';
import { languagePageTitle } from './language-page-seo';
import { isLanguageSlug, languageShard } from './language-slug';
import { buildLanguagePages, languagePageFiles, shouldPrerenderLanguage } from './language-pages';
import type { AtlasProject } from './public-atlas-projects';
import projectSnapshot from '../data/language-atlas/projects.json';

function record(overrides: Partial<AtlasRecord> & Pick<AtlasRecord, 'id' | 'name'>): AtlasRecord {
  return {
    kind: 'language',
    aliases: [],
    iso6393: null,
    glottocode: null,
    rolvCode: null,
    parentId: null,
    family: null,
    countryCodes: [],
    population: null,
    scriptureStatus: 'unknown',
    scriptureScope: 'language',
    languageContextStatus: null,
    location: null,
    sourceIds: ['glottolog'],
    summary: 'Generated summary.',
    needsReview: false,
    ...overrides,
  };
}

function atlas(records: AtlasRecord[]): AtlasIndex {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-05',
    records,
    countries: [
      { code: 'NP', name: 'Nepal' },
      { code: 'IN', name: 'India' },
    ],
    sources: [
      {
        id: 'glottolog',
        name: 'Glottolog',
        url: 'https://glottolog.org',
        retrievedAt: '2026-09-01',
        version: '5',
        license: 'CC BY 4.0',
        attribution: 'Glottolog',
        note: 'internal note',
        recordCount: 1,
      },
    ],
    counts: {
      records: records.length,
      languages: 0,
      dialects: 0,
      peopleGroups: 0,
      mapped: 0,
      approximate: 0,
      unmapped: 0,
      needsReview: 0,
    },
    notes: [],
  };
}

const project = (recordId: string | null, name: string): AtlasProject => ({
  ...projectSnapshot.projects[0],
  recordId,
  name,
  languageName: name,
});

const fixture = atlas([
  record({
    id: 'iso:tmg',
    name: 'Tamang',
    iso6393: 'tmg',
    family: 'Sino-Tibetan',
    // Stored alphabetically. The reference point has no country, so the main
    // country is the one whose source placement is nearest to it.
    countryCodes: ['IN', 'NP'],
    location: {
      latitude: 28,
      longitude: 85,
      precision: 'language-area',
      sourceId: 'glottolog',
      label: 'Reference',
      countryCode: null,
    },
    locations: [
      {
        latitude: 20,
        longitude: 78,
        precision: 'language-area',
        sourceId: 'everylanguage',
        label: 'India',
        countryCode: 'IN',
      },
      {
        latitude: 27.9,
        longitude: 85.2,
        precision: 'language-area',
        sourceId: 'everylanguage',
        label: 'Nepal',
        countryCode: 'NP',
      },
    ],
    scriptureStatus: 'nt',
  }),
  record({ id: 'rolv:1', kind: 'dialect', name: 'Tamang: Eastern', parentId: 'iso:tmg' }),
  // The same variety from a second, unreconciled source.
  record({ id: 'glottolog:east1', kind: 'dialect', name: 'Eastern', parentId: 'iso:tmg' }),
  record({
    id: 'rolv:2',
    kind: 'dialect',
    name: 'Tamang: Eastern Rasuwa',
    parentId: 'rolv:1',
    scriptureStatus: 'portions',
    scriptureScope: 'dialect',
  }),
  // A dialect reusing its parent's status without exact scope has no known Scripture itself.
  record({
    id: 'rolv:3',
    kind: 'dialect',
    name: 'Western',
    parentId: 'iso:tmg',
    scriptureStatus: 'bible',
    scriptureScope: 'primary-language',
  }),
  record({ id: 'iso:aaa', name: 'Aari', iso6393: 'aaa', countryCodes: ['NP'] }),
  record({ id: 'glottolog:aari1239', name: 'Aari', glottocode: 'aari1239', countryCodes: ['IN'] }),
  record({ id: 'iso:npi', name: 'Nepali', countryCodes: ['NP'], scriptureStatus: 'bible' }),
  record({ id: 'people:x', kind: 'people-group', name: 'People', countryCodes: ['NP'] }),
]);

test('only languages become pages, each with a unique, valid slug and title label', () => {
  const build = buildLanguagePages(fixture, [], 4);
  assert.deepEqual(
    build.entries.map((entry) => [entry.slug, entry.label]),
    [
      ['aari-aari1239', 'Aari (India)'],
      ['aari-aaa', 'Aari (Nepal)'],
      ['nepali-npi', 'Nepali'],
      ['tamang-tmg', 'Tamang'],
    ]
  );
  assert.equal(build.meta.languageCount, 4);
  assert.deepEqual(build.meta.statusCounts, { bible: 1, nt: 1, unknown: 2 });
  assert.equal(build.meta.shardCount, 4);
});

test('placeholder records from the project tracker are left out of pages, counts and sitemaps', () => {
  const placeholder = (id: string, name: string) =>
    record({ id, name, sourceIds: ['everylanguage'] });
  const build = buildLanguagePages(
    atlas([
      ...fixture.records,
      placeholder('el:5402abf8-0000', 'Test 6a'),
      placeholder('el:d97aa4cd-0000', 'Mangala {Delete}'),
      record({ id: 'rolv:9', kind: 'dialect', name: 'Test dialect', parentId: 'el:5402abf8-0000' }),
      placeholder('el:aaaaaaaa-0000', 'Tip'),
    ]),
    [project('el:5402abf8-0000', 'Test project')],
    4
  );
  assert.deepEqual(
    build.entries.map((entry) => entry.slug),
    ['aari-aari1239', 'aari-aaa', 'nepali-npi', 'tamang-tmg', 'tip-el-aaaaaaaa']
  );
  assert.equal(build.meta.languageCount, 5);
  assert.equal(
    build.shards.reduce((total, shard) => total + Object.keys(shard).length, 0),
    5
  );
});

test('duplicate names fall back to a code, never repeating another language title', () => {
  const build = buildLanguagePages(
    atlas([
      record({ id: 'iso:aaa', name: 'Aari', iso6393: 'aaa', countryCodes: ['NP'] }),
      record({ id: 'glottolog:aari1239', name: 'Aari', countryCodes: ['NP'] }),
      record({ id: 'el:0123abcd-0000', name: 'Aari', iso6393: 'aaa', countryCodes: ['NP'] }),
      // A real name that a generated qualifier would otherwise duplicate.
      record({ id: 'iso:bbb', name: 'Aari (aari1239)' }),
    ]),
    [],
    4
  );
  assert.deepEqual(build.entries.map((entry) => [entry.slug, entry.label]).sort(), [
    ['aari-aaa', 'Aari (aaa)'],
    ['aari-aari1239', 'Aari (aari-aari1239)'],
    ['aari-aari1239-bbb', 'Aari (aari1239)'],
    ['aari-el-0123abcd', 'Aari (el-0123abcd)'],
  ]);
});

test('each page lands in the shard its slug hashes to', () => {
  const build = buildLanguagePages(fixture, [], 4);
  for (const entry of build.entries) {
    assert.ok(build.shards[languageShard(entry.slug, 4)][entry.slug], entry.slug);
  }
  assert.equal(
    build.shards.reduce((total, shard) => total + Object.keys(shard).length, 0),
    4
  );
});

test('a language page lists its main country first and each nested dialect once with its exact-scope status', () => {
  const build = buildLanguagePages(fixture, [], 4);
  const tamang = build.shards[languageShard('tamang-tmg', 4)]['tamang-tmg'];
  assert.equal(tamang.status, 'nt');
  assert.deepEqual(tamang.countries, [
    { code: 'NP', name: 'Nepal' },
    { code: 'IN', name: 'India' },
  ]);
  assert.deepEqual(tamang.dialects, [
    { name: 'Eastern', status: 'unknown' },
    { name: 'Eastern Rasuwa', status: 'portions' },
    { name: 'Western', status: 'unknown' },
  ]);
  assert.equal('summary' in tamang, false, 'the generated one-line summary is not republished');
});

test('related languages are alphabetical neighbours in the primary country', () => {
  const build = buildLanguagePages(fixture, [], 4);
  const nepali = build.shards[languageShard('nepali-npi', 4)]['nepali-npi'];
  assert.deepEqual(nepali.related, {
    country: { code: 'NP', name: 'Nepal' },
    languages: [
      { slug: 'aari-aaa', label: 'Aari (Nepal)', status: 'unknown' },
      { slug: 'tamang-tmg', label: 'Tamang', status: 'nt' },
    ],
  });
});

test('recording projects attach to the language, including through a dialect', () => {
  const build = buildLanguagePages(
    fixture,
    [project('rolv:2', 'Rasuwa Tamang'), project(null, 'Unlinked'), project('iso:npi', 'Nepali')],
    4
  );
  const tamang = build.shards[languageShard('tamang-tmg', 4)]['tamang-tmg'];
  assert.deepEqual(
    tamang.projects.map((item) => item.name),
    ['Rasuwa Tamang']
  );
  assert.deepEqual(
    build.entries.filter((entry) => entry.project).map((entry) => entry.slug),
    ['nepali-npi', 'tamang-tmg']
  );
});

test('a widespread language claims no main country and lists its countries by name', () => {
  const build = buildLanguagePages(
    atlas([
      record({
        id: 'iso:eng',
        name: 'English',
        countryCodes: ['AD', 'GB', 'IM', 'US'],
        location: {
          latitude: 53,
          longitude: -1,
          precision: 'language-area',
          sourceId: 'glottolog',
          label: 'Reference',
          countryCode: null,
        },
      }),
      record({ id: 'iso:ukx', name: 'Other', countryCodes: ['GB'] }),
    ]),
    [],
    4
  );
  const english = build.shards[languageShard('english-eng', 4)]['english-eng'];
  assert.equal(english.related, null);
  assert.deepEqual(
    english.countries.map((country) => country.name),
    ['AD', 'GB', 'IM', 'US'],
    'unknown codes keep their code as the name and sort by it'
  );
});

test('only languages with a Bible, a New Testament or a recording project are prerendered', () => {
  assert.equal(shouldPrerenderLanguage({ status: 'bible', project: false }), true);
  assert.equal(shouldPrerenderLanguage({ status: 'nt', project: false }), true);
  assert.equal(shouldPrerenderLanguage({ status: 'unknown', project: true }), true);
  for (const status of ['portions', 'started', 'needed', 'unknown'] as const) {
    assert.equal(shouldPrerenderLanguage({ status, project: false }), false);
  }
});

test('colliding slugs fail the build instead of silently hiding a language', () => {
  assert.throws(
    () =>
      buildLanguagePages(
        atlas([record({ id: 'iso:abc', name: 'Same' }), record({ id: 'iso:abc', name: 'Same' })]),
        [],
        4
      ),
    /Duplicate language slug/
  );
});

test('sources keep public attribution and drop internal notes', () => {
  const build = buildLanguagePages(fixture, [], 4);
  assert.deepEqual(build.meta.sources, [
    {
      id: 'glottolog',
      name: 'Glottolog',
      url: 'https://glottolog.org',
      attribution: 'Glottolog',
      license: 'CC BY 4.0',
    },
  ]);
});

const pagesDirectory = new URL('../data/language-atlas/pages/', import.meta.url);

test('the committed language pages match the public atlas snapshot', () => {
  const index = JSON.parse(
    gunzipSync(
      readFileSync(new URL('../data/language-atlas/index.json.gz', import.meta.url))
    ).toString()
  ) as AtlasIndex;
  const expected = languagePageFiles(buildLanguagePages(index, projectSnapshot.projects));
  assert.deepEqual(readdirSync(pagesDirectory).sort(), Object.keys(expected).sort());
  for (const [name, value] of Object.entries(expected)) {
    const bytes = readFileSync(new URL(name, pagesDirectory));
    const actual = JSON.parse((name.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString());
    assert.deepEqual(actual, value, `${name} is stale: run npm run atlas:pages:build`);
  }
});

test('every committed language has a unique, URL-safe slug and a unique title label', () => {
  const entries = JSON.parse(
    gunzipSync(readFileSync(new URL('index.json.gz', pagesDirectory))).toString()
  ).languages as { slug: string; label: string }[];
  assert.ok(entries.length > 9000, `${entries.length} languages`);
  assert.equal(new Set(entries.map((entry) => entry.slug)).size, entries.length);
  assert.equal(
    new Set(entries.map((entry) => entry.label.toLocaleLowerCase('en'))).size,
    entries.length
  );
  assert.ok(entries.every((entry) => isLanguageSlug(entry.slug)));
  assert.ok(
    !entries.some((entry) => /^test\b|^testy\b|\{delete\}/i.test(entry.label)),
    'no placeholder records are published'
  );
  assert.ok(entries.some((entry) => entry.slug === 'yoruba-yor'));
  const titles = entries.map((entry) => languagePageTitle(entry));
  assert.equal(new Set(titles.map((title) => title.toLocaleLowerCase('en'))).size, titles.length);
  const tooLong = entries.filter(
    (entry) => entry.label.length <= 42 && languagePageTitle(entry).length > 60
  );
  assert.deepEqual(tooLong, [], 'titles of names up to 42 characters fit in 60');
});
