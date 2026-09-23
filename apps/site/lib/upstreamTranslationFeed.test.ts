import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import manifest from './r2-text-pack-manifest.json';
import { fetchUpstreamTranslations } from './upstreamTranslationFeed';

const manifestSha = (translationId: string) =>
  manifest.items.find((item) => item.translationId === translationId)!.sha256;

// fetchUpstreamTranslations reads the committed r2-text-pack-manifest.json and
// the live eBible CSV. The manifest is used as-is; only the CSV fetch is faked.
const HEADER =
  '"languageCode","translationId","languageName","languageNameInEnglish","title","Redistributable","Copyright","OTbooks","NTbooks","textDirection","downloadable","shortTitle"';

function csvRow(fields: Record<string, string>): string {
  const values = {
    languageCode: 'eng',
    translationId: '',
    languageName: 'English',
    languageNameInEnglish: 'English',
    title: '',
    Redistributable: 'True',
    Copyright: 'Copyright © 2020 Example',
    OTbooks: '39',
    NTbooks: '27',
    textDirection: 'ltr',
    downloadable: 'True',
    shortTitle: '',
    ...fields,
  };
  return Object.values(values)
    .map((value) => `"${value.replace(/"/g, '""')}"`)
    .join(',');
}

const NOW = '2026-09-24T12:00:00.000Z';
let requests: { url: string; init: RequestInit | undefined }[] = [];
let respond: () => Response = () => new Response('');

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

test.after(() => {
  if (originalSiteUrl !== undefined) process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

test.beforeEach(() => {
  // Catalog download URLs are built against the production site by default.
  delete process.env.NEXT_PUBLIC_SITE_URL;
  requests = [];
  mock.timers.enable({ apis: ['Date'], now: new Date(NOW) });
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return respond();
  });
});

test.afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
});

test('the feed requests the eBible catalogue uncached as CSV', async () => {
  respond = () => new Response(HEADER);

  assert.deepEqual(await fetchUpstreamTranslations(), []);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://ebible.org/Scriptures/translations.csv');
  assert.equal(requests[0].init?.cache, 'no-store');
  assert.deepEqual(requests[0].init?.headers, {
    Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8',
  });
});

test('a translation with an R2 text pack is published as an available sqlite catalog entry', async () => {
  respond = () =>
    new Response(
      [
        HEADER,
        csvRow({
          translationId: 'npiulb',
          languageCode: 'npi',
          languageName: 'नेपाली',
          languageNameInEnglish: 'Nepali',
          shortTitle: 'पवित्र बाइबल',
          Copyright: 'Copyright © 2019 Door43 World Missions Community',
        }),
      ].join('\n')
    );

  assert.deepEqual(await fetchUpstreamTranslations(), [
    {
      abbreviation: 'Nepali Bible',
      catalog: {
        text: {
          downloadUrl: 'https://everybible.app/api/media/text/npiulb/npiulb-2026.03.24-v1.db',
          format: 'sqlite',
          sha256: manifestSha('npiulb'),
          verseCount: 31102,
          version: '2026.03.24-v1',
        },
        updatedAt: '2026-04-02T12:48:40.236Z',
        version: '2026.03.24-v1-r2-text-v1',
      },
      hasAudio: false,
      hasText: true,
      isAvailable: true,
      languageCode: 'npi',
      languageName: 'Nepali',
      licenseType: 'copyright',
      licenseUrl: 'https://ebible.org/Scriptures/npiulb',
      name: 'Nepali Bible',
      sourceUrl: 'https://ebible.org/Scriptures/npiulb',
      translationId: 'npiulb',
      versions: [
        {
          changelog: null,
          dataChecksum: manifestSha('npiulb'),
          isCurrent: true,
          publishedAt: '2026-04-02T12:48:40.236Z',
          totalBooks: 66,
          totalChapters: null,
          totalVerses: 31102,
          versionNumber: 1,
        },
      ],
    },
  ]);
});

test('a translation without a text pack stays listed but unavailable, named from the CSV', async () => {
  respond = () =>
    new Response(
      [
        HEADER,
        csvRow({
          translationId: 'xyzabc',
          languageCode: 'xyz',
          languageNameInEnglish: 'Xyzish, "Highland"',
          shortTitle: 'Xyz Bible, 2nd "edition"',
          Copyright: '',
        }),
      ].join('\n')
    );

  const [record] = await fetchUpstreamTranslations();

  assert.equal(record.translationId, 'xyzabc');
  assert.equal(record.abbreviation, 'XYZABC');
  assert.equal(record.name, 'Xyz Bible, 2nd "edition"');
  assert.equal(record.languageName, 'Xyzish, "Highland"');
  assert.equal(record.licenseType, 'public-domain');
  assert.equal(record.isAvailable, false);
  assert.equal(record.catalog, undefined);
  assert.deepEqual(record.versions[0], {
    changelog: null,
    dataChecksum: null,
    isCurrent: true,
    publishedAt: NOW,
    totalBooks: 66,
    totalChapters: null,
    totalVerses: null,
    versionNumber: 1,
  });
});

