import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

import type { AtlasIndex, AtlasRecord } from '../../admin/lib/language-atlas/types';
import { languagePageTitle } from './language-page-seo';
import { isLanguageSlug, languageShard } from './language-slug';
import {
  buildLanguagePages,
  isThinLanguage,
  LANGUAGE_PAGE_SHARD_COUNT,
  languagePageFiles,
  rollUpScriptureStatus,
  shouldPrerenderLanguage,
  type LanguagePage,
} from './language-pages';
import type { AtlasProject } from './public-atlas-projects';
import isoMacrolanguages from '../data/language-atlas/iso-639-3-macrolanguages.json';
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

const pageFor = (build: ReturnType<typeof buildLanguagePages>, slug: string): LanguagePage =>
  build.shards[languageShard(slug, 4)][slug];

test('a macrolanguage takes the best status among its members, credited to them', () => {
  const build = buildLanguagePages(
    atlas([
      record({ id: 'iso:ara', name: 'Arabic', iso6393: 'ara', countryCodes: ['NP'] }),
      record({ id: 'iso:arb', name: 'Standard Arabic', iso6393: 'arb', scriptureStatus: 'bible' }),
      record({ id: 'iso:apd', name: 'Sudanese Arabic', iso6393: 'apd', scriptureStatus: 'bible' }),
      record({ id: 'iso:afb', name: 'Gulf Arabic', iso6393: 'afb', scriptureStatus: 'portions' }),
      record({ id: 'iso:aao', name: 'Algerian Saharan Arabic', iso6393: 'aao' }),
      // A macrolanguage whose own record already has a Bible keeps its own status.
      record({ id: 'iso:aka', name: 'Akan', iso6393: 'aka', scriptureStatus: 'bible' }),
      record({ id: 'iso:twi', name: 'Twi', iso6393: 'twi', scriptureStatus: 'nt' }),
      // No member with Scripture: still no known Scripture.
      record({ id: 'iso:jrb', name: 'Judeo-Arabic', iso6393: 'jrb' }),
      record({ id: 'iso:yhd', name: 'Judeo-Iraqi Arabic', iso6393: 'yhd' }),
    ]),
    [],
    4,
    { ara: ['aao', 'afb', 'apd', 'arb', 'zzz'], aka: ['fat', 'twi'], jrb: ['yhd'] }
  );

  const arabic = pageFor(build, 'arabic-ara');
  assert.equal(arabic.status, 'bible');
  assert.deepEqual(
    arabic.statusVia.map((member) => member.label),
    ['Standard Arabic', 'Sudanese Arabic']
  );
  assert.deepEqual(
    arabic.members.map((member) => [member.slug, member.status]),
    [
      ['standard-arabic-arb', 'bible'],
      ['sudanese-arabic-apd', 'bible'],
      ['gulf-arabic-afb', 'portions'],
      ['algerian-saharan-arabic-aao', 'unknown'],
    ],
    'members with a page, best status first; codes without a page are skipped'
  );
  assert.deepEqual(pageFor(build, 'standard-arabic-arb').memberOf, [
    { slug: 'arabic-ara', label: 'Arabic', status: 'bible' },
  ]);
  assert.equal(build.entries.find((entry) => entry.slug === 'arabic-ara')?.status, 'bible');

  const akan = pageFor(build, 'akan-aka');
  assert.equal(akan.status, 'bible');
  assert.deepEqual(akan.statusVia, []);

  const judeoArabic = pageFor(build, 'judeo-arabic-jrb');
  assert.equal(judeoArabic.status, 'unknown');
  assert.deepEqual(judeoArabic.statusVia, []);
  assert.equal(judeoArabic.members.length, 1);

  assert.deepEqual(pageFor(build, 'gulf-arabic-afb').members, [], 'members are not macrolanguages');
});

test('the roll-up never reports no known Scripture while a member has some', () => {
  const member = (status: LanguagePage['status']) => ({ slug: status, label: status, status });
  assert.deepEqual(rollUpScriptureStatus('unknown', []), { status: 'unknown', via: [] });
  assert.deepEqual(rollUpScriptureStatus('unknown', [member('needed'), member('portions')]), {
    status: 'portions',
    via: [member('portions')],
  });
  assert.deepEqual(rollUpScriptureStatus('nt', [member('nt'), member('portions')]), {
    status: 'nt',
    via: [],
  });
  assert.deepEqual(rollUpScriptureStatus('portions', [member('bible')]).status, 'bible');
});

