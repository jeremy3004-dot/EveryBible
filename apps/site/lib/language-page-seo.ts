import type { Metadata, MetadataRoute } from 'next';

import type { ScriptureStatus } from '../../admin/lib/language-atlas/types';
import { languageFamily, languageNoun } from './language-family';
import type { LanguageIndexEntry, LanguagePage } from './language-pages';
import { shouldPrerenderLanguage } from './language-pages';
import { LANGUAGES_PATH, languagePagePath } from './language-slug';
import { EVERYBIBLE_SITE_URL } from './site-links';
import { pageMetadata, SITE_NAME } from './site-metadata';

/** The sitemap protocol allows at most 50,000 URLs per file. */
export const LANGUAGE_SITEMAP_LIMIT = 50_000;

export const LANGUAGES_HUB_TITLE = 'Bible translation status by language | EveryBible';
export const LANGUAGES_HUB_DESCRIPTION =
  'Look up Scripture availability, dialects and where they are spoken for thousands of languages, from the Every Language research atlas.';

export const SCRIPTURE_STATUS_ORDER: readonly ScriptureStatus[] = [
  'bible',
  'nt',
  'portions',
  'started',
  'needed',
  'unknown',
];

/** Short status used in lists and badges; red means none known in the sources. */
export function scriptureStatusLabel(status: ScriptureStatus): string {
  return {
    bible: 'Complete Bible',
    nt: 'New Testament',
    portions: 'Portions of Scripture',
    started: 'Translation started',
    needed: 'Translation needed',
    unknown: 'No known Scripture',
  }[status];
}

export function scriptureStatusSentence(status: ScriptureStatus, name: string): string {
  return {
    bible: `A complete Bible is reported in ${name}.`,
    nt: `The New Testament is reported in ${name}.`,
    portions: `Portions of Scripture are reported in ${name}.`,
    started: `A Bible translation has started in ${name}.`,
    needed: `A Bible translation is needed in ${name}.`,
    unknown: `Our sources record no known Scripture in ${name}.`,
  }[status];
}

/** Up to three countries by name; beyond that the lists are long and unranked, so a count. */
function listCountries(page: Pick<LanguagePage, 'countries'>): string {
  const names = page.countries.map((country) => country.name);
  if (names.length > 3) return `${names.length} countries`;
  return names.length === 3 ? `${names[0]}, ${names[1]} and ${names[2]}` : names.join(' and ');
}

/** One plain sentence about what the language is and where it is spoken. */
export function languageIdentity(
  page: Pick<LanguagePage, 'name' | 'family' | 'countries'>
): string {
  const family = languageFamily(page.family);
  const inFamily = family ? ` in the ${family} family` : '';
  const where = page.countries.length ? ` spoken in ${listCountries(page)}` : '';
  return `${page.name} is ${languageNoun(page.family)}${inFamily}${where}.`;
}

/** Search results cut titles at about 60 characters and descriptions at about 160. */
export const TITLE_MAX_LENGTH = 60;
export const DESCRIPTION_MAX_LENGTH = 160;

/** The first candidate that fits, or the last (shortest) one when none does. */
function firstThatFits(candidates: readonly string[], limit: number): string {
  return candidates.find((candidate) => candidate.length <= limit) ?? candidates.at(-1)!;
}

/** Longer names drop words from the end of the title, never the name itself. */
export function languagePageTitle(page: Pick<LanguagePage, 'label'>): string {
  return firstThatFits(
    [
      `${page.label} language: Bible and Scripture status | ${SITE_NAME}`,
      `${page.label}: Bible and Scripture status | ${SITE_NAME}`,
      `${page.label}: Bible and Scripture status`,
      `${page.label}: Scripture status`,
    ],
    TITLE_MAX_LENGTH
  );
}

/** The facts always stay; the closing invitation shortens or goes to fit. */
export function languagePageDescription(page: LanguagePage): string {
  const facts = `${languageIdentity(page)} ${scriptureStatusSentence(page.status, page.name)}`;
  return firstThatFits(
    [
      `${facts} See its dialects and sources, and read the Bible free in the EveryBible app.`,
      `${facts} Read the Bible free on EveryBible.`,
      facts,
    ],
    DESCRIPTION_MAX_LENGTH
  );
}