test('only complete, redistributable, downloadable Bibles are published', async () => {
  respond = () =>
    new Response(
      [
        HEADER,
        csvRow({ translationId: 'eng-asv' }),
        csvRow({ translationId: 'ntonly', OTbooks: '0' }),
        csvRow({ translationId: 'restricted', Redistributable: 'False' }),
        csvRow({ translationId: 'nodownload', downloadable: 'false' }),
        csvRow({ translationId: 'withdc', OTbooks: '39', NTbooks: '26' }),
        csvRow({ translationId: '' }),
      ].join('\n')
    );

  assert.deepEqual(
    (await fetchUpstreamTranslations()).map((record) => record.translationId),
    ['eng-asv']
  );
});

test('eng-kjv is republished once under the canonical kjv id, after the other rows', async () => {
  respond = () =>
    new Response(
      [
        HEADER,
        csvRow({ translationId: 'eng-kjv', shortTitle: 'King James Version + Apocrypha' }),
        csvRow({ translationId: 'eng-asv' }),
      ].join('\n')
    );

  const records = await fetchUpstreamTranslations();

  assert.deepEqual(
    records.map((record) => record.translationId),
    ['eng-asv', 'kjv']
  );
  const kjv = records[1];
  assert.equal(kjv.name, 'King James Version');
  assert.equal(kjv.abbreviation, 'KJV');
  assert.equal(kjv.isAvailable, true);
  assert.equal(kjv.sourceUrl, 'https://ebible.org/Scriptures/eng-kjv');
  assert.equal(
    kjv.catalog?.text?.downloadUrl,
    'https://everybible.app/api/media/text/kjv/kjv-2026.04.03-v1.db'
  );
  assert.equal(kjv.hasAudio, true);
});

test('the kjv override is omitted when eng-kjv is not an eligible upstream row', async () => {
  respond = () =>
    new Response(
      [
        HEADER,
        csvRow({ translationId: 'eng-kjv', Redistributable: 'False' }),
        csvRow({ translationId: 'eng-asv' }),
      ].join('\n')
    );

  assert.deepEqual(
    (await fetchUpstreamTranslations()).map((record) => record.translationId),
    ['eng-asv']
  );
});

test('the CSV parser tolerates a BOM, CRLF line endings, blank lines and padded cells', async () => {
  respond = () =>
    new Response(
      '﻿' +
        [
          HEADER,
          '',
          csvRow({ translationId: ' eng-asv ', languageCode: ' eng ' }),
          '',
          csvRow({ translationId: 'engwebp' }),
        ].join('\r\n') +
        '\r\n'
    );

  const records = await fetchUpstreamTranslations();

  assert.deepEqual(
    records.map((record) => [record.translationId, record.languageCode, record.isAvailable]),
    [
      ['eng-asv', 'eng', true],
      ['engwebp', 'eng', true],
    ]
  );
});

test('language names come from the known-code map, then the English name, then the code', async () => {
  respond = () =>
    new Response(
      [
        HEADER,
        csvRow({ translationId: 'a1', languageCode: 'spa', languageNameInEnglish: 'Castellano' }),
        csvRow({ translationId: 'a2', languageCode: 'qqa', languageNameInEnglish: 'Qaaish' }),
        csvRow({ translationId: 'a3', languageCode: 'qqb', languageNameInEnglish: 'Qéé' }),
        csvRow({ translationId: 'a4', languageCode: '', languageNameInEnglish: '' }),
      ].join('\n')
    );

  assert.deepEqual(
    (await fetchUpstreamTranslations()).map((record) => [record.languageCode, record.languageName]),
    [
      ['spa', 'Spanish'],
      ['qqa', 'Qaaish'],
      ['qqb', 'qqb'],
      ['und', 'Unknown'],
    ]
  );
});

test('a failed eBible response is reported with its status', async () => {
  respond = () => new Response('unavailable', { status: 503 });

  await assert.rejects(fetchUpstreamTranslations(), {
    message: 'Unable to load eBible translation feed (503)',
  });
});

test('a CSV with only a header, or nothing at all, yields no translations', async () => {
  for (const body of ['', HEADER, '\n\n']) {
    respond = () => new Response(body);
    assert.deepEqual(await fetchUpstreamTranslations(), []);
  }
});
