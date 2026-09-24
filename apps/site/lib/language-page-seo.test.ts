import assert from 'node:assert/strict';
import test from 'node:test';

import type { LanguageIndexEntry, LanguagePage } from './language-pages';
import {
  buildLanguageSitemap,
  LANGUAGE_SITEMAP_LIMIT,
  languagePageDescription,
  languagePageMetadata,
  languagePageStructuredData,
  languagePageTitle,
  languageSitemapIds,
  languageSitemapUrls,
} from './language-page-seo';
import { SHARE_IMAGE, serializeJsonLd } from './site-metadata';

const yoruba: LanguagePage = {
  slug: 'yoruba-yor',
  id: 'iso:yor',
  name: 'Yoruba',
  label: 'Yoruba',
  aliases: ['Yoruba: Ilaje'],
  iso6393: 'yor',
  glottocode: 'yoru1245',
  rolvCode: null,
  family: 'Atlantic-Congo',
  countries: [
    { code: 'NG', name: 'Nigeria' },
    { code: 'BJ', name: 'Benin' },
    { code: 'TG', name: 'Togo' },
  ],
  population: null,
  status: 'bible',
  sourceIds: ['glottolog'],
  dialects: [],
  projects: [],
  related: null,
};

test('the title names the language, and the description its place and Scripture status', () => {
  assert.equal(
    languagePageTitle(yoruba),
    'Yoruba language: Bible and Scripture status | EveryBible'
  );
  assert.equal(
    languagePageDescription(yoruba),
    'Yoruba is a language in the Atlantic-Congo family spoken in Nigeria, Benin and Togo. A complete Bible is reported in Yoruba. See its dialects and sources, and read the Bible free in the EveryBible app.'
  );
  const unknown = {
    ...yoruba,
    name: 'Agbirigba',
    label: 'Agbirigba',
    family: null,
    countries: [],
    status: 'unknown' as const,
  };
  assert.match(
    languagePageDescription(unknown),
    /^Agbirigba is a language\. Our sources record no known Scripture in Agbirigba\./
  );
  const widespread = {
    ...yoruba,
    countries: [...yoruba.countries, { code: 'GH', name: 'Ghana' }],
  };
  assert.match(languagePageDescription(widespread), /family spoken in 4 countries\./);
  assert.equal(
    languagePageTitle({ label: 'Aari (Nepal)' }),
    'Aari (Nepal) language: Bible and Scripture status | EveryBible'
  );
});

test('metadata gives each language page its own canonical URL and share card', () => {
  const metadata = languagePageMetadata(yoruba);
  assert.deepEqual(metadata.alternates, { canonical: '/languages/yoruba-yor' });
  assert.equal(metadata.title, languagePageTitle(yoruba));
  assert.equal(metadata.description, languagePageDescription(yoruba));
  assert.deepEqual(metadata.openGraph, {
    type: 'website',
    siteName: 'EveryBible',
    locale: 'en_US',
    url: '/languages/yoruba-yor',
    title: languagePageTitle(yoruba),
    description: languagePageDescription(yoruba),
    images: [SHARE_IMAGE],
  });
});

test('structured data describes the page, the language and its breadcrumb trail', () => {
  const data = languagePageStructuredData(yoruba, '2026-09-05');
  const [page, language, breadcrumb] = data['@graph'];
  assert.equal(page['@type'], 'WebPage');
  assert.equal(page.url, 'https://everybible.app/languages/yoruba-yor');
  assert.deepEqual(language, {
    '@type': 'Language',
    '@id': 'https://everybible.app/languages/yoruba-yor#language',
    name: 'Yoruba',
    alternateName: ['Yoruba: Ilaje'],
    identifier: [
      { '@type': 'PropertyValue', propertyID: 'ISO 639-3', value: 'yor' },
      { '@type': 'PropertyValue', propertyID: 'Glottocode', value: 'yoru1245' },
    ],
    sameAs: [
      'https://glottolog.org/resource/languoid/id/yoru1245',
      'https://iso639-3.sil.org/code/yor',
    ],
  });
  assert.deepEqual(
    (breadcrumb as { itemListElement: { item: string }[] }).itemListElement.map(
      (item) => item.item
    ),
    [
      'https://everybible.app/',
      'https://everybible.app/languages',
      'https://everybible.app/languages/yoruba-yor',
    ]
  );
  const hostile = languagePageStructuredData(
    { ...yoruba, name: '</script><script>alert(1)</script>' },
    '2026-09-05'
  );
  assert.doesNotMatch(serializeJsonLd(hostile), /<\/script>/);
});

const entry = (index: number, status: LanguageIndexEntry['status'] = 'unknown') => ({
  slug: `language-${index}`,
  label: `Language ${index}`,
  status,
  project: false,
});

test('language sitemaps list absolute URLs and split at the 50,000 URL limit', () => {
  assert.deepEqual(languageSitemapIds(9795), [{ id: 0 }]);
  assert.deepEqual(languageSitemapIds(0), [{ id: 0 }]);
  assert.deepEqual(languageSitemapIds(LANGUAGE_SITEMAP_LIMIT + 1), [{ id: 0 }, { id: 1 }]);
  assert.deepEqual(languageSitemapUrls(120_000), [
    'https://everybible.app/languages/sitemap/0.xml',
    'https://everybible.app/languages/sitemap/1.xml',
    'https://everybible.app/languages/sitemap/2.xml',
  ]);

  const entries = Array.from({ length: LANGUAGE_SITEMAP_LIMIT + 2 }, (_, index) =>
    entry(index, index === 0 ? 'bible' : 'unknown')
  );
  const lastModified = new Date('2026-09-05T00:00:00Z');
  const first = buildLanguageSitemap(entries, 0, lastModified);
  const second = buildLanguageSitemap(entries, 1, lastModified);
  assert.equal(first.length, LANGUAGE_SITEMAP_LIMIT);
  assert.deepEqual(
    second.map((item) => item.url),
    [
      `https://everybible.app/languages/language-${LANGUAGE_SITEMAP_LIMIT}`,
      `https://everybible.app/languages/language-${LANGUAGE_SITEMAP_LIMIT + 1}`,
    ]
  );
  assert.equal(first[0].priority, 0.6, 'languages with a Bible rank above the rest');
  assert.equal(first[1].priority, 0.4);
  assert.ok(first.every((item) => item.lastModified === lastModified));
});