export function languagePageMetadata(page: LanguagePage): Metadata {
  return pageMetadata({
    title: languagePageTitle(page),
    description: languagePageDescription(page),
    path: languagePagePath(page.slug),
  });
}

export function languagePageUrl(slug: string): string {
  return `${EVERYBIBLE_SITE_URL}${languagePagePath(slug)}`;
}

/** Public identifier pages for the codes shown on the language page. */
export function languageReferenceUrls(
  page: Pick<LanguagePage, 'glottocode' | 'iso6393' | 'rolvCode'>
): string[] {
  return [
    page.glottocode &&
      `https://glottolog.org/resource/languoid/id/${encodeURIComponent(page.glottocode)}`,
    page.iso6393 && `https://iso639-3.sil.org/code/${encodeURIComponent(page.iso6393)}`,
    page.rolvCode &&
      `https://globalrecordings.net/en/language/${encodeURIComponent(page.rolvCode)}`,
  ].filter((url): url is string => Boolean(url));
}

/**
 * schema.org JSON-LD: the page, the language it is about, and its breadcrumb
 * trail. Only atlas facts are stated; there is no rating or speaker estimate.
 */
export function languagePageStructuredData(page: LanguagePage, generatedAt: string) {
  const url = languagePageUrl(page.slug);
  const identifiers = [
    page.iso6393 && { '@type': 'PropertyValue', propertyID: 'ISO 639-3', value: page.iso6393 },
    page.glottocode && {
      '@type': 'PropertyValue',
      propertyID: 'Glottocode',
      value: page.glottocode,
    },
    page.rolvCode && { '@type': 'PropertyValue', propertyID: 'ROLV', value: page.rolvCode },
  ].filter(Boolean);
  const sameAs = languageReferenceUrls(page);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: languagePageTitle(page),
        description: languagePageDescription(page),
        inLanguage: 'en',
        dateModified: generatedAt,
        isPartOf: {
          '@type': 'WebSite',
          '@id': `${EVERYBIBLE_SITE_URL}/#website`,
          name: SITE_NAME,
          url: `${EVERYBIBLE_SITE_URL}/`,
        },
        about: { '@id': `${url}#language` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
      {
        '@type': 'Language',
        '@id': `${url}#language`,
        name: page.name,
        ...(page.aliases.length ? { alternateName: page.aliases } : {}),
        ...(identifiers.length ? { identifier: identifiers } : {}),
        ...(sameAs.length ? { sameAs } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${EVERYBIBLE_SITE_URL}/` },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Languages',
            item: `${EVERYBIBLE_SITE_URL}${LANGUAGES_PATH}`,
          },
          { '@type': 'ListItem', position: 3, name: page.label, item: url },
        ],
      },
    ],
  };
}

/** Sitemap file ids for /languages/sitemap/<id>.xml; one file per 50,000 languages. */
export function languageSitemapIds(languageCount: number): { id: number }[] {
  return Array.from(
    { length: Math.max(1, Math.ceil(languageCount / LANGUAGE_SITEMAP_LIMIT)) },
    (_, id) => ({
      id,
    })
  );
}

export function languageSitemapUrls(languageCount: number): string[] {
  return languageSitemapIds(languageCount).map(
    ({ id }) => `${EVERYBIBLE_SITE_URL}${LANGUAGES_PATH}/sitemap/${id}.xml`
  );
}

export function buildLanguageSitemap(
  entries: readonly LanguageIndexEntry[],
  id: number,
  lastModified: Date
): MetadataRoute.Sitemap {
  return entries
    .slice(id * LANGUAGE_SITEMAP_LIMIT, (id + 1) * LANGUAGE_SITEMAP_LIMIT)
    .map((entry) => ({
      url: languagePageUrl(entry.slug),
      lastModified,
      changeFrequency: 'monthly',
      priority: shouldPrerenderLanguage(entry) ? 0.6 : 0.4,
    }));
}