test('pages with no code and no country are thin: out of the sitemap, noindex or canonical', () => {
  assert.equal(
    isThinLanguage({ iso6393: null, glottocode: null, rolvCode: null, countryCodes: [] }),
    true
  );
  assert.equal(
    isThinLanguage({ iso6393: null, glottocode: null, rolvCode: null, countryCodes: ['NP'] }),
    false
  );
  assert.equal(
    isThinLanguage({ iso6393: null, glottocode: 'abcd1234', rolvCode: null, countryCodes: [] }),
    false
  );

  const tracker = (id: string, name: string, countryCodes: string[] = []) =>
    record({ id, name, sourceIds: ['everylanguage'], countryCodes });
  const build = buildLanguagePages(
    atlas([
      ...fixture.records,
      tracker('el:11111111-0000', 'tamang'),
      tracker('el:22222222-0000', 'Aari'),
      tracker('el:33333333-0000', 'Oung'),
      tracker('el:44444444-0000', 'Kham', ['NP']),
    ]),
    [],
    4
  );

  const duplicate = pageFor(build, 'tamang-el-11111111');
  assert.equal(duplicate.canonicalSlug, 'tamang-tmg', 'an exact (case-insensitive) name match');
  assert.equal(duplicate.indexable, true);

  const ambiguous = pageFor(build, 'aari-el-22222222');
  assert.equal(ambiguous.canonicalSlug, 'aari-el-22222222', 'two coded Aari languages: no guess');
  assert.equal(ambiguous.indexable, false);

  const unique = pageFor(build, 'oung-el-33333333');
  assert.equal(unique.canonicalSlug, 'oung-el-33333333');
  assert.equal(unique.indexable, false);

  assert.equal(pageFor(build, 'tamang-tmg').label, 'Tamang', 'the coded language keeps the name');
  assert.equal(duplicate.label, 'tamang (el-11111111)');

  const withCountry = pageFor(build, 'kham-el-44444444');
  assert.equal(withCountry.indexable, true);
  assert.equal(withCountry.canonicalSlug, 'kham-el-44444444');

  assert.deepEqual(
    build.entries.filter((entry) => !entry.sitemap).map((entry) => entry.slug),
    ['aari-el-22222222', 'oung-el-33333333', 'tamang-el-11111111']
  );
  assert.equal(build.meta.languageCount, 8, 'thin pages are still pages');
  assert.equal(build.meta.sitemapCount, 5);
});

test('page names are cleaned for display while slugs keep the source name', () => {
  const build = buildLanguagePages(
    atlas([
      record({
        id: 'el:55555555-0000',
        name: 'Marwari.',
        aliases: ['Marwari', 'Marvari:', 'Marvari  '],
        countryCodes: ['IN'],
        sourceIds: ['everylanguage'],
      }),
      record({
        id: 'rolv:7',
        kind: 'dialect',
        name: 'Marwari.: Dhundari.',
        parentId: 'el:55555555-0000',
      }),
      record({
        id: 'rolv:8',
        kind: 'dialect',
        name: 'Bhatri {Delete}1',
        parentId: 'el:55555555-0000',
      }),
      record({
        id: 'rolv:9',
        kind: 'dialect',
        name: 'Bhatri {Delete}2',
        parentId: 'el:55555555-0000',
      }),
      record({ id: 'iso:tvu', name: 'Tunen  (change to tvu)', iso6393: 'tvu' }),
    ]),
    [],
    4
  );
  const marwari = pageFor(build, 'marwari-el-55555555');
  assert.equal(marwari.name, 'Marwari');
  assert.equal(marwari.label, 'Marwari');
  assert.deepEqual(marwari.aliases, ['Marvari']);
  assert.deepEqual(marwari.dialects, [
    { name: 'Bhatri', status: 'unknown' },
    { name: 'Dhundari', status: 'unknown' },
  ]);
  assert.equal(pageFor(build, 'tunen-change-to-tvu-tvu').name, 'Tunen');
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
  const expected = languagePageFiles(
    buildLanguagePages(
      index,
      projectSnapshot.projects,
      LANGUAGE_PAGE_SHARD_COUNT,
      isoMacrolanguages.macrolanguages
    )
  );
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

test('committed macrolanguage pages show their members, never red while a member has Scripture', () => {
  const pages: Record<string, LanguagePage> = Object.assign(
    {},
    ...readdirSync(pagesDirectory)
      .filter((name) => name.startsWith('shard-'))
      .map((name) => JSON.parse(gunzipSync(readFileSync(new URL(name, pagesDirectory))).toString()))
  );
  const macrolanguages = Object.values(pages).filter((page) => page.members.length > 0);
  assert.ok(macrolanguages.length >= 45, `${macrolanguages.length} macrolanguage pages`);
  for (const page of macrolanguages) {
    if (page.members.some((member) => member.status !== 'unknown'))
      assert.notEqual(page.status, 'unknown', page.slug);
  }
  const arabic = pages['arabic-ara'];
  assert.equal(arabic.label, 'Arabic');
  assert.equal(arabic.status, 'bible');
  assert.ok(arabic.statusVia.some((member) => member.slug === 'standard-arabic-arb'));
  assert.ok(
    pages['standard-arabic-arb'].memberOf.some(
      (macrolanguage) => macrolanguage.slug === 'arabic-ara'
    )
  );
  const thin = Object.values(pages).filter((page) =>
    isThinLanguage({ ...page, countryCodes: page.countries.map((country) => country.code) })
  );
  assert.ok(thin.length > 600, `${thin.length} thin pages`);
  assert.ok(thin.every((page) => page.canonicalSlug !== page.slug || !page.indexable));
});
